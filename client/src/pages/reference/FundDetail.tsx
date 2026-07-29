/**
 * FundLens — Reference Fund Detail (B4 c2)
 *
 * The inline expansion beneath a reference Funds grid row. Chart-forward
 * and facts-only: colors and charts show what a fund IS, never whether
 * it's good. No Overview tab, no factor bars, no tier badge, no summary
 * text (B7 flips summaries later, behind its own flag), no evaluative
 * word or color anywhere.
 *
 * States, in decision order:
 *   1. Money market (ADAXX/FDRXX by ticker — the payload ships no flag):
 *      identity strip + one explanatory line; no tabs, no fetch.
 *   2. Honest empty state — fires when holdings are absent OR when a
 *      non-money-market fund's as_of.report_date is null (FSPGX-trigger
 *      ruling, July 28, 2026: undated, gate-failed rows stay hidden until
 *      the pipeline repair lands; never a fabricated date, never a blank
 *      pane).
 *   3. Holdings | Sectors tabs with the provenance block on both.
 *
 * Data: the fund object arrives from the grid (the same tier-shaped
 * /api/scores payload); holdings come from fetchReferenceFundDetail.
 * The Sectors donut renders the payload's sector_exposure map — never a
 * recomputation from the top-50 holdings rows (binding build fact).
 */

import { useEffect, useState } from 'react';
import {
  fetchReferenceFundDetail,
  type ReferenceFund,
  type ReferenceHolding,
} from '../../api';
import { DonutChart, type DonutSlice } from '../../components/DonutChart';
import {
  MONEY_MARKET_TICKERS,
  isCashSweepHolding,
  REFERENCE_SECTOR_COLORS,
  SECTOR_FALLBACK_COLOR,
} from './constants';
import { theme } from '../../theme';

type Tab = 'holdings' | 'sectors';

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
// Sectors missing from the palette merge into one gray "Other" slice — they
// legend as "Other" per the gate amendment.

function buildSectorSlices(sectorExposure: Record<string, number>): DonutSlice[] {
  const slices: DonutSlice[] = [];
  let otherPct = 0;

  for (const [sector, value] of Object.entries(sectorExposure)) {
    // FSPGX wave c4: the stored map is already on the 0–100 scale
    // (DonutChart's contract) — pass it through, never multiply.
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

// ─── Component ─────────────────────────────────────────────────────────────

export function ReferenceFundDetail({ fund }: { fund: ReferenceFund }) {
  const isMoneyMarket = MONEY_MARKET_TICKERS.has(fund.ticker);
  // FSPGX-trigger ruling: a non-MM fund with no filing date is treated as
  // holdings-unavailable regardless of what the route serves.
  const hasFilingDate = fund.as_of.report_date !== null;

  const [tab, setTab] = useState<Tab>('holdings');
  const [holdings, setHoldings] = useState<ReferenceHolding[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (isMoneyMarket || !hasFilingDate) return; // states 1 and 2 need no fetch
    setHoldings(null);
    setFetchError(null);
    fetchReferenceFundDetail(fund.ticker).then(res => {
      if (res.data) {
        setHoldings(res.data.holdings || []);
      } else {
        setFetchError(res.error || 'Could not load holdings.');
      }
    });
  }, [fund.ticker, isMoneyMarket, hasFilingDate]);

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

      {isMoneyMarket ? (
        /* ── State 1: money market — no holdings report exists ── */
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
          Money market funds hold cash-equivalent instruments; there is no
          portfolio holdings report to show.
        </p>
      ) : !hasFilingDate || (holdings !== null && holdings.length === 0) ? (
        /* ── State 2: honest empty state (null report_date OR no rows) ── */
        <p style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
          Holdings data isn&apos;t available for this fund yet.
        </p>
      ) : fetchError ? (
        <p style={{ fontSize: 13, color: theme.colors.error, lineHeight: 1.6, margin: 0 }}>
          {fetchError}
        </p>
      ) : holdings === null ? (
        <p style={{ fontSize: 13, color: theme.colors.textDim, margin: 0 }}>Loading holdings…</p>
      ) : (
        /* ── State 3: Holdings | Sectors ── */
        <div>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${theme.colors.border}`, marginBottom: 12 }}>
            {(['holdings', 'sectors'] as Tab[]).map(t => (
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
                {t === 'holdings' ? 'Holdings' : 'Sectors'}
              </button>
            ))}
          </div>

          {tab === 'holdings' ? (
            <HoldingsTable holdings={holdings} />
          ) : (
            <SectorsPanel sectorExposure={fund.sector_exposure} />
          )}

          <Provenance fund={fund} />
        </div>
      )}
    </div>
  );
}

// ─── Holdings tab ──────────────────────────────────────────────────────────

function HoldingsTable({ holdings }: { holdings: ReferenceHolding[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
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
          {/* Served order preserved — no re-sorting */}
          {holdings.map((h, i) => (
            <tr key={i}>
              <td style={{ ...cellStyle, color: theme.colors.text }}>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  verticalAlign: 'top',
};

// ─── Sectors tab ───────────────────────────────────────────────────────────

function SectorsPanel({ sectorExposure }: { sectorExposure: Record<string, number> }) {
  const slices = buildSectorSlices(sectorExposure);

  if (slices.length === 0) {
    return (
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
        Sector data isn&apos;t available for this fund yet.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 }}>
      <DonutChart slices={slices} size={200} />
      {/* Sector/percent legend — composition facts, categorical colors only */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220, flex: 1 }}>
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
    </div>
  );
}

// ─── Provenance (both tabs; only with a real filing date) ──────────────────

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
