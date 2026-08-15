/**
 * FundLens — The Funds Grid (B3; amended B4 c3; unified U1-B)
 *
 * ONE grid for every account (U1 WAVE U1-B). Every active fund in the plan
 * as a sortable table of facts, with the full tier's evaluative columns
 * lighting up as a module on top. FundLens.tsx, which was the full tier's
 * parallel version of this page, retires in this wave.
 *
 * The skeleton is this page's, per U1 ruling 5: sortable columns, one row
 * per fund, click to expand the detail beneath it. The SKIN is FundLens's,
 * per the same ruling: the expand arrow in a leading cell and the blue
 * mono ticker. Both tiers get the skeleton and the skin.
 *
 * Columns, in order: (arrow), Ticker, Name, [Score, Tier], Expense ratio,
 * 1Y return, Top holding, # holdings, Concentration, Data as-of. The two
 * bracketed columns render ONLY when the full-tier payload actually
 * arrived — a member's grid gains no column from this merge.
 *
 * Honesty rules, enforced here:
 *   - Default order is alphabetical FOR BOTH TIERS — the server returns it
 *     that way and this page never re-ranks on its own. Any other order is
 *     the user's own click on a column, sortable both directions. (This is
 *     the reference skeleton's rule and it now governs the merged grid;
 *     FundLens defaulted to score-descending, which was a ranking the page
 *     applied for you.)
 *   - No colors implying good/bad on any FACT column. hhiLabel() ships
 *     display colors for the full tier; this page uses its LABEL TEXT ONLY.
 *     The Score and Tier columns do carry their FundLens colors — those
 *     columns ARE the evaluation, and they exist only where the payload
 *     already carried the evaluation.
 *   - Money markets show "Money market" in the concentration cell, never
 *     an HHI label (F1 — "Highly Concentrated" was true math and the wrong
 *     message on the plan's safest funds).
 *   - As-of shows the EDGAR report_date or an em dash — never a scored_at
 *     fallback (F2 — the emptiest rows must not look the freshest).
 *   - Missing data renders as an em dash, never as zero.
 *
 * Data, and why it is two calls for one tier:
 *   - fetchReferenceScores() — the tier-shaped /api/scores response, for
 *     everyone (see src/engine/reference-shape.ts for the allowlist).
 *   - fetchScores() — FULL TIER ONLY, for the score and tier columns,
 *     joined to the facts row by ticker. Its weighting comes from the
 *     shared ProfileContext (M1 m9), not from a profile call of its own.
 * The two shapes are disjoint and both are already served: the reference
 * branch alone joins fund_dossiers and fund_descriptions, and the full
 * branch alone carries composite/tier/z_*. Composing them in the browser is
 * what lets this wave keep its promise that the SERVER IS UNTOUCHED — the
 * assignment's own verification note ("payload byte-shape unchanged, server
 * untouched, so this is a client check") and its Scope Guard that
 * reference-shape.ts and the fence stay closed in all three waves. A
 * reference account never makes the second call, and could not profit from
 * it if it did: /api/scores shapes by the account's tier regardless of what
 * the client asks for.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchReferenceScores,
  fetchScores,
  type FundScore,
  type ReferenceFund,
} from '../../api';
import type { Capabilities } from '../../capabilities';
import { useProfile } from '../../context/ProfileContext';
import {
  DEFAULT_FACTOR_WEIGHTS,
  deriveFullTierScores,
  scoreBg,
  scoreColor,
  type FullTierScore,
} from '../../engine/full-tier-scores';
import { computeHHI, hhiLabel } from '../../utils/hhi';
import { theme } from '../../theme';
import { ReferenceFundDetail } from './FundDetail';
import { MONEY_MARKET_TICKERS } from './constants';

// ─── Sorting ───────────────────────────────────────────────────────────────

type ColumnKey =
  | 'ticker'
  | 'name'
  | 'score'
  | 'tier'
  | 'expense'
  | 'oneYear'
  | 'topHolding'
  | 'holdingsCount'
  | 'concentration'
  | 'asOf';

interface Column {
  key: ColumnKey;
  label: string;
  /** Sortable value for a fund — null sorts last in either direction */
  value: (f: ReferenceFund) => string | number | null;
  align: 'left' | 'right';
}

function topHoldingName(f: ReferenceFund): string | null {
  return f.top_holdings.length > 0 ? f.top_holdings[0]?.name ?? null : null;
}

function concentration(f: ReferenceFund): { hhi: number | null; label: string | null } {
  const hhi = computeHHI(
    Object.keys(f.sector_exposure).length > 0 ? f.sector_exposure : undefined
  );
  return { hhi, label: hhi !== null ? hhiLabel(hhi).label : null };
}

function asOfDate(f: ReferenceFund): string | null {
  // F2: report_date or nothing — no scored_at fallback.
  return f.as_of.report_date ? f.as_of.report_date.slice(0, 10) : null;
}

const FACT_COLUMNS_LEFT: Column[] = [
  { key: 'ticker', label: 'Ticker', align: 'left', value: f => f.ticker },
  { key: 'name', label: 'Name', align: 'left', value: f => f.name },
];

const FACT_COLUMNS_RIGHT: Column[] = [
  { key: 'expense', label: 'Expense ratio', align: 'right', value: f => f.expense_ratio },
  { key: 'oneYear', label: '1Y return', align: 'right', value: f => f.returns.twelveMonth },
  { key: 'topHolding', label: 'Top holding', align: 'left', value: f => topHoldingName(f) },
  { key: 'holdingsCount', label: '# holdings', align: 'right', value: f => (f.holdings_count && f.holdings_count > 0 ? f.holdings_count : null) },
  { key: 'concentration', label: 'Concentration', align: 'left', value: f => concentration(f).hhi },
  { key: 'asOf', label: 'Data as-of', align: 'right', value: f => asOfDate(f) },
];

/** The evaluative pair, built around whatever full-tier payload arrived.
 *  Tier sorts by the composite it is a band of — the tier labels are cut
 *  points on that one continuous value, so ordering by it orders the bands
 *  correctly. Sorting the LABELS would order them alphabetically, which
 *  would put "Weak" above "Top Pick" and mean nothing. */
function evaluativeColumns(fullScores: Map<string, FullTierScore>): Column[] {
  return [
    {
      key: 'score',
      label: 'Score',
      align: 'right',
      value: f => fullScores.get(f.ticker)?.composite ?? null,
    },
    {
      key: 'tier',
      label: 'Tier',
      align: 'left',
      value: f => fullScores.get(f.ticker)?.composite ?? null,
    },
  ];
}

// ─── Formatting (facts, plainly) ───────────────────────────────────────────

// B4 c3: percent only — the dollar register moved to the cell's native
// tooltip (below) and the detail identity strip (grid-density ruling).
function fmtExpense(er: number | null): string {
  if (er === null) return '—';
  return `${(er * 100).toFixed(2)}%`;
}

/** Native browser title tooltip for the expense cell — no library, no JS */
function expenseTooltip(er: number | null): string | undefined {
  if (er === null) return undefined;
  return `≈ $${Math.round(er * 10_000)} per year per $10,000 invested`;
}

function fmtReturn(r: number | null): string {
  if (r === null) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ReferenceFunds() {
  const capabilities = useOutletContext<Capabilities | null>();
  const isFullTier = capabilities?.tier === 'full';

  const [funds, setFunds] = useState<ReferenceFund[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** U1-B: the full tier's evaluative view, keyed by ticker. Null for a
   *  reference account (never fetched) and null for a full-tier account
   *  whose score call failed — in both cases the columns simply do not
   *  exist, and the grid of facts stands on its own. */
  // M1 m9: the scores arrive from their own call; the weighting arrives
  // from the one profile the provider fetched. Holding the raw rows and
  // deriving below means the profile landing later re-derives rather than
  // re-fetching — the scores call still happens exactly once.
  const [rawScores, setRawScores] = useState<FundScore[] | null>(null);
  const { profile: currentProfile } = useProfile();

  // Default: alphabetical by ticker, ascending — matches the server order.
  const [sortKey, setSortKey] = useState<ColumnKey>('ticker');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // B4: which fund's detail expansion is open (one at a time; click toggles)
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  useEffect(() => {
    // The facts call, for every account, exactly as before.
    const factsCall = fetchReferenceScores();

    // The evaluative call, full tier only. A reference account issues no
    // request here at all — not a request that gets filtered, none.
    const fullCall = isFullTier ? fetchScores() : Promise.resolve(null);

    void Promise.all([factsCall, fullCall]).then(([factsRes, fullRes]) => {
      if (factsRes.data) {
        setFunds(factsRes.data.funds || []);
        setAsOf(factsRes.data.asOf ?? null);
      } else {
        setError(factsRes.error || 'Could not load funds.');
      }

      if (fullRes?.data?.scores) {
        setRawScores(fullRes.data.scores);
      }

      setLoading(false);
    });
  }, [isFullTier]);

  // The caller's own weighting, as FundLens read it; the profile defaults
  // stand in only when no profile is in hand — unchanged in effect from the
  // old fallback for a failed profile call.
  const fullScores = useMemo<Map<string, FullTierScore> | null>(() => {
    if (!rawScores) return null;
    const p = currentProfile;
    const weights = p
      ? {
          cost: p.weight_cost,
          quality: p.weight_quality,
          positioning: p.weight_positioning,
          momentum: p.weight_momentum,
        }
      : DEFAULT_FACTOR_WEIGHTS;
    return deriveFullTierScores(rawScores, weights);
  }, [rawScores, currentProfile]);

  /** The rendered column set. The evaluative pair sits where FundLens read
   *  it — straight after the fund's identity — and exists only when the
   *  payload carrying it actually arrived. */
  const columns = useMemo(
    () =>
      fullScores
        ? [...FACT_COLUMNS_LEFT, ...evaluativeColumns(fullScores), ...FACT_COLUMNS_RIGHT]
        : [...FACT_COLUMNS_LEFT, ...FACT_COLUMNS_RIGHT],
    [fullScores],
  );

  const handleSort = (key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey);
    if (!col) return funds;
    return [...funds].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls last, both directions
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * sortDir;
      }
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }, [funds, columns, sortKey, sortDir]);

  if (loading) {
    return (
      <div style={{ padding: theme.spacing.xl, color: theme.colors.textMuted, fontFamily: theme.fonts.body }}>
        Loading funds…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          margin: theme.spacing.xl,
          padding: '14px 16px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: theme.radii.md,
          color: theme.colors.error,
          fontSize: 13,
          fontFamily: theme.fonts.body,
        }}
      >
        {error}
      </div>
    );
  }

  // +1 for the leading expand-arrow cell, which has no heading
  const totalColumns = columns.length + 1;

  return (
    <div style={{ padding: `${theme.spacing.lg} ${theme.spacing.md}`, fontFamily: theme.fonts.body }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.colors.text, margin: '0 0 4px' }}>
        Funds in the plan
      </h1>
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.lg}` }}>
        {funds.length} funds, listed alphabetically. Click any column heading
        to sort it yourself — the app applies no ranking of its own. Click a
        fund to look inside it.
        {asOf ? ` Data updated ${asOf.slice(0, 10)}.` : ''}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {/* Expand-arrow column (full skin) — no heading, not sortable */}
              <th
                style={{
                  width: 16,
                  padding: '10px 0 10px 12px',
                  borderBottom: `1px solid ${theme.colors.border}`,
                }}
              />
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: col.align,
                    padding: '10px 12px',
                    color: theme.colors.textMuted,
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${theme.colors.border}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(f => {
              const conc = concentration(f);
              const isMM = MONEY_MARKET_TICKERS.has(f.ticker);
              const isExpanded = expandedTicker === f.ticker;
              const full = fullScores?.get(f.ticker) ?? null;
              return (
                <Fragment key={f.ticker}>
                  <tr
                    onClick={() => setExpandedTicker(prev => (prev === f.ticker ? null : f.ticker))}
                    style={{ cursor: 'pointer', background: isExpanded ? theme.colors.surface : undefined }}
                  >
                    {/* Expand arrow (full skin) */}
                    <td style={{ ...cellStyle, padding: '10px 0 10px 12px', width: 16 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          fontSize: 10,
                          color: theme.colors.textDim,
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      >
                        ▶
                      </span>
                    </td>
                    {/* Blue mono ticker (full skin) */}
                    <td style={{
                      ...cellStyle,
                      textAlign: 'left',
                      fontFamily: theme.fonts.mono,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: theme.colors.accentBlue,
                    }}>
                      {f.ticker}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'left', color: theme.colors.text }}>{f.name}</td>

                    {/* The evaluative pair — present only with the payload */}
                    {full && (
                      <>
                        <td style={{ ...cellStyle, textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block',
                            minWidth: 34,
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: scoreBg(full.composite),
                            color: scoreColor(full.composite),
                            fontWeight: 700,
                            fontFamily: theme.fonts.mono,
                            fontSize: 13,
                            textAlign: 'center',
                          }}>{full.composite}</span>
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'left' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            color: full.tierColor,
                            background: `${full.tierColor}18`,
                            border: `1px solid ${full.tierColor}40`,
                            whiteSpace: 'nowrap',
                          }}>{full.tier}</span>
                        </td>
                      </>
                    )}

                    {/* B4: dollars live in the native title tooltip */}
                    <td style={{ ...cellStyle, textAlign: 'right' }} title={expenseTooltip(f.expense_ratio)}>
                      {fmtExpense(f.expense_ratio)}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtReturn(f.returns.twelveMonth)}</td>
                    <td style={{ ...cellStyle, textAlign: 'left' }}>{topHoldingName(f) ?? '—'}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      {f.holdings_count && f.holdings_count > 0 ? f.holdings_count : '—'}
                    </td>
                    {/* Label text only — no good/bad color coding (plan §B3).
                        F1: money markets say what they are, never an HHI label. */}
                    <td style={{ ...cellStyle, textAlign: 'left', ...(isMM ? { color: theme.colors.textDim } : {}) }}>
                      {isMM ? 'Money market' : conc.label ?? '—'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{asOfDate(f) ?? '—'}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={totalColumns} style={{ padding: 0, borderBottom: `1px solid ${theme.colors.border}` }}>
                        <ReferenceFundDetail fund={f} fullScore={full} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  verticalAlign: 'top',
};
