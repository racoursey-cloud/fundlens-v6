/**
 * FundLens — Fund Detail (B4 c2; reshaped by B9 c9; unified U1-B)
 *
 * The inline expansion beneath a Funds grid row, shared by both tiers since
 * U1-A. Chart-forward
 * and facts-only: colors and charts show what a fund IS, never whether
 * it's good. No factor bars, no tier badge, no evaluative word or color
 * anywhere. (B4's "no Overview tab" sentence is superseded by the ratified
 * B9 order: the expansion now opens on an About tab carrying the fund's
 * own SEC-filed description — verbatim, in a quote block with attribution
 * — which is information, not evaluation.)
 *
 * Tabs: About | Holdings | Sectors — About first and default — plus, for a
 * full-tier account only, Scores (U1-B: the FundLens evaluative content
 * re-homed as a module; the tab exists only where the evaluative payload
 * arrived, which the B2 allowlist makes impossible for a member).
 *   - About: the description box (Investment Objective and Principal
 *     Investment Strategies verbatim via SourceQuote; the flag-gated
 *     Translation via OurVoice when the server serves it), thin rule
 *     lines between sections, "Show the full strategies" expander past
 *     ~900 characters (collapsing is furniture — the text behind it is
 *     always complete). Money-market funds render About too — their
 *     existing no-holdings-report line lives inside it (B9: MM funds get
 *     the About tab; Holdings/Sectors would have nothing truthful to add,
 *     so MM shows About alone).
 *   - Holdings: the full filed list (?all=1 — the server lifts the 50-row
 *     cap), count line, negative rows as filed with the not-an-error
 *     explainer.
 *   - Sectors (U1-B: reshaped around the shared FundExposurePanel): sector
 *     bars left, the sector donut centre, that sector's holdings right,
 *     from the payload's sector_exposure map — never a recomputation from
 *     holdings rows, binding build fact. The Holdings donut (top 8 positive
 *     + "Everything else" at true combined weight) sits below, unchanged.
 *     Long-only disclosure when any negative row exists; sector-donut
 *     geometry normalized when the filed map sums past 100 while the bars
 *     print the filed values with the over-100 explainer; clicking a sector
 *     — bar or wedge — filters the holdings column to it.
 *
 * Honest empty state: a non-money-market fund with a null
 * as_of.report_date keeps holdings/sector surfaces hidden (FSPGX-trigger
 * ruling, July 28, 2026) — About still renders, because the seeded
 * description does not depend on the pipeline.
 *
 * Data: the fund object arrives from the grid (the tier-shaped
 * /api/scores payload, description included); holdings come from
 * fetchReferenceFundDetailFull — one fetch feeds the table, the holdings
 * donut, and the sector drill.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  fetchHoldingCompany,
  fetchReferenceFundDetailFull,
  type CompanyPanel,
  type ReferenceFund,
  type ReferenceHolding,
} from '../../api';
import { DonutChart, type DonutSlice } from '../../components/DonutChart';
import {
  FundExposurePanel,
  type ExposureHolding,
  type ExposureSector,
} from '../../components/FundExposurePanel';
import { scoreBg, scoreColor, type FullTierScore } from '../../engine/full-tier-scores';
import { SourceQuote, OurVoice, VendorQuote } from '../../components/SourceQuote';
import {
  MONEY_MARKET_TICKERS,
  isCashSweepHolding,
  REFERENCE_SECTOR_COLORS,
  SECTOR_FALLBACK_COLOR,
} from './constants';
import { theme } from '../../theme';

type Tab = 'about' | 'holdings' | 'sectors' | 'scores';

// ─── Ratified explainer copy (B9 §5) ───────────────────────────────────────

const OVER_100_EXPLAINER =
  "Totals can exceed 100% when a fund uses offsetting positions (short sales or leverage). These are the fund's own reported numbers — not an error.";

const NEGATIVE_ROW_EXPLAINER =
  'A negative percentage is a short position, reported by the fund itself.';

const LONG_ONLY_DISCLOSURE =
  'Chart shows long positions; this fund also reports short positions — see the holdings table';

/** Strategies longer than this open collapsed behind the expander */
const STRATEGIES_COLLAPSE_CHARS = 900;

// ─── Formatting ────────────────────────────────────────────────────────────

/** Both expense registers: "0.23% (≈ $23 per year per $10,000 invested)" */
function fmtExpenseBothRegisters(er: number | null): string {
  if (er === null) return '—';
  return `${(er * 100).toFixed(2)}% (≈ $${Math.round(er * 10_000)} per year per $10,000 invested)`;
}

function dateOnly(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

// ─── Sector slices from the payload map ────────────────────────────────────
// Filed values throughout. Sectors missing from the palette merge into one
// gray "Other" slice — they legend as "Other" per the B4 gate amendment.

function buildSectorSlices(sectorExposure: Record<string, number>): DonutSlice[] {
  const slices: DonutSlice[] = [];
  let otherPct = 0;

  for (const [sector, value] of Object.entries(sectorExposure)) {
    // FSPGX wave c4: the stored map is already on the 0–100 scale
    // (DonutChart's contract) — pass it through, never multiply.
    // B9 c9: negative sector values (offsetting positions) stay out of the
    // donut geometry — the chart draws long exposure — but the >100 filed
    // total is preserved in the legend by the normalization split below.
    const pct = value;
    if (pct <= 0) continue;
    if (sector in REFERENCE_SECTOR_COLORS && sector !== 'Other') {
      slices.push({ id: sector, label: sector, pct, color: REFERENCE_SECTOR_COLORS[sector]! });
    } else {
      otherPct += pct;
    }
  }

  slices.sort((a, b) => b.pct - a.pct);
  if (otherPct > 0) {
    slices.push({ id: 'Other', label: 'Other', pct: otherPct, color: SECTOR_FALLBACK_COLOR });
  }
  return slices;
}

// ─── Holdings donut: top 8 positive + "Everything else" ────────────────────
// Categorical colors only — the palette says which slice is which, never
// whether a holding is good.

const HOLDINGS_DONUT_COLORS = [
  '#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b',
  '#22c55e', '#ef4444', '#f97316', '#14b8a6',
];

const EVERYTHING_ELSE_ID = 'everything-else';

function buildHoldingsSlices(holdings: ReferenceHolding[]): DonutSlice[] {
  const positive = holdings.filter(h => h.pct > 0);
  const sorted = [...positive].sort((a, b) => b.pct - a.pct);
  const top = sorted.slice(0, 8);
  const restPct = sorted.slice(8).reduce((acc, h) => acc + h.pct, 0);

  const slices: DonutSlice[] = top.map((h, i) => ({
    id: `${h.ticker ?? h.name}-${i}`,
    label: h.name === 'N/A' ? (h.ticker ?? '—') : h.name,
    pct: h.pct,
    color: HOLDINGS_DONUT_COLORS[i % HOLDINGS_DONUT_COLORS.length]!,
  }));
  if (restPct > 0) {
    // "Everything else" at its true combined weight — never a filler wedge
    slices.push({
      id: EVERYTHING_ELSE_ID,
      label: 'Everything else',
      pct: restPct,
      color: SECTOR_FALLBACK_COLOR,
    });
  }
  return slices;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ReferenceFundDetail({
  fund,
  fullScore = null,
}: {
  fund: ReferenceFund;
  /** U1-B: the full tier's evaluative view of this fund, or null. Null for
   *  every reference account — the fields behind it are on the B2
   *  permanently-excluded list and never reach one. */
  fullScore?: FullTierScore | null;
}) {
  const isMoneyMarket = MONEY_MARKET_TICKERS.has(fund.ticker);
  // FSPGX-trigger ruling: a non-MM fund with no filing date is treated as
  // holdings-unavailable regardless of what the route serves. About is
  // exempt — the seeded description does not depend on the pipeline.
  const hasFilingDate = fund.as_of.report_date !== null;
  const holdingsAvailable = !isMoneyMarket && hasFilingDate;

  const [tab, setTab] = useState<Tab>('about');
  const [holdings, setHoldings] = useState<ReferenceHolding[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!holdingsAvailable) return; // About needs no fetch
    setHoldings(null);
    setFetchError(null);
    fetchReferenceFundDetailFull(fund.ticker).then(res => {
      if (res.data) {
        setHoldings(res.data.holdings || []);
      } else {
        setFetchError(res.error || 'Could not load holdings.');
      }
    });
  }, [fund.ticker, holdingsAvailable]);

  // MM funds show About alone; everyone else gets all three tabs. U1-B: the
  // full tier adds a Scores tab wherever the evaluative payload arrived —
  // including on a money market, which has a score even though it has no
  // holdings report and never enters the ranking.
  const tabs: Tab[] = [
    ...(isMoneyMarket ? (['about'] as Tab[]) : (['about', 'holdings', 'sectors'] as Tab[])),
    ...(fullScore ? (['scores'] as Tab[]) : []),
  ];
  const tabLabel: Record<Tab, string> = {
    about: 'About',
    holdings: 'Holdings',
    sectors: 'Sectors',
    scores: 'Scores',
  };

  const hasNegativeRows = useMemo(
    () => (holdings ?? []).some(h => h.pct < 0),
    [holdings],
  );

  return (
    <div
      style={{
        background: theme.colors.surfaceAlt,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.md,
        padding: '16px 20px',
        margin: '4px 0 12px',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* ── Identity strip: every fund, every state ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.colors.text }}>{fund.name}</span>
        <span style={{ fontSize: 13, fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
          {fund.ticker}
        </span>
        <span style={{ fontSize: 13, color: theme.colors.textMuted }}>
          Expense ratio: {fmtExpenseBothRegisters(fund.expense_ratio)}
        </span>
      </div>

      {/* ── Tab bar — About first and default ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${theme.colors.border}`, marginBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? `2px solid ${theme.colors.accentBlue}` : '2px solid transparent',
              marginBottom: -1,
              color: tab === t ? theme.colors.text : theme.colors.textMuted,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
            }}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {tab === 'about' ? (
        <AboutTab fund={fund} isMoneyMarket={isMoneyMarket} />
      ) : tab === 'scores' && fullScore ? (
        /* The score exists whether or not a holdings report does, so this
           branch sits ahead of the holdings-availability guard. */
        <ScoresTab fullScore={fullScore} />
      ) : !holdingsAvailable ? (
        /* Honest empty state for Holdings/Sectors (null report_date) */
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
          Holdings data isn&apos;t available for this fund yet.
        </p>
      ) : fetchError ? (
        <p style={{ fontSize: 13, color: theme.colors.error, lineHeight: 1.6, margin: 0 }}>
          {fetchError}
        </p>
      ) : holdings === null ? (
        <p style={{ fontSize: 13, color: theme.colors.textDim, margin: 0 }}>Loading holdings…</p>
      ) : holdings.length === 0 ? (
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
          Holdings data isn&apos;t available for this fund yet.
        </p>
      ) : tab === 'holdings' ? (
        <div>
          <HoldingsTable
            holdings={holdings}
            showNegativeExplainer={hasNegativeRows}
            filedCount={fund.holdings_count}
          />
          <Provenance fund={fund} />
        </div>
      ) : (
        <div>
          <SectorsTab
            holdings={holdings}
            sectorExposure={fund.sector_exposure}
            hasNegativeRows={hasNegativeRows}
          />
          <Provenance fund={fund} />
        </div>
      )}
    </div>
  );
}

// ─── About tab ─────────────────────────────────────────────────────────────

function AboutTab({ fund, isMoneyMarket }: { fund: ReferenceFund; isMoneyMarket: boolean }) {
  const desc = fund.description;
  const [showFullStrategies, setShowFullStrategies] = useState(false);

  const strategiesLong = (desc?.strategies_text.length ?? 0) > STRATEGIES_COLLAPSE_CHARS;
  // Collapsing is furniture: the slice is display-only, the complete filed
  // text is always behind the expander.
  const strategiesShown =
    desc && strategiesLong && !showFullStrategies
      ? `${desc.strategies_text.slice(0, 700).trimEnd()}…`
      : desc?.strategies_text ?? '';

  return (
    <div>
      {desc ? (
        <div
          style={{
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            padding: '14px 16px',
          }}
        >
          {/* Investment Objective — the industry's official section label */}
          <SectionLabel text="Investment Objective" />
          <SourceQuote accession={desc.source_accession} filingDate={desc.filing_ddate}>
            {desc.objective_text}
          </SourceQuote>

          <RuleLine />

          {/* Principal Investment Strategies — all of it, word for word */}
          <SectionLabel text="Principal Investment Strategies" />
          <SourceQuote accession={desc.source_accession} filingDate={desc.filing_ddate}>
            {strategiesShown}
          </SourceQuote>
          {strategiesLong && !showFullStrategies && (
            <button
              onClick={() => setShowFullStrategies(true)}
              style={{
                marginTop: 8,
                padding: '6px 12px',
                background: 'transparent',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radii.sm,
                color: theme.colors.textMuted,
                fontSize: 12,
                fontFamily: theme.fonts.body,
                cursor: 'pointer',
              }}
            >
              Show the full strategies
            </button>
          )}

          {/* Translation — our voice, present only when the server serves
              it (REFERENCE_TRANSLATIONS_ENABLED, ships false) */}
          {typeof desc.translation_text === 'string' && desc.translation_text.length > 0 && (
            <>
              <RuleLine />
              <OurVoice label="Translation — plain English">
                {desc.translation_text}
              </OurVoice>
            </>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
          The fund&apos;s filed description isn&apos;t available yet.
        </p>
      )}

      {isMoneyMarket && (
        /* The pre-B9 money-market line, now living inside About */
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: '12px 0 0' }}>
          Money market funds hold cash-equivalent instruments; there is no
          portfolio holdings report to show.
        </p>
      )}
    </div>
  );
}

function RuleLine() {
  return <hr style={{ border: 'none', borderTop: `1px solid ${theme.colors.border}`, margin: '14px 0' }} />;
}

// ─── Holdings tab ──────────────────────────────────────────────────────────

function HoldingsTable({
  holdings,
  showNegativeExplainer,
  filedCount,
}: {
  holdings: ReferenceHolding[];
  showNegativeExplainer: boolean;
  /** H1 h1: dossier holdings_total from the payload — when the filed count
   *  exceeds the rows served (the B9 c5(a) 1,000-row ceiling: VFWAX 3,918,
   *  MWTSX 1,512), the count line must not say "all". */
  filedCount: number | null;
}) {
  // H2: which holding row is drilled in (one at a time; click toggles) —
  // the Funds grid's expansion pattern, one level down.
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  return (
    <div>
      {/* Count-line honesty (H1 h1): "all" only when it is all */}
      <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 8px' }}>
        {filedCount != null && filedCount > holdings.length
          ? `Showing the ${holdings.length} largest of ${filedCount} filed holdings`
          : `Showing all ${holdings.length} holdings as filed`}
      </p>
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Holding', 'Ticker', '% of fund', 'Sector'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 2 ? 'right' : 'left',
                    padding: '6px 10px',
                    color: theme.colors.textMuted,
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${theme.colors.border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Served order preserved — no re-sorting; negative rows as filed */}
            {holdings.map((h, i) => {
              const isExpanded = expandedRow === i;
              return (
                <Fragment key={i}>
                  <tr
                    onClick={() => setExpandedRow(prev => (prev === i ? null : i))}
                    style={{ cursor: 'pointer', background: isExpanded ? theme.colors.surface : undefined }}
                  >
                    <td style={{ ...cellStyle, color: theme.colors.text }}>
                      {/* H2-F1: the door has to be visible to be a door. Every
                          row opens — including dash rows, which open to the
                          Wikipedia fallback — but nothing on screen said so,
                          and on the dash-heavy funds that is most of the page
                          (CFSTX 1 ticker in 112 rows, TGEPX 5 in 297). */}
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 10,
                          marginRight: 6,
                          color: theme.colors.textDim,
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      >
                        ▸
                      </span>
                      {/* F4: literal 'N/A' filing names render as an em-dash */}
                      {h.name === 'N/A' ? '—' : h.name}
                      {/* F3: exact full-name sweep matches get the muted tag */}
                      {isCashSweepHolding(h.name) && (
                        <span
                          style={{
                            marginLeft: 8,
                            padding: '1px 6px',
                            borderRadius: theme.radii.sm,
                            border: `1px solid ${theme.colors.border}`,
                            color: theme.colors.textDim,
                            fontSize: 10,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          cash reserves
                        </span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontFamily: theme.fonts.mono }}>{h.ticker ?? '—'}</td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: theme.fonts.mono }}>
                      {h.pct.toFixed(2)}%
                    </td>
                    <td style={cellStyle}>{h.sector ?? '—'}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0, borderBottom: `1px solid ${theme.colors.border}` }}>
                        <HoldingCompanyPanel holding={h} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {showNegativeExplainer && (
        <p style={{ fontSize: 11, color: theme.colors.textDim, lineHeight: 1.6, margin: '8px 0 0' }}>
          {NEGATIVE_ROW_EXPLAINER}
        </p>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  verticalAlign: 'top',
};

// ─── H2: the holding company panel ─────────────────────────────────────────
// Information, never evaluation — the same posture as the About tab one level
// up. FMP's description serves verbatim in a quote block under attribution;
// the facts are the non-moving ones only (no price, no market cap, no
// ratings). Wikipedia is the independent second door and stays secondary.

/** Wikipedia name search — lands on a search page for obscure names, which
 *  is honest: it says "here is where to look", never "here is the company". */
function wikipediaSearchUrl(name: string): string {
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
}

function HoldingCompanyPanel({ holding }: { holding: ReferenceHolding }) {
  const [company, setCompany] = useState<CompanyPanel | null>(null);
  const [loading, setLoading] = useState(false);

  // H1-F2 followup, honored: the panel keys on VALIDATED display tickers
  // only. holdings_cache.ticker carries the vouched display value or null,
  // so a dashed row asks the server nothing — there is no identifier the app
  // is willing to stand behind, and a lookup on an unvouched code is exactly
  // how the wrong company reaches a member.
  const lookupTicker = holding.ticker;

  useEffect(() => {
    if (!lookupTicker) {
      setCompany(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setCompany(null);
    // The filed name rides along: the server re-checks the h6 name-agreement
    // guard against it and fails closed without it.
    fetchHoldingCompany(lookupTicker, holding.name).then(res => {
      if (cancelled) return;
      setCompany(res.data?.company ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lookupTicker, holding.name]);

  // F4 convention: a literal 'N/A' filing name is not a name. With no company
  // name either, there is nothing to search for and no link is offered.
  const filedName = holding.name === 'N/A' ? null : holding.name;
  const searchName = company?.companyName ?? filedName;

  const wikipediaLink = searchName ? (
    <a
      href={wikipediaSearchUrl(searchName)}
      target="_blank"
      rel="noopener"
      style={{ color: theme.colors.textDim, textDecoration: 'underline' }}
    >
      Search Wikipedia ↗
    </a>
  ) : null;

  // The non-moving facts, each rendered only where FMP carries it.
  const facts: string[] = [];
  if (company) {
    const place = [company.city, company.country].filter(Boolean).join(', ');
    if (place) facts.push(place);
    const business = [company.sector, company.industry].filter(Boolean).join(' — ');
    if (business) facts.push(business);
    if (company.exchange) facts.push(company.exchange);
    if (company.ipoDate) facts.push(`Listed ${company.ipoDate}`);
  }

  return (
    <div
      style={{
        background: theme.colors.bg,
        borderTop: `1px solid ${theme.colors.border}`,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, marginBottom: 10 }}>
        {company?.companyName ?? filedName ?? '—'}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: theme.colors.textDim, margin: 0 }}>Loading company…</p>
      ) : company && company.description ? (
        <>
          <VendorQuote attribution="Company data: Financial Modeling Prep">
            {company.description}
          </VendorQuote>

          {facts.length > 0 && (
            <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: '12px 0 0' }}>
              {facts.join(' · ')}
              {company.website && (
                <>
                  {' · '}
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener"
                    style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}
                  >
                    {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </>
              )}
            </p>
          )}

          {wikipediaLink && (
            <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '10px 0 0' }}>{wikipediaLink}</p>
          )}
        </>
      ) : (
        /* Fallback: no cached profile, or the h6 guard declined this pairing.
           The member gets what the filing itself says, plus the second door —
           never another company's description. */
        <>
          <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
            {holding.sector
              ? `Filed under ${holding.sector}. No company description is available for this holding.`
              : 'No company description is available for this holding.'}
          </p>
          {wikipediaLink && (
            <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '10px 0 0' }}>{wikipediaLink}</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sectors tab ───────────────────────────────────────────────────────────
// U1-B: the standalone sector donut and its legend are now the middle and
// left columns of the shared FundExposurePanel — sector bars left (filed
// values, with magnitudes the flat legend never showed), the same donut in
// the centre, and that sector's holdings held open on the right instead of
// behind a click. The Holdings donut is untouched and sits below.
//
// Every B9 c9 guarantee is carried, not dropped:
//   - the bars print FILED values, normalization or not — the legend's job;
//   - the donut GEOMETRY is still normalized when the filed map sums past
//     100, so the ring closes at 360°;
//   - the over-100 explainer still renders under that case;
//   - the long-only disclosure still renders when any negative row exists;
//   - clicking a sector still reaches that sector's holdings. It is now a
//     persistent filter rather than a drill panel, which is the "same
//     interactions" the assignment asks the extracted component to keep.
//   - sectorLimit={null}: the panel's 8-row default would have hidden
//     sectors a fund actually holds, and the legend it replaces printed
//     every one of them.

function SectorsTab({
  holdings,
  sectorExposure,
  hasNegativeRows,
}: {
  holdings: ReferenceHolding[];
  sectorExposure: Record<string, number>;
  hasNegativeRows: boolean;
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const holdingSlices = useMemo(() => buildHoldingsSlices(holdings), [holdings]);

  // Filed sector slices, and the filed total. When the filed values sum
  // past 100 (offsetting positions — the faithful over-100 case), the
  // donut GEOMETRY is normalized so the ring closes at 360°, while the
  // legend prints the filed values with the over-100 explainer. The hover
  // center shows each slice's share of the chart.
  const filedSectorSlices = useMemo(() => buildSectorSlices(sectorExposure), [sectorExposure]);
  const filedTotal = useMemo(
    () => filedSectorSlices.reduce((acc, s) => acc + s.pct, 0),
    [filedSectorSlices],
  );
  const overFiled = filedTotal > 100.05;
  const geometrySlices = useMemo(
    () =>
      overFiled
        ? filedSectorSlices.map(s => ({ ...s, pct: (s.pct * 100) / filedTotal }))
        : filedSectorSlices,
    [filedSectorSlices, overFiled, filedTotal],
  );

  /** The slice a sector name belongs to — the B9 fold, kept identical so a
   *  bar, a donut wedge and a holding row all agree on what 'Other' means. */
  const sliceIdForSector = (sector: string): string =>
    sector in REFERENCE_SECTOR_COLORS && sector !== 'Other' ? sector : 'Other';

  // The left column: the filed slices as bars, in the donut's own order.
  const sectorBars = useMemo<ExposureSector[]>(
    () => filedSectorSlices.map(s => ({ sector: s.label, weight: s.pct, color: s.color })),
    [filedSectorSlices],
  );

  // The right column: positive rows, matching what the donut draws, keyed to
  // the same slice ids so a bar click filters to its own wedge. Server order
  // (pct_of_nav descending) is preserved, so the unfiltered view is the
  // fund's largest positions. Rows the filing left unclassified keep a null
  // sector: they appear in the unfiltered list, and no sector claims them.
  const panelHoldings = useMemo<ExposureHolding[]>(
    () =>
      holdings
        .filter(h => h.pct > 0)
        .map(h => ({
          name: h.name === 'N/A' ? '—' : h.name,
          ticker: h.ticker,
          weight: h.pct,
          sector: h.sector === null ? null : sliceIdForSector(h.sector),
        })),
    [holdings],
  );

  if (holdingSlices.length === 0 && filedSectorSlices.length === 0) {
    return (
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
        Sector data isn&apos;t available for this fund yet.
      </p>
    );
  }

  return (
    <div>
      {filedSectorSlices.length > 0 && (
        <FundExposurePanel
          sectors={sectorBars}
          holdings={panelHoldings}
          selectedSector={selectedSector}
          onSelectSector={setSelectedSector}
          isMobile={isMobile}
          sectorLimit={null}
          center={
            <DonutChart
              slices={geometrySlices}
              size={200}
              title="Sectors"
              onSliceClick={slice =>
                setSelectedSector(prev => (prev === slice.id ? null : slice.id))
              }
            />
          }
          footnotes={
            overFiled ? (
              <p style={{ fontSize: 11, color: theme.colors.textDim, lineHeight: 1.6, margin: '8px 0 0' }}>
                {OVER_100_EXPLAINER}
              </p>
            ) : null
          }
        />
      )}

      {/* The Holdings donut, unchanged from B9 c9 */}
      {holdingSlices.length > 0 && (
        <div style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{ minWidth: 240, maxWidth: 340 }}>
            <DonutChart slices={holdingSlices} size={200} title="Holdings" />
            <SliceLegend slices={holdingSlices} />
          </div>
        </div>
      )}

      {/* Carried from B9 c9: stated once for the tab, under both charts,
          whichever of them rendered */}
      {hasNegativeRows && (
        <p style={{ fontSize: 11, color: theme.colors.textDim, lineHeight: 1.6, margin: '10px 0 0' }}>
          {LONG_ONLY_DISCLOSURE}
        </p>
      )}
    </div>
  );
}

// ─── Scores tab (U1-B; full tier only) ─────────────────────────────────────
// The evaluative content FundLens.tsx carried, re-homed here as a module —
// the score and the tier, the two things that page showed on every row and
// this shared base has never shown. It renders only where the payload
// carrying it arrived, which is only ever a full-tier account: composite,
// tier and z-scores are on the B2 permanently-excluded list.
//
// The sector/donut/holdings block FundLens showed beneath its rows is NOT
// re-homed here — it is the shared exposure panel on the Sectors tab, which
// both tiers now get. This tab holds the evaluation and nothing else.

function ScoresTab({ fullScore }: { fullScore: FullTierScore }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 28, marginBottom: 14 }}>
        <div>
          <SectionLabel text="Score" />
          <span style={{
            display: 'inline-block',
            minWidth: 52,
            padding: '6px 12px',
            borderRadius: 6,
            background: scoreBg(fullScore.composite),
            color: scoreColor(fullScore.composite),
            fontWeight: 700,
            fontFamily: theme.fonts.mono,
            fontSize: 20,
            textAlign: 'center',
          }}>{fullScore.composite}</span>
        </div>
        <div>
          <SectionLabel text="Tier" />
          <span style={{
            display: 'inline-block',
            padding: '5px 12px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.03em',
            color: fullScore.tierColor,
            background: `${fullScore.tierColor}18`,
            border: `1px solid ${fullScore.tierColor}40`,
            whiteSpace: 'nowrap',
          }}>{fullScore.tier}</span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
        Scored on your own factor weights, out of 100, and placed against the
        other funds in the plan. Money market funds are scored but stay out of
        that comparison — they are held for safety, not for standing.
      </p>
    </div>
  );
}

function SliceLegend({ slices }: { slices: DonutSlice[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {slices.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: theme.colors.text, flex: 1 }}>{s.label}</span>
          <span style={{ fontSize: 12, fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
            {s.pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Shared label ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: theme.colors.textMuted,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      {text}
    </div>
  );
}

// ─── Provenance (Holdings/Sectors; only with a real filing date) ───────────

function Provenance({ fund }: { fund: ReferenceFund }) {
  const reportDate = dateOnly(fund.as_of.report_date);
  if (!reportDate) return null; // never invent a date

  const pricedAsOf = dateOnly(fund.as_of.priced_as_of);
  const coverage = fund.coverage;

  return (
    <p
      style={{
        marginTop: 14,
        marginBottom: 0,
        paddingTop: 10,
        borderTop: `1px solid ${theme.colors.border}`,
        fontSize: 11,
        color: theme.colors.textDim,
        lineHeight: 1.6,
      }}
    >
      Holdings from SEC EDGAR N-PORT filing dated {reportDate}.
      {pricedAsOf ? <> Prices as of {pricedAsOf}.</> : null}
      {coverage ? (
        <> Data coverage: {coverage.resolved_pct}% of assets identified, {coverage.classified_pct}% sector-classified.</>
      ) : null}
    </p>
  );
}
