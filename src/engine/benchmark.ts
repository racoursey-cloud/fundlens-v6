/**
 * FundLens v7 — A5 Task 7: Haiku classification benchmark (report-only)
 *
 * Measure, don't assume. Samples equities that carry FMP-sourced industry
 * labels — companies Haiku never touched in production (they resolved via
 * FMP first, so they are out-of-sample by construction) — and runs each
 * through the EXACT production classification prompts as if unlabeled:
 * classifyHoldingSectors and classifyHoldingIndustries from classify.ts,
 * sequential with the mandated PIPELINE.CLAUDE_CALL_DELAY_MS delays.
 *
 * Reports sector-level and industry-level (159-menu) agreement vs the FMP
 * label, plus the full disagreement list. The measured number is the cited
 * basis for the fund card's Line 2 vocabulary (Decision 2). Cost ceiling:
 * a few hundred Haiku classifications in batches of 25 — well under $1.
 *
 * Triggered by the admin-only POST /api/benchmark/classification (Task 4
 * gating); the report is emailed to Robert via the admin-alert path and
 * logged. TEMPORARY: this module and its endpoint are removed once the
 * Task 7 report is filed.
 *
 * MANDATORY: all Claude calls sequential with delays — inherited from
 * classify.ts, which never uses Promise.all().
 */

import { PIPELINE } from './constants.js';
import { supaSelect } from './supabase.js';
import { getFmpCache } from './cache.js';
import { classifyHoldingSectors, classifyHoldingIndustries } from './classify.js';
import { mapFmpSector } from './pipeline.js';
import { sendAdminAlert } from './admin-alert.js';
import { FMP_INDUSTRY_SET } from './industries.js';
import { delay, ResolvedHolding } from './types.js';

// One benchmark at a time — it makes a few hundred Claude calls.
let benchmarkRunning = false;

export interface BenchmarkStatus {
  started: boolean;
  reason?: string;
}

interface SampleRow {
  ticker: string;
  name: string;
  fmpIndustry: string;
  fmpSector: string | null; // mapped to our taxonomy, null if unmappable
}

/** Minimal equity ResolvedHolding for the production classifiers. */
function benchHolding(ticker: string, name: string): ResolvedHolding {
  return {
    name,
    cusip: '',
    ticker,
    pctOfNav: 0,
    valueUsd: 0,
    assetCategory: 'EC',
    countryOfIssuer: null,
    sector: null,
    isLookThrough: false,
    parentFundName: null,
    isDebt: false,
    issuerCategory: null,
    fairValLevel: null,
    debtIsDefault: null,
    debtInArrears: null,
    isInvestmentCompany: false,
  };
}

/**
 * Kick off the benchmark asynchronously. Returns immediately; the report
 * arrives by admin email when the sequential classification finishes
 * (~400 holdings ÷ 25 per batch × 2 passes ≈ 32 Haiku calls, a few minutes).
 */
export function startClassificationBenchmark(sampleTarget = 400): BenchmarkStatus {
  if (benchmarkRunning) {
    return { started: false, reason: 'A benchmark is already running.' };
  }
  benchmarkRunning = true;
  const clamped = Math.max(50, Math.min(500, sampleTarget));

  runBenchmark(clamped)
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[benchmark] Failed: ${msg}`);
      sendAdminAlert(
        'A5 Task 7 benchmark FAILED',
        `The classification benchmark stopped with an error: <strong>${msg}</strong>. ` +
        `Nothing was changed anywhere — the benchmark is read-only. Re-run it from the Pipeline tab.`
      ).catch(() => {});
    })
    .finally(() => {
      benchmarkRunning = false;
    });

  return { started: true };
}

async function runBenchmark(sampleTarget: number): Promise<void> {
  console.log(`[benchmark] A5 Task 7: starting classification benchmark (target ${sampleTarget} equities)`);

  // ── 1. Sample FMP-labeled equities from holdings_cache (out-of-sample:
  //       Haiku never classified these in production) ──
  const { data: rows, error } = await supaSelect<Array<{
    ticker: string | null;
    name: string;
    industry: string | null;
  }>>('holdings_cache', {
    industry_source: 'eq.fmp',
    ticker: 'not.is.null',
    select: 'ticker,name,industry',
    limit: '2000',
  });

  if (error || !rows || rows.length === 0) {
    throw new Error(`No FMP-labeled holdings found to sample (${error || 'empty result'})`);
  }

  // Dedupe by ticker (cross-fund overlap), keep the first name seen
  const byTicker = new Map<string, { name: string; industry: string }>();
  for (const r of rows) {
    if (!r.ticker || !r.industry) continue;
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, { name: r.name, industry: r.industry });
  }

  // ── 2. FMP profiles (from the existing cache, batched) give the FMP
  //       sector for the sector-level comparison ──
  const tickers = [...byTicker.keys()];
  const profiles = await getFmpCache(tickers);

  const pool: SampleRow[] = [];
  for (const [ticker, info] of byTicker) {
    const prof = profiles.get(ticker)?.profile;
    pool.push({
      ticker,
      name: info.name,
      fmpIndustry: info.industry,
      fmpSector: mapFmpSector(prof?.sector) ?? null,
    });
  }

  // Shuffle, then take the sample (Fisher–Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sample = pool.slice(0, sampleTarget);
  const withSector = sample.filter(s => s.fmpSector !== null);
  console.log(
    `[benchmark] Sampled ${sample.length} equities (${withSector.length} also have a mappable FMP sector; ` +
    `pool was ${pool.length} unique FMP-labeled tickers)`
  );

  // ── 3. Production sector pass (exact prompt, sequential, 1.2s delays) ──
  const sectorHoldings = sample.map(s => benchHolding(s.ticker, s.name));
  await classifyHoldingSectors(sectorHoldings);

  await delay(PIPELINE.CLAUDE_CALL_DELAY_MS);

  // ── 4. Production industry pass (exact prompt + retry, sequential) ──
  const industryHoldings = sample.map(s => benchHolding(s.ticker, s.name));
  await classifyHoldingIndustries(industryHoldings);

  // ── 5. Score agreement ──
  let sectorAgree = 0, sectorDisagree = 0;
  let industryAgree = 0, industryDisagree = 0, industryOffMenuFmp = 0;
  const sectorMisses: string[] = [];
  const industryMisses: string[] = [];

  for (let i = 0; i < sample.length; i++) {
    const s = sample[i];
    const haikuSector = sectorHoldings[i].sector;
    const haikuIndustry = industryHoldings[i].industry;

    if (s.fmpSector && haikuSector) {
      if (haikuSector === s.fmpSector) sectorAgree++;
      else {
        sectorDisagree++;
        sectorMisses.push(`${s.ticker} "${s.name}": FMP=${s.fmpSector} vs Haiku=${haikuSector}`);
      }
    }

    if (!FMP_INDUSTRY_SET.has(s.fmpIndustry)) {
      industryOffMenuFmp++; // FMP label itself is off the pinned 159 menu
    } else if (haikuIndustry) {
      if (haikuIndustry === s.fmpIndustry) industryAgree++;
      else {
        industryDisagree++;
        industryMisses.push(`${s.ticker} "${s.name}": FMP=${s.fmpIndustry} vs Haiku=${haikuIndustry}`);
      }
    }
  }

  const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) : 'n/a');
  const sectorTotal = sectorAgree + sectorDisagree;
  const industryTotal = industryAgree + industryDisagree;

  const summary =
    `A5 Task 7 classification benchmark — ${sample.length} out-of-sample FMP-labeled equities\n` +
    `Sector-level agreement:   ${sectorAgree}/${sectorTotal} = ${pct(sectorAgree, sectorTotal)}%\n` +
    `Industry-level agreement (159 menu): ${industryAgree}/${industryTotal} = ${pct(industryAgree, industryTotal)}%\n` +
    `FMP labels off the pinned menu (excluded): ${industryOffMenuFmp}`;

  console.log(`[benchmark] ${summary.replace(/\n/g, ' · ')}`);

  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const listHtml = (title: string, items: string[]) =>
    `<h3>${title} (${items.length})</h3>` +
    (items.length ? `<ul>${items.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p>None.</p>');

  await sendAdminAlert(
    'A5 Task 7 benchmark report: Haiku classification agreement',
    `<pre>${esc(summary)}</pre>` +
    `<p>The disagreement lists below are the raw material for the report's ` +
    `arguable-vs-plainly-wrong split and for Decision 2 (Line 2 vocabulary).</p>` +
    listHtml('Sector disagreements', sectorMisses) +
    listHtml('Industry disagreements', industryMisses)
  );

  console.log('[benchmark] Report emailed via admin-alert');
}
