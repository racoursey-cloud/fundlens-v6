/**
 * FundLens v6 — EDGAR NPORT-P Parser
 *
 * Fetches and parses SEC EDGAR NPORT-P filings to extract complete fund
 * holdings data. This is the authoritative source for what a mutual fund
 * actually owns — straight from regulatory filings.
 *
 * Flow: ticker → CIK (via company_tickers_mf.json) → latest NPORT-P filing
 *       → parse XML → structured holdings array
 *
 * Session 2 deliverable. References: Master Reference §4, §5, §8 step 2.
 *
 * NPORT-P filings are quarterly. Each filing contains every holding in the
 * fund with its CUSIP, value, and percentage of net assets.
 */

import { parseStringPromise } from 'xml2js';
import { EDGAR, PIPELINE } from './constants.js';
import {
  EdgarHolding,
  EdgarFilingMeta,
  EdgarFilingResult,
  MutualFundTickerEntry,
  PipelineStepResult,
  delay,
} from './types.js';

// ─── Module-Level Cache ─────────────────────────────────────────────────────
// The mutual fund ticker file (~3MB) is fetched once and reused for all lookups
// within a single pipeline run. Cleared on server restart.
let tickerLookupCache: Map<string, MutualFundTickerEntry> | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Main entry point: given a mutual fund ticker, fetch and parse its latest
 * NPORT-P filing from SEC EDGAR.
 *
 * Returns ALL holdings in the filing (cutoff logic is in holdings.ts).
 */
export async function fetchEdgarHoldings(
  ticker: string
): Promise<PipelineStepResult<EdgarFilingResult>> {
  const start = Date.now();

  try {
    // Step 1: Resolve ticker to CIK and series ID
    const tickerEntry = await lookupTickerCik(ticker);
    if (!tickerEntry) {
      console.error(`[edgar] ${ticker}: not found in SEC mutual fund ticker list`);
      return {
        success: false,
        data: null,
        error: `Ticker "${ticker}" not found in SEC mutual fund ticker list`,
        durationMs: Date.now() - start,
      };
    }
    console.log(`[edgar] ${ticker}: CIK ${tickerEntry.cik}, series ${tickerEntry.seriesId}`);

    await delay(PIPELINE.API_CALL_DELAY_MS);

    // Step 2: Find NPORT-P filing candidates for this CIK
    const candidates = await findNportFilingCandidates(tickerEntry.cik.toString());
    if (candidates.length === 0) {
      console.error(`[edgar] ${ticker}: no NPORT-P filings found for CIK ${tickerEntry.cik}`);
      return {
        success: false,
        data: null,
        error: `No NPORT-P filing found for CIK ${tickerEntry.cik} (${ticker})`,
        durationMs: Date.now() - start,
      };
    }
    console.log(`[edgar] ${ticker}: found ${candidates.length} NPORT-P candidate(s) for CIK ${tickerEntry.cik}`);

    // Step 3: Fetch each candidate's XML and verify seriesId matches this fund.
    // The SEC submissions index doesn't include seriesId, so we must check the
    // XML itself. For single-series CIKs this matches on the first try. For
    // large families (Fidelity, Vanguard) we may need to check a few filings.
    let matchedFiling: FilingIndexEntry | null = null;
    let matchedXml: string | null = null;

    for (const candidate of candidates) {
      await delay(PIPELINE.API_CALL_DELAY_MS);

      const xml = await fetchFilingXml(
        tickerEntry.cik.toString(),
        candidate.accessionNumber,
        candidate.primaryDoc
      );
      if (!xml) {
        console.warn(`[edgar] ${ticker}: failed to fetch XML for candidate ${candidate.accessionNumber}, skipping`);
        continue;
      }

      // Quick seriesId check on the raw XML header (avoids full parse)
      const filingSeriesId = extractSeriesIdFromXml(xml);
      if (filingSeriesId && tickerEntry.seriesId && filingSeriesId !== tickerEntry.seriesId) {
        console.log(`[edgar] ${ticker}: candidate ${candidate.accessionNumber} is series ${filingSeriesId}, need ${tickerEntry.seriesId} — skipping`);
        continue;
      }

      console.log(`[edgar] ${ticker}: matched filing ${candidate.accessionNumber} (series ${filingSeriesId || 'unknown'}), ${xml.length} chars`);
      matchedFiling = candidate;
      matchedXml = xml;
      break;
    }

    if (!matchedFiling || !matchedXml) {
      console.error(`[edgar] ${ticker}: none of ${candidates.length} NPORT-P candidates matched series ${tickerEntry.seriesId}`);
      return {
        success: false,
        data: null,
        error: `No NPORT-P filing matched series ${tickerEntry.seriesId} for ${ticker} (CIK ${tickerEntry.cik}, checked ${candidates.length} candidates)`,
        durationMs: Date.now() - start,
      };
    }

    // Step 4: Parse the matched XML into structured data
    const result = await parseNportXml(matchedXml, tickerEntry, matchedFiling);

    return {
      success: true,
      data: result,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[edgar] ${ticker}: CAUGHT ERROR — ${message}`);
    return {
      success: false,
      data: null,
      error: `EDGAR pipeline failed for ${ticker}: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Step 1: Ticker → CIK Lookup ───────────────────────────────────────────

/**
 * Loads the SEC's mutual fund ticker-to-CIK mapping file and caches it.
 * This file contains every registered mutual fund with its CIK, series ID,
 * class ID, and ticker symbol.
 *
 * Source: https://www.sec.gov/files/company_tickers_mf.json
 */
async function loadTickerLookup(): Promise<Map<string, MutualFundTickerEntry>> {
  if (tickerLookupCache) return tickerLookupCache;

  const url = 'https://www.sec.gov/files/company_tickers_mf.json';
  console.log(`[edgar] Fetching SEC ticker lookup from ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': EDGAR.USER_AGENT },
  });
  console.log(`[edgar] SEC ticker lookup response: HTTP ${response.status}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch mutual fund tickers: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    fields: string[];
    data: Array<[number, string, string, string]>;
  };

  // SEC file is columnar: fields = ["cik","seriesId","classId","symbol"]
  // data = [[cik, seriesId, classId, symbol], ...]
  const map = new Map<string, MutualFundTickerEntry>();

  for (const row of data.data) {
    const symbol = row[3];
    if (symbol) {
      map.set(symbol.toUpperCase(), {
        cik: row[0],
        seriesId: row[1] || '',
        classId: row[2] || '',
        symbol: symbol.toUpperCase(),
      });
    }
  }

  tickerLookupCache = map;
  return map;
}

/**
 * Look up a single ticker's CIK and series info.
 */
async function lookupTickerCik(
  ticker: string
): Promise<MutualFundTickerEntry | null> {
  const lookup = await loadTickerLookup();
  return lookup.get(ticker.toUpperCase()) || null;
}

// ─── Step 2: Find Latest NPORT-P Filing ─────────────────────────────────────

interface FilingIndexEntry {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  primaryDoc: string;
  form: string;
}

/**
 * Queries EDGAR's submissions API to find NPORT-P filing candidates for a
 * given CIK, ordered most-recent-first.
 *
 * Returns up to `maxCandidates` filings because the submissions index does
 * NOT include a seriesId field. Large fund families (e.g. Fidelity, Vanguard)
 * file multiple NPORT-Ps under the same CIK — one per series. The caller
 * must fetch each candidate's XML and check genInfo > seriesId to find the
 * correct fund.
 *
 * The submissions endpoint returns the fund's filing history as columnar
 * arrays (accessionNumber[], form[], filingDate[], primaryDocument[]).
 */
async function findNportFilingCandidates(
  cik: string,
  maxCandidates: number = 10
): Promise<FilingIndexEntry[]> {
  // Pad CIK to 10 digits with leading zeros (SEC requires this format)
  const paddedCik = cik.padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  const response = await fetch(url, {
    headers: { 'User-Agent': EDGAR.USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`EDGAR submissions API returned HTTP ${response.status} for CIK ${cik}`);
  }

  const data = await response.json();

  const candidates: FilingIndexEntry[] = [];

  // Recent filings are in data.filings.recent (columnar format)
  const recent = data.filings?.recent;
  if (recent?.form) {
    // Walk the filings array to collect NPORT-P or NPORT-P/A entries
    // (NPORT-P/A is an amended filing — treat it the same)
    for (let i = 0; i < recent.form.length && candidates.length < maxCandidates; i++) {
      const form: string = recent.form[i];
      if (form === 'NPORT-P' || form === 'NPORT-P/A') {
        candidates.push({
          accessionNumber: recent.accessionNumber[i],
          filingDate: recent.filingDate[i],
          reportDate: recent.reportDate[i] || recent.filingDate[i],
          primaryDoc: recent.primaryDocument[i],
          form,
        });
      }
    }
  }

  // If we haven't filled our candidates from recent, check the older filings
  // (EDGAR paginates large histories into separate JSON files)
  if (candidates.length < maxCandidates) {
    const olderFiles = data.filings?.files;
    if (olderFiles && olderFiles.length > 0) {
      for (const file of olderFiles) {
        if (candidates.length >= maxCandidates) break;

        const olderUrl = `https://data.sec.gov/submissions/${file.name}`;

        await delay(PIPELINE.API_CALL_DELAY_MS);

        const olderResponse = await fetch(olderUrl, {
          headers: { 'User-Agent': EDGAR.USER_AGENT },
        });

        if (!olderResponse.ok) continue;

        const olderData = await olderResponse.json();

        for (let i = 0; i < (olderData.form?.length || 0) && candidates.length < maxCandidates; i++) {
          const form: string = olderData.form[i];
          if (form === 'NPORT-P' || form === 'NPORT-P/A') {
            candidates.push({
              accessionNumber: olderData.accessionNumber[i],
              filingDate: olderData.filingDate[i],
              reportDate: olderData.reportDate[i] || olderData.filingDate[i],
              primaryDoc: olderData.primaryDocument[i],
              form,
            });
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Extract the seriesId from raw NPORT-P XML without a full parse.
 * The seriesId lives in <genInfo><seriesId>S000006027</seriesId></genInfo>.
 * Using a regex on the first 5KB is much cheaper than parsing multi-MB XML
 * just to check if it's the right fund.
 */
function extractSeriesIdFromXml(xml: string): string | null {
  // Only need to search the header area — seriesId is in genInfo near the top
  const header = xml.substring(0, 5000);
  const match = header.match(/<seriesId>\s*(S\d+)\s*<\/seriesId>/);
  return match ? match[1] : null;
}

// ─── Step 3: Fetch Filing XML ───────────────────────────────────────────────

/**
 * Constructs the URL for an NPORT-P XML filing and fetches it.
 *
 * URL pattern: https://www.sec.gov/Archives/edgar/data/{CIK}/{accession-no-dashes}/{filename}
 * The accession number has dashes removed in the URL path.
 */
async function fetchFilingXml(
  cik: string,
  accessionNumber: string,
  primaryDoc: string
): Promise<string | null> {
  // Remove dashes from accession number for the URL path
  const accessionPath = accessionNumber.replace(/-/g, '');

  // The SEC submissions API sometimes returns primaryDocument as an XSL-transformed
  // HTML path (e.g. "xslFormNPORT-P_X01/primary_doc.xml") instead of the raw XML.
  // Strip any leading directory prefix to get just the filename (e.g. "primary_doc.xml"),
  // which lives at the filing root and contains the actual parseable NPORT-P XML.
  const xmlFilename = primaryDoc.includes('/') ? primaryDoc.split('/').pop()! : primaryDoc;
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}/${xmlFilename}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': EDGAR.USER_AGENT },
  });

  if (!response.ok) {
    console.error(`[edgar] Failed to fetch filing XML: HTTP ${response.status} from ${url}`);
    return null;
  }

  return response.text();
}

// ─── Step 4: Parse NPORT-P XML ──────────────────────────────────────────────

/**
 * Parses the NPORT-P XML document and extracts all holdings.
 *
 * NPORT-P XML has this general structure:
 *   <edgarSubmission>
 *     <formData>
 *       <genInfo> ... fund metadata ... </genInfo>
 *       <fundInfo> ... fund-level financials ... </fundInfo>
 *       <invstOrSecs>
 *         <invstOrSec> ... individual holding ... </invstOrSec>
 *         <invstOrSec> ... </invstOrSec>
 *         ...
 *       </invstOrSecs>
 *     </formData>
 *   </edgarSubmission>
 *
 * The XML namespace and exact structure can vary slightly between filings,
 * so we use flexible path resolution with fallbacks.
 */
async function parseNportXml(
  xml: string,
  tickerEntry: MutualFundTickerEntry,
  filingIndex: FilingIndexEntry
): Promise<EdgarFilingResult> {
  // xml2js parses into a nested object. Arrays are used for all elements
  // (even single-occurrence ones) — so we always access [0] for single values.
  const parsed = await parseStringPromise(xml, {
    explicitArray: true,
    ignoreAttrs: false,
    tagNameProcessors: [stripNamespace],
  });

  // Navigate to the formData node (may be under edgarSubmission or root)
  const formData = resolveFormData(parsed);
  if (!formData) {
    throw new Error('Could not find formData in NPORT-P XML');
  }

  // Extract filing metadata
  const meta = extractFilingMeta(formData, tickerEntry, filingIndex);

  // Extract all holdings
  const holdings = extractHoldings(formData);

  return {
    meta,
    holdings,
    totalHoldingsCount: holdings.length,
  };
}

/**
 * Strip XML namespace prefixes so we can access elements by local name.
 * e.g. "nport:invstOrSec" → "invstOrSec"
 */
function stripNamespace(name: string): string {
  const idx = name.indexOf(':');
  return idx >= 0 ? name.substring(idx + 1) : name;
}

/**
 * Navigate the parsed XML to find the formData node, handling different
 * XML structures across filing versions.
 */
function resolveFormData(parsed: Record<string, unknown>): Record<string, unknown> | null {
  // Try: edgarSubmission > formData
  // xml2js v0.6.2 returns the root element as a direct object (not array-wrapped),
  // while child elements ARE wrapped in arrays when explicitArray: true.
  // Handle both cases for safety.
  const rawRoot = parsed['edgarSubmission'];
  const root = Array.isArray(rawRoot) ? rawRoot[0] : rawRoot;
  if (root && typeof root === 'object') {
    const rawFd = (root as Record<string, unknown>)['formData'];
    const fd = Array.isArray(rawFd) ? rawFd[0] : rawFd;
    if (fd && typeof fd === 'object') return fd as Record<string, unknown>;
  }

  // Try direct formData at root (some filings omit edgarSubmission wrapper)
  const rawDirectFd = parsed['formData'];
  const directFd = Array.isArray(rawDirectFd) ? rawDirectFd[0] : rawDirectFd;
  if (directFd && typeof directFd === 'object') return directFd as Record<string, unknown>;

  // Try: root has a single key wrapping everything
  const keys = Object.keys(parsed);
  if (keys.length === 1) {
    const rawWrapper = parsed[keys[0]];
    const wrapper = Array.isArray(rawWrapper) ? rawWrapper[0] : rawWrapper;
    if (wrapper && typeof wrapper === 'object') {
      const rawFd = (wrapper as Record<string, unknown>)['formData'];
      const fd = Array.isArray(rawFd) ? rawFd[0] : rawFd;
      if (fd && typeof fd === 'object') return fd as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Extract filing metadata from the genInfo and fundInfo sections.
 */
function extractFilingMeta(
  formData: Record<string, unknown>,
  tickerEntry: MutualFundTickerEntry,
  filingIndex: FilingIndexEntry
): EdgarFilingMeta {
  const genInfo = getChild(formData, 'genInfo');
  const fundInfo = getChild(formData, 'fundInfo');

  // Extract total net assets from fundInfo
  let totalNetAssets: number | null = null;
  if (fundInfo) {
    const totAssets = getTextValue(fundInfo, 'totAssets');
    const totLiabs = getTextValue(fundInfo, 'totLiabs');
    if (totAssets && totLiabs) {
      totalNetAssets = parseFloat(totAssets) - parseFloat(totLiabs);
    } else {
      const netAssets = getTextValue(fundInfo, 'netAssets');
      if (netAssets) totalNetAssets = parseFloat(netAssets);
    }
  }

  // Try to get registrant name from genInfo
  let registrantName = '';
  if (genInfo) {
    registrantName =
      getTextValue(genInfo, 'regName') ||
      getTextValue(genInfo, 'seriesName') ||
      '';
  }

  // Series name
  let seriesName = '';
  if (genInfo) {
    seriesName = getTextValue(genInfo, 'seriesName') || '';
  }

  return {
    cik: tickerEntry.cik.toString(),
    registrantName,
    seriesId: tickerEntry.seriesId,
    seriesName,
    filingDate: filingIndex.filingDate,
    reportDate: filingIndex.reportDate,
    accessionNumber: filingIndex.accessionNumber,
    totalNetAssets,
    expenseRatio: null, // Expense ratio is not reliably in NPORT-P; use FMP or fund profile
  };
}

/**
 * Extract all holdings from the invstOrSecs section of the NPORT-P filing.
 *
 * Each <invstOrSec> element represents one holding with:
 * - name, cusip, isin, lei, title
 * - valUSD (value in dollars)
 * - pctVal (percentage of net assets)
 * - assetCat (asset category)
 * - balance, units
 * - invCountry (country of issuer)
 * - isInvestmentCompany (fund-of-funds flag via investOrSec condCat)
 */
function extractHoldings(
  formData: Record<string, unknown>
): EdgarHolding[] {
  const invstOrSecs = getChild(formData, 'invstOrSecs');
  if (!invstOrSecs) return [];

  const items = (invstOrSecs['invstOrSec'] as Record<string, unknown>[]) || [];
  const holdings: EdgarHolding[] = [];

  for (const item of items) {
    const holding = parseHoldingElement(item);
    if (holding) {
      holdings.push(holding);
    }
  }

  return holdings;
}

/**
 * Parse a single <invstOrSec> XML element into an EdgarHolding.
 * Skips holdings with no CUSIP (these are typically cash, derivatives, or
 * other non-equity positions we can't score).
 */
function parseHoldingElement(
  item: Record<string, unknown>
): EdgarHolding | null {
  const cusip = getTextValue(item, 'cusip');
  // Skip holdings without a CUSIP — can't resolve to a ticker
  if (!cusip || cusip === '000000000' || cusip.trim() === '') {
    return null;
  }

  const name = getTextValue(item, 'name') || '';
  const title = getTextValue(item, 'title') || name;
  const isin = getTextValue(item, 'isin') || null;
  const lei = getTextValue(item, 'lei') || null;

  // Value in USD
  const valUsdStr = getTextValue(item, 'valUSD');
  const valueUsd = valUsdStr ? parseFloat(valUsdStr) : 0;

  // Percentage of NAV (reported as decimal, e.g. 0.07 = 7%)
  const pctValStr = getTextValue(item, 'pctVal');
  const pctOfNav = pctValStr ? parseFloat(pctValStr) : 0;

  // Asset category — can be in different locations
  const assetCategory =
    getTextValue(item, 'assetCat') ||
    getTextValue(item, 'assetCondCat') ||
    getDeepTextValue(item, ['assetCat', 'assetCatCondensed']) ||
    null;

  // Issuer category
  const issuerCategory = getTextValue(item, 'issuerCat') || null;

  // Balance and units
  const balanceStr = getTextValue(item, 'balance');
  const balance = balanceStr ? parseFloat(balanceStr) : null;
  const balanceUnits = getTextValue(item, 'units') || null;

  // Country of issuer
  const countryOfIssuer =
    getTextValue(item, 'invCountry') ||
    getTextValue(item, 'countryOfIssuer') ||
    null;

  // Fund-of-funds detection: check if the holding is itself a fund
  // NPORT-P marks these with <isRestrictedSec> N and specific asset categories,
  // or we check for asset category codes that indicate investment companies
  const isInvestmentCompany = detectInvestmentCompany(item, assetCategory);

  return {
    name,
    cusip,
    isin,
    lei,
    title,
    valueUsd,
    pctOfNav,
    assetCategory,
    issuerCategory,
    balance,
    balanceUnits,
    countryOfIssuer,
    isInvestmentCompany,
  };
}

/**
 * Detect whether a holding is itself an investment company (fund-of-funds).
 *
 * NPORT-P filings use a few signals:
 * 1. Asset category "IC" (Investment Company)
 * 2. The presence of an <investCompany> or <invstCompany> sub-element
 * 3. Issuer category indicating a registered fund
 */
function detectInvestmentCompany(
  item: Record<string, unknown>,
  assetCategory: string | null
): boolean {
  // Check asset category
  if (assetCategory === 'IC' || assetCategory === 'AIC') {
    return true;
  }

  // Check for investCompany sub-element (NPORT-P schema)
  if (getChild(item, 'investCompany') || getChild(item, 'invstCompany')) {
    return true;
  }

  // Check issuer type
  const issuerCat = getTextValue(item, 'issuerCat');
  if (issuerCat === 'FUND' || issuerCat === 'IC') {
    return true;
  }

  return false;
}

// ─── XML Utility Helpers ────────────────────────────────────────────────────
// xml2js wraps everything in arrays. These helpers navigate the structure.

/** Get a child object from a parsed XML node. */
function getChild(
  node: Record<string, unknown>,
  childName: string
): Record<string, unknown> | null {
  const child = node[childName];
  if (Array.isArray(child) && child.length > 0) {
    return child[0] as Record<string, unknown>;
  }
  return null;
}

/** Get a text value from a parsed XML node. Handles both string and nested text. */
function getTextValue(
  node: Record<string, unknown>,
  fieldName: string
): string | null {
  const field = node[fieldName];
  if (!field) return null;

  if (Array.isArray(field)) {
    const first = field[0];
    if (typeof first === 'string') return first.trim();
    if (typeof first === 'object' && first !== null) {
      // Handle case where text is in _ property (xml2js with attributes)
      const textObj = first as Record<string, unknown>;
      if (typeof textObj['_'] === 'string') return textObj['_'].trim();
    }
    return null;
  }

  if (typeof field === 'string') return field.trim();
  return null;
}

/** Try multiple nested paths to find a text value. */
function getDeepTextValue(
  node: Record<string, unknown>,
  path: string[]
): string | null {
  let current: Record<string, unknown> | null = node;
  for (const segment of path) {
    if (!current) return null;
    current = getChild(current, segment);
  }
  if (current) {
    // If we've navigated to a leaf, try to get its text
    const keys = Object.keys(current);
    for (const key of keys) {
      if (key === '_' || key === '$') continue;
      const val = getTextValue(current, key);
      if (val) return val;
    }
  }
  return null;
}

// ─── Cache Management ───────────────────────────────────────────────────────

/** Clear the in-memory ticker lookup cache (useful for testing or long-running processes) */
export function clearTickerCache(): void {
  tickerLookupCache = null;
}
