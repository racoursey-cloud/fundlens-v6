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
 *     holdings rows, binding build fact.
 *     Long-only disclosure when any negative row exists; sector-donut
 *     geometry normalized when the filed map sums past 100 while the bars
 *     print the filed values with the over-100 explainer; clicking a sector
 *     — bar or wedge — filters the holdings column to it.
 *
 * D1 (RULED by Robert, August 15, 2026): "A donut of sectors makes sense. A
 * donut of holdings does not. Sectors get donuts; holdings do not." The
 * Holdings donut that B9 c9 put beneath the sector block — top 8 positive
 * plus "Everything else" at its true combined weight — is gone, with its
 * palette, its slice builder and its legend. The holdings LISTS are
 * untouched everywhere: the Holdings tab's full filed table, and the sector
 * panel's holdings column beside the donut, are the useful rendering of the
 * same data. Nothing about the sector donut changed.
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
  fetchReferenceFundDetailFull,
  type ReferenceFund,
  type ReferenceHolding,
} from '../../api';
import { DonutChart, type DonutSlice } from '../../components/DonutChart';
import {
  FundExposurePanel,
  type ExposureHolding,
  type ExposureSector,
} from '../../components/FundExposurePanel';
import { HoldingCompanyPanel } from '../../components/HoldingCompanyPanel';
import { useDrillScroll } from '../../components/drill-scroll';
import { scoreBg, scoreColor, type FullTierScore } from '../../engine/full-tier-scores';
import { SourceQuote, OurVoice } from '../../components/SourceQuote';
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

// D1: the holdings-donut palette, its "everything else" id and its slice
// builder lived here and are removed with the chart they served. Nothing
// else read them.

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
            fundTicker={fund.ticker}
          />
          <Provenance fund={fund} />
        </div>
      ) : (
        <div>
          <SectorsTab
            holdings={holdings}
            sectorExposure={fund.sector_exposure}
            hasNegativeRows={hasNegativeRows}
            fundTicker={fund.ticker}
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
  fundTicker,
}: {
  holdings: ReferenceHolding[];
  showNegativeExplainer: boolean;
  /** H4: what each row's percentage is a percentage OF, for the card */
  fundTicker: string;
  /** H1 h1: dossier holdings_total from the payload — when the filed count
   *  exceeds the rows served (the B9 c5(a) 1,000-row ceiling: VFWAX 3,918,
   *  MWTSX 1,512), the count line must not say "all". */
  filedCount: number | null;
}) {
  // H2: which holding row is drilled in (one at a time; click toggles) —
  // the Funds grid's expansion pattern, one level down.
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // H4: this table lives in a 420px window (below) — about seventeen rows of
  // a list that runs to hundreds. A card opened from a row past its fold used
  // to render entirely below it, showing nothing but a border. The hook moves
  // the window so the clicked row sits at its top.
  const anchorRow = useDrillScroll(expandedRow === null ? null : String(expandedRow));

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
                    ref={anchorRow(String(i))}
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
                        {/* H4: the row's own record — the ?all=1 payload
                            carries the vendor industry and the filed country
                            since this wave — plus what its percentage is a
                            percentage of. */}
                        <HoldingCompanyPanel
                          holding={{
                            name: h.name,
                            ticker: h.ticker,
                            sector: h.sector,
                            industry: h.industry ?? null,
                            country: h.country ?? null,
                            weight: { text: `${h.pct.toFixed(2)}%`, of: fundTicker },
                          }}
                        />
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

// ─── The holding company panel ─────────────────────────────────────────────
// H2 p3 built it here; H3 t1 moved it to
// client/src/components/HoldingCompanyPanel.tsx so the shared exposure panel
// and the holdings search can open the SAME panel rather than a second one
// (a component cannot import from this page, which imports it). The Holdings
// tab above calls it exactly as it always did, with the row's own object.

// ─── Sectors tab ───────────────────────────────────────────────────────────
// U1-B: the standalone sector donut and its legend are now the middle and
// left columns of the shared FundExposurePanel — sector bars left (filed
// values, with magnitudes the flat legend never showed), the same donut in
// the centre, and that sector's holdings held open on the right instead of
// behind a click. D1 removed the Holdings donut that used to sit below this
// block; nothing above this line changed with it.
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
  fundTicker,
}: {
  holdings: ReferenceHolding[];
  sectorExposure: Record<string, number>;
  hasNegativeRows: boolean;
  /** H4: what each row's percentage is a percentage OF, for the card */
  fundTicker: string;
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          // H4: the card gets the row's own record. Note the sector above is
          // the FOLDED slice id, because the list filters on it; the card is
          // handed the same value the row displays, which is the one the
          // member is looking at.
          industry: h.industry ?? null,
          country: h.country ?? null,
          weightText: `${h.pct.toFixed(2)}%`,
        })),
    [holdings],
  );

  // D1: the sector map is now the only thing this tab can draw, so it is the
  // only thing the empty state asks about. A fund with holdings but no filed
  // sector map used to render the holdings donut alone here; it now gets the
  // honest line, which is what the Sectors tab has to say when there is no
  // sector data.
  if (filedSectorSlices.length === 0) {
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
          /* H3 t1: these rows are the ?all=1 holdings — holdings_cache.ticker,
             the H1-F2 vouched display column — so the panel may look them up. */
          tickersAreDisplayValidated
          weightOfLabel={fundTicker}
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

      {/* Carried from B9 c9, and still true of the one chart left (D1): the
          sector donut draws long exposure only — buildSectorSlices skips
          negative filed values — so a fund reporting shorts still needs the
          line, and it still points at the holdings table, where the Holdings
          tab's own negative-row explainer meets it. Not relocated: the
          sentence annotates a chart, and there is still a chart. */}
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

// D1: SliceLegend — the swatch/name/percent list under the holdings donut —
// is removed with it. The sector donut has never used it: its legend is the
// exposure panel's sector bars, which are live controls rather than a key.

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
