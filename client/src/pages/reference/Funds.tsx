/**
 * FundLens — Reference Funds Grid (B3)
 *
 * The reference tier's home page: every active fund in the plan as a
 * sortable table of facts. Columns (plan §B3): Ticker, Name, Expense ratio
 * (with ~$/yr per $10,000 — Main Street register), 1Y return (raw figure),
 * Top holding, # holdings, Concentration (HHI label), Data as-of.
 *
 * Honesty rules, enforced here:
 *   - Default order is alphabetical — the server returns it that way and
 *     this page never re-ranks on its own. Any other order is the user's
 *     own click on a factual column, sortable both directions.
 *   - No colors implying good/bad. hhiLabel() ships display colors for the
 *     full tier; this page uses its LABEL TEXT ONLY, in plain text color.
 *   - Missing data renders as an em dash, never as zero.
 *
 * Data: fetchReferenceScores() — the tier-shaped /api/scores response
 * (see src/engine/reference-shape.ts for the allowlist contract).
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchReferenceScores, type ReferenceFund } from '../../api';
import { computeHHI, hhiLabel } from '../../utils/hhi';
import { theme } from '../../theme';

// ─── Sorting ───────────────────────────────────────────────────────────────

type ColumnKey =
  | 'ticker'
  | 'name'
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
  const d = f.as_of.report_date ?? f.as_of.scored_at ?? null;
  return d ? d.slice(0, 10) : null;
}

const COLUMNS: Column[] = [
  { key: 'ticker', label: 'Ticker', align: 'left', value: f => f.ticker },
  { key: 'name', label: 'Name', align: 'left', value: f => f.name },
  { key: 'expense', label: 'Expense ratio', align: 'right', value: f => f.expense_ratio },
  { key: 'oneYear', label: '1Y return', align: 'right', value: f => f.returns.twelveMonth },
  { key: 'topHolding', label: 'Top holding', align: 'left', value: f => topHoldingName(f) },
  { key: 'holdingsCount', label: '# holdings', align: 'right', value: f => (f.holdings_count && f.holdings_count > 0 ? f.holdings_count : null) },
  { key: 'concentration', label: 'Concentration', align: 'left', value: f => concentration(f).hhi },
  { key: 'asOf', label: 'Data as-of', align: 'right', value: f => asOfDate(f) },
];

// ─── Formatting (facts, plainly) ───────────────────────────────────────────

function fmtExpense(er: number | null): string {
  if (er === null) return '—';
  const pct = (er * 100).toFixed(2);
  const dollars = Math.round(er * 10_000);
  return `${pct}% (~$${dollars}/yr per $10,000)`;
}

function fmtReturn(r: number | null): string {
  if (r === null) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ReferenceFunds() {
  const [funds, setFunds] = useState<ReferenceFund[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default: alphabetical by ticker, ascending — matches the server order.
  const [sortKey, setSortKey] = useState<ColumnKey>('ticker');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  useEffect(() => {
    fetchReferenceScores().then(res => {
      if (res.data) {
        setFunds(res.data.funds || []);
        setAsOf(res.data.asOf ?? null);
      } else {
        setError(res.error || 'Could not load funds.');
      }
      setLoading(false);
    });
  }, []);

  const handleSort = (key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sortKey);
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
  }, [funds, sortKey, sortDir]);

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

  return (
    <div style={{ padding: `${theme.spacing.lg} ${theme.spacing.md}`, fontFamily: theme.fonts.body }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.colors.text, margin: '0 0 4px' }}>
        Funds in the plan
      </h1>
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.lg}` }}>
        {funds.length} funds, listed alphabetically. Click any column heading
        to sort it yourself — the app applies no ranking of its own.
        {asOf ? ` Data updated ${asOf.slice(0, 10)}.` : ''}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
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
              return (
                <tr key={f.ticker}>
                  <td style={{ ...cellStyle, textAlign: 'left', fontFamily: theme.fonts.mono, color: theme.colors.text }}>
                    {f.ticker}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'left', color: theme.colors.text }}>{f.name}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtExpense(f.expense_ratio)}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtReturn(f.returns.twelveMonth)}</td>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{topHoldingName(f) ?? '—'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {f.holdings_count && f.holdings_count > 0 ? f.holdings_count : '—'}
                  </td>
                  {/* Label text only — no good/bad color coding (plan §B3) */}
                  <td style={{ ...cellStyle, textAlign: 'left' }}>{conc.label ?? '—'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{asOfDate(f) ?? '—'}</td>
                </tr>
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
