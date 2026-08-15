/**
 * FundLens — Reference My Mix (B6 commit 3)
 *
 * The reference tier's example-mix editor: one percentage input per plan
 * fund (starting blank), a running total, and the factual composite view
 * from client/src/engine/example-mix.ts — blended cost in both registers,
 * the mix sector donut, holdings that appear in more than one chosen
 * fund, and the concentration cell.
 *
 * Facts only, by law: no evaluative word or color anywhere on this page.
 * Colors say what the mix holds, never whether that is good. The shell's
 * footer carries the not-advice language for every reference page, so
 * this page adds none of its own.
 *
 * Persistence is explicit: nothing is saved except by the Save click
 * (saveExampleAllocation), and the clear control (deleteExampleAllocation)
 * returns the editor to blank. The server is the authority on validation —
 * its 400 messages render as sent. The saved mix is used for nothing else.
 *
 * Renders inside the unified Shell's Outlet: header, tabs, and footer come
 * from the shell (U1-A retired ReferenceShell).
 *
 * M1 m3: the standalone sector donut is now the shared FundExposurePanel —
 * sector bars left, that donut in the middle, the mix's holdings right,
 * clicking a sector (bar or wedge) filtering the holdings to it. Both tiers,
 * on data the reference allowlist already ships. The panel replaces the old
 * legend, which said the same things without the drill-in.
 *
 * The bars come from the funds' filed sector maps and the holdings from
 * holdings rows — two honest provenances that need not reconcile exactly.
 * That is the same pattern the fund detail already carries, logged and
 * accepted; My Mix inherits it rather than inventing it.
 *
 * B9 c11: holdings math runs on the funds' COMPLETE lists — each chosen
 * fund's ?all=1 detail is fetched (cached per session) and fed to the
 * engine's fullHoldingsByTicker input. The overlap section and the
 * "Holdings across the mix" list wait on those fetches with a plain
 * loading line; the cost, sector, and concentration panels never do.
 * Dust floor: computed mix percentages below 0.05% print "<0.1%", never
 * "0.0%".
 */

import { useEffect, useMemo, useState } from 'react';
import {
  fetchFunds,
  fetchReferenceScores,
  fetchReferenceFundDetailFull,
  fetchExampleAllocation,
  saveExampleAllocation,
  deleteExampleAllocation,
  isNoSavedMix,
  type Fund,
  type ReferenceFund,
  type ReferenceHolding,
  type ExampleAllocationRow,
} from '../../api';
import {
  computeExampleMix,
  MONEY_MARKET_BUCKET,
  NO_SECTOR_DATA_BUCKET,
  type ExampleMixResult,
} from '../../engine/example-mix';
import { hhiLabel } from '../../utils/hhi';
import { DonutChart, type DonutSlice } from '../../components/DonutChart';
import {
  FundExposurePanel,
  type ExposureHolding,
  type ExposureSector,
} from '../../components/FundExposurePanel';
import {
  MONEY_MARKET_TICKERS,
  REFERENCE_SECTOR_COLORS,
  SECTOR_FALLBACK_COLOR,
} from './constants';
import { theme } from '../../theme';

// ─── Input validation (the same ladder the server enforces) ────────────────

/** One decimal place at most, tolerant of floating-point representation */
function hasAtMostOneDecimal(n: number): boolean {
  return Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
}

/** A non-blank input is valid when it parses to a finite number of at
 *  least 0 with at most one decimal place. */
function isValidPctText(text: string): boolean {
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && hasAtMostOneDecimal(n);
}

// ─── B9 dust floor ─────────────────────────────────────────────────────────
// Everywhere a computed mix percentage renders: values below 0.05% print
// "<0.1%", never "0.0%". (The running Total is the user's own typed sum —
// the number the save gate validates — so it stays exact.) Negative
// combined weights (short positions aggregated as filed) print as filed.

function fmtMixPct(pct: number): string {
  if (pct > 0 && pct < 0.05) return '<0.1%';
  // F4 cure (Fabio ruling, July 31, 2026): dust-sized negatives — real
  // short-position slivers like TGEPX's -0.0096% row — render at two
  // decimals, faithful and self-explanatory ("-0.01%"), never "-0.0%".
  // A value so small that two decimals would still round to "-0.00%"
  // (RNWGX's -0.0008% row) prints at full four-decimal precision instead —
  // the zero-print is the defect class this wave cures, in either sign.
  if (pct < 0 && pct > -0.05) {
    const twoDecimals = `${pct.toFixed(2)}%`;
    return twoDecimals === '-0.00%' ? `${pct.toFixed(4)}%` : twoDecimals;
  }
  return `${pct.toFixed(1)}%`;
}

// ─── B9 session cache for full holdings lists (?all=1) ─────────────────────
// Module-level: survives page remounts within the session, so each fund's
// full list is fetched at most once per visit.

const fullHoldingsCache = new Map<string, ReferenceHolding[]>();

// ─── Donut slices from the mix-level sector map ────────────────────────────
// FundDetail's slice builder is module-private, so this page carries its
// own small loop: a key in the reference palette becomes a named slice in
// its palette color; anything else folds into one gray Other slice
// (including a literal 'Other' key, merged so the chart never carries two
// slices with the same id). Descending order, Other last. After B6
// commit 1 the two mix buckets are palette keys, so 'Money market' and
// 'No sector data' render as their own colored slices — never folded,
// never renormalized away.

function buildMixSlices(sectorExposurePct: Record<string, number>): DonutSlice[] {
  const slices: DonutSlice[] = [];
  let otherPct = 0;

  for (const [key, pct] of Object.entries(sectorExposurePct)) {
    if (pct <= 0) continue;
    if (key in REFERENCE_SECTOR_COLORS && key !== 'Other') {
      slices.push({ id: key, label: key, pct, color: REFERENCE_SECTOR_COLORS[key]! });
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

// ─── Concentration cell (exactly this rule and nothing else) ───────────────

function concentrationCell(
  entries: Array<{ fund_id: string; pct: number }>,
  tickerById: Map<string, string>,
  result: ExampleMixResult,
): string {
  // First: a non-empty mix where every resolved fund is a money market.
  const resolvedTickers = entries
    .map(e => tickerById.get(e.fund_id))
    .filter((t): t is string => t !== undefined);
  if (
    entries.length > 0 &&
    resolvedTickers.length > 0 &&
    resolvedTickers.every(t => MONEY_MARKET_TICKERS.has(t))
  ) {
    return 'Money market';
  }

  // Second: no HHI, or nothing outside the two bucket names.
  const onlyBuckets = Object.keys(result.sector_exposure_pct).every(
    k => k === MONEY_MARKET_BUCKET || k === NO_SECTOR_DATA_BUCKET,
  );
  if (result.hhi === null || onlyBuckets) {
    return '—';
  }

  // Third: the HHI label as plain text (never its color — see render site).
  return hhiLabel(result.hhi).label;
}

// ─── M1 m3: the shared panel's sector identity ─────────────────────────────
// The fund detail's rule, copied so the drill behaves identically here: a
// sector the palette names keeps its own identity, everything else folds
// into 'Other'. Holdings run through the SAME function, so clicking the
// folded 'Other' bar filters to exactly the holdings that folded into it —
// bars, donut wedges and holdings all keyed alike.

function mixSliceIdForSector(sector: string): string {
  return sector in REFERENCE_SECTOR_COLORS && sector !== 'Other' ? sector : 'Other';
}

// ─── Editor columns (M1 m1) ────────────────────────────────────────────────
// `key` names the Fund field a header sorts by; null means the column does
// not sort. The percent column takes the user's own inputs, so it has no
// order of its own to offer.

const MIX_COLUMNS: Array<{ label: string; key: 'ticker' | 'name' | null }> = [
  { label: 'Ticker', key: 'ticker' },
  { label: 'Name', key: 'name' },
  { label: 'Percent of mix', key: null },
];

// ─── Page ──────────────────────────────────────────────────────────────────

export function ReferenceMyMix() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [refFunds, setRefFunds] = useState<ReferenceFund[]>([]);
  const [savedRow, setSavedRow] = useState<ExampleAllocationRow | null>(null);
  const [droppedFromMenu, setDroppedFromMenu] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Editor state: fund_id → the percentage text typed for that fund.
   *  Blank (absent or empty) means the fund is not part of the mix. */
  const [pctText, setPctText] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── M1 m1: column sort, the Funds grid's grammar exactly ────────────────
  // Click a header to sort, click it again to reverse. Only the two fact
  // columns sort; "Percent of mix" holds the user's own inputs and has no
  // natural order to offer. Reordering rows is safe by construction —
  // `pctText` is keyed by fund id and each row's React key is that id, so a
  // typed value stays with its fund no matter where the row moves.
  const [sortKey, setSortKey] = useState<'ticker' | 'name'>('ticker');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const handleSort = (key: 'ticker' | 'name') => {
    if (key === sortKey) {
      setSortDir(d => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sortedFunds = useMemo(
    () =>
      [...funds].sort(
        (a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')) * sortDir,
      ),
    [funds, sortKey, sortDir],
  );

  useEffect(() => {
    Promise.all([fetchFunds(), fetchReferenceScores(), fetchExampleAllocation()]).then(
      ([fundsRes, scoresRes, savedRes]) => {
        if (!fundsRes.data) {
          setLoadError(fundsRes.error || 'Could not load funds.');
        } else if (!scoresRes.data) {
          setLoadError(scoresRes.error || 'Could not load fund data.');
        } else if (!savedRes.data && !isNoSavedMix(savedRes.error)) {
          // A blank first visit (the literal no-saved-mix 404) is not an
          // error — anything else on this call is.
          setLoadError(savedRes.error || 'Could not load your saved mix.');
        } else {
          const menu = fundsRes.data.funds || [];
          setFunds(menu);
          setRefFunds(scoresRes.data.funds || []);
          if (savedRes.data) {
            const row = savedRes.data.allocation;
            setSavedRow(row);
            const menuIds = new Set(menu.map(f => f.id));
            const inMenu = row.allocations.filter(a => menuIds.has(a.fund_id));
            setDroppedFromMenu(row.allocations.length - inMenu.length);
            const initial: Record<string, string> = {};
            for (const a of inMenu) initial[a.fund_id] = String(a.pct);
            setPctText(initial);
          }
        }
        setLoading(false);
      },
    );
  }, []);

  const tickerById = useMemo(
    () => new Map<string, string>(funds.map(f => [f.id, f.ticker])),
    [funds],
  );

  // The current editor entries: every fund with a non-blank input, parsed.
  // The engine ignores lines that don't parse to a positive finite number,
  // so mid-edit text feeds the live results without special casing.
  const entries = useMemo(
    () =>
      funds
        .filter(f => (pctText[f.id] ?? '').trim() !== '')
        .map(f => ({ fund_id: f.id, pct: Number(pctText[f.id]) })),
    [funds, pctText],
  );

  const total = useMemo(
    () => entries.reduce((acc, e) => acc + (Number.isFinite(e.pct) ? e.pct : 0), 0),
    [entries],
  );

  const everyEntryValid = useMemo(
    () => funds.every(f => {
      const t = (pctText[f.id] ?? '').trim();
      return t === '' || isValidPctText(t);
    }),
    [funds, pctText],
  );

  const totalOk = Math.abs(total - 100) <= 0.05;
  const canSave = entries.length > 0 && everyEntryValid && totalOk && !saving && !deleting;

  // ── M1 m2: unsaved-changes state ────────────────────────────────────────
  // Dirty means the editor differs from what is actually on file. Compared
  // as NUMBERS, not as text: the saved mix comes back as String(pct), so
  // "10" and "10.0" are the same mix and neither should raise the notice.
  // A blank input and an absent saved line are likewise the same thing —
  // the fund is not in the mix either way.

  const savedPctById = useMemo(() => {
    const map = new Map<string, number>();
    if (savedRow) {
      const menuIds = new Set(funds.map(f => f.id));
      for (const a of savedRow.allocations) {
        if (menuIds.has(a.fund_id)) map.set(a.fund_id, a.pct);
      }
    }
    return map;
  }, [savedRow, funds]);

  const isDirty = useMemo(() => {
    for (const f of funds) {
      const text = (pctText[f.id] ?? '').trim();
      const savedPct = savedPctById.get(f.id);
      if (text === '') {
        if (savedPct !== undefined) return true;
        continue;
      }
      // Text that does not parse is a change by definition — there is no
      // saved value it could equal.
      const typed = Number(text);
      if (!Number.isFinite(typed)) return true;
      if (savedPct === undefined || Math.abs(typed - savedPct) > 1e-9) return true;
    }
    return false;
  }, [funds, pctText, savedPctById]);

  // The browser's own warning on close, reload, or leaving the site. It does
  // NOT cover moving between tabs inside the app: this app mounts a plain
  // BrowserRouter, so React Router's useBlocker — which needs a data router
  // — is unavailable, and migrating the routing tree is not polish (ruled
  // August 15, 2026). The badge below is what warns in that case.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers act on the assignment rather than preventDefault.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const result = useMemo(
    () => computeExampleMix(funds, refFunds, entries),
    [funds, refFunds, entries],
  );
  const hasMix = entries.some(e => Number.isFinite(e.pct) && e.pct > 0);
  const slices = useMemo(() => buildMixSlices(result.sector_exposure_pct), [result]);

  // ── M1 m3: the shared exposure panel's inputs ───────────────────────────
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // The left column is the donut's own slices as bars — same values, same
  // order, same colors, so the two can never disagree.
  const sectorBars = useMemo<ExposureSector[]>(
    () => slices.map(s => ({ sector: s.label, weight: s.pct, color: s.color })),
    [slices],
  );

  // ── B9 c11: full holdings lists for the chosen funds (?all=1, cached) ──
  const chosenTickers = useMemo(
    () =>
      entries
        .filter(e => Number.isFinite(e.pct) && e.pct > 0)
        .map(e => tickerById.get(e.fund_id))
        .filter((t): t is string => t !== undefined),
    [entries, tickerById],
  );
  const chosenKey = chosenTickers.slice().sort().join(',');

  const [fullHoldings, setFullHoldings] = useState<Record<string, ReferenceHolding[]>>({});
  const [holdingsFetchError, setHoldingsFetchError] = useState<string | null>(null);

  useEffect(() => {
    // F3 cure: clear any stale error whenever the effect re-runs — a
    // transient failure followed by a successful refetch must not leave
    // the holdings sections stuck on the old error.
    setHoldingsFetchError(null);
    // Serve session-cached lists synchronously; fetch only what's missing.
    const fromCache: Record<string, ReferenceHolding[]> = {};
    const toFetch: string[] = [];
    for (const t of chosenTickers) {
      const cached = fullHoldingsCache.get(t);
      if (cached !== undefined) fromCache[t] = cached;
      else toFetch.push(t);
    }
    if (Object.keys(fromCache).length > 0) {
      setFullHoldings(prev => ({ ...fromCache, ...prev }));
    }
    if (toFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const t of toFetch) {
        const res = await fetchReferenceFundDetailFull(t);
        if (cancelled) return;
        if (res.data) {
          const list = res.data.holdings || [];
          fullHoldingsCache.set(t, list);
          setFullHoldings(prev => ({ ...prev, [t]: list }));
        } else {
          setHoldingsFetchError(res.error || 'Could not load the full holdings lists.');
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey]);

  // The holdings sections wait for every chosen fund's full list; the
  // cost, sector, and concentration panels never do.
  const holdingsReady = chosenTickers.every(t => t in fullHoldings);
  const resultFull = useMemo(
    () =>
      holdingsReady
        ? computeExampleMix(funds, refFunds, entries, fullHoldings)
        : null,
    [holdingsReady, funds, refFunds, entries, fullHoldings],
  );

  // The right column. It reads the FULL-depth result once the ?all=1 lists
  // land and the stored top-holdings result before then — so the panel is
  // never empty while it waits, and never claims "no holdings data" when the
  // truth is "not fetched yet". The list deepens in place when the fetches
  // finish. Rows the filing left unclassified keep a null sector: they show
  // in the unfiltered list and no sector claims them.
  const panelHoldings = useMemo<ExposureHolding[]>(
    () =>
      (resultFull ?? result).holdings
        .filter(h => h.combined_weight_pct > 0)
        .map(h => ({
          name: h.name ?? h.key,
          ticker: h.ticker,
          weight: h.combined_weight_pct,
          sector: h.sector === null ? null : mixSliceIdForSector(h.sector),
        })),
    [resultFull, result],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await saveExampleAllocation(entries);
    if (res.data) {
      const row = res.data.allocation;
      setSavedRow(row);
      setDroppedFromMenu(0);
      const next: Record<string, string> = {};
      for (const a of row.allocations) next[a.fund_id] = String(a.pct);
      setPctText(next);
    } else {
      // The server's plain-words message, as sent.
      setSaveError(res.error || 'Could not save your mix. Please try again.');
    }
    setSaving(false);
  };

  const handleClearSaved = async () => {
    setDeleting(true);
    setSaveError(null);
    const res = await deleteExampleAllocation();
    if (res.data) {
      setSavedRow(null);
      setDroppedFromMenu(0);
      setPctText({});
    } else {
      setSaveError(res.error || 'Could not clear your saved mix. Please try again.');
    }
    setDeleting(false);
  };

  // ── Loading and error presentation, mirroring the reference Funds page ──

  if (loading) {
    return (
      <div style={{ padding: theme.spacing.xl, color: theme.colors.textMuted, fontFamily: theme.fonts.body }}>
        Loading…
      </div>
    );
  }

  if (loadError) {
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
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ padding: `${theme.spacing.lg} ${theme.spacing.md}`, fontFamily: theme.fonts.body }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.colors.text, margin: '0 0 4px' }}>
        My Mix
      </h1>
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.lg}` }}>
        Type a percentage next to each fund you want in your example mix —
        one decimal place at most, adding up to 100. Nothing is stored until
        you click Save.
      </p>

      {droppedFromMenu > 0 && (
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.md}` }}>
          {droppedFromMenu === 1
            ? 'One line of your saved mix references a fund that is no longer in the plan menu, so it is not shown here.'
            : `${droppedFromMenu} lines of your saved mix reference funds that are no longer in the plan menu, so they are not shown here.`}
        </p>
      )}

      {/* ── Editor: one row per plan fund, inputs starting blank ── */}
      <div style={{ overflowX: 'auto', marginBottom: theme.spacing.lg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {MIX_COLUMNS.map((col, i) => (
                <th
                  key={col.label}
                  onClick={col.key ? () => handleSort(col.key!) : undefined}
                  style={{
                    textAlign: i === 2 ? 'right' : 'left',
                    padding: '10px 12px',
                    color: theme.colors.textMuted,
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    borderBottom: `1px solid ${theme.colors.border}`,
                    whiteSpace: 'nowrap',
                    cursor: col.key ? 'pointer' : 'default',
                    userSelect: col.key ? 'none' : 'auto',
                  }}
                >
                  {col.label}
                  {col.key && sortKey === col.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedFunds.map(f => {
              const text = pctText[f.id] ?? '';
              const rowInvalid = text.trim() !== '' && !isValidPctText(text);
              return (
                <tr key={f.id}>
                  <td style={{ ...cellStyle, fontFamily: theme.fonts.mono, color: theme.colors.text }}>
                    {f.ticker}
                  </td>
                  <td style={{ ...cellStyle, color: theme.colors.text }}>{f.name}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={text}
                      onChange={e =>
                        setPctText(prev => ({ ...prev, [f.id]: e.target.value }))
                      }
                      aria-label={`Percent of mix for ${f.ticker}`}
                      style={{
                        width: 72,
                        padding: '5px 8px',
                        textAlign: 'right',
                        fontFamily: theme.fonts.mono,
                        fontSize: 13,
                        color: theme.colors.text,
                        background: theme.colors.surface,
                        border: `1px solid ${rowInvalid ? theme.colors.error : theme.colors.border}`,
                        borderRadius: theme.radii.sm,
                      }}
                    />
                    {rowInvalid && (
                      <div style={{ fontSize: 11, color: theme.colors.error, marginTop: 3 }}>
                        A number of at least 0, one decimal place at most
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Running total + Save / clear controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: theme.spacing.md }}>
        <span style={{ fontSize: 14, color: theme.colors.text }}>
          Total:{' '}
          <span style={{ fontFamily: theme.fonts.mono, fontWeight: 700 }}>
            {total.toFixed(1)}%
          </span>
        </span>
        {!totalOk && entries.length > 0 && (
          <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
            must equal 100% to save
          </span>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          style={{
            padding: '8px 18px',
            borderRadius: theme.radii.md,
            border: `1px solid ${canSave ? theme.colors.accentBlue : theme.colors.border}`,
            background: canSave ? theme.colors.accentBlue : 'transparent',
            color: canSave ? '#fff' : theme.colors.textDim,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: theme.fonts.body,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedRow && (
          <button
            onClick={() => void handleClearSaved()}
            disabled={saving || deleting}
            style={{
              padding: '8px 14px',
              borderRadius: theme.radii.md,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
              color: theme.colors.textMuted,
              fontSize: 13,
              fontFamily: theme.fonts.body,
              cursor: saving || deleting ? 'default' : 'pointer',
            }}
          >
            {deleting ? 'Clearing…' : 'Clear saved mix'}
          </button>
        )}
        {savedRow && (
          <span style={{ fontSize: 12, color: theme.colors.textDim }}>
            Saved mix on file — last saved {savedRow.updated_at.slice(0, 10)}
          </span>
        )}
        {/* M1 m2: the inline notice, present exactly while the editor
            differs from what is on file. Factual, not evaluative — it
            reports a state and names the control that clears it. */}
        {isDirty && (
          <span
            style={{
              fontSize: 12,
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.sm,
              padding: '4px 10px',
            }}
          >
            Unsaved changes — click Save to keep them
          </span>
        )}
      </div>

      {saveError && (
        <div
          style={{
            marginBottom: theme.spacing.lg,
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: theme.radii.md,
            color: theme.colors.error,
            fontSize: 13,
          }}
        >
          {saveError}
        </div>
      )}

      {/* ── Results: the factual composite of the current entries ── */}
      {hasMix && (
        <div
          style={{
            background: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            padding: '16px 20px',
          }}
        >
          {/* Blended cost, both registers (detail-page format) */}
          <div style={{ marginBottom: 14 }}>
            <SectionLabel text="Combined expense ratio" />
            {result.blended_expense_ratio_pct !== null && result.blended_expense_dollars_per_10k !== null ? (
              <p style={{ fontSize: 13, color: theme.colors.text, margin: 0 }}>
                {result.blended_expense_ratio_pct.toFixed(2)}%{' '}
                (≈ ${Math.round(result.blended_expense_dollars_per_10k)} per year per $10,000 invested)
                {result.expense_ratio_known_mix_pct < 100 - 1e-9 && (
                  <span style={{ color: theme.colors.textMuted }}>
                    {' '}— this figure covers the {fmtMixPct(result.expense_ratio_known_mix_pct)}
                    {' '}of the mix with a known expense ratio
                  </span>
                )}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
                — no chosen fund has a known expense ratio
              </p>
            )}
          </div>

          {/* Sector donut + legend (composition facts, categorical colors) */}
          <div style={{ marginBottom: 14 }}>
            <SectionLabel text="Sectors across the mix" />
            {slices.length > 0 ? (
              <FundExposurePanel
                sectors={sectorBars}
                holdings={panelHoldings}
                selectedSector={selectedSector}
                onSelectSector={setSelectedSector}
                isMobile={isMobile}
                sectorLimit={null}
                /* H3 t1: the rows may be looked up only once they ARE the
                   ?all=1 holdings — holdings_cache.ticker, the H1-F2 vouched
                   display column. Until those fetches land the list is built
                   from the stored top-holdings blob, whose tickers the display
                   validation never vouched for, so the panel opens on the
                   filed-name-plus-Wikipedia fallback instead of looking up a
                   code the app declined to stand behind. */
                tickersAreDisplayValidated={resultFull !== null}
                center={
                  <DonutChart
                    slices={slices}
                    size={200}
                    onSliceClick={slice =>
                      setSelectedSector(prev => (prev === slice.id ? null : slice.id))
                    }
                  />
                }
              />
            ) : (
              <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
                — nothing to chart yet
              </p>
            )}
          </div>

          {/* Overlap: holdings appearing in two or more chosen funds —
              B9 c11: computed from the funds' complete lists, so overlap
              below any fund's top ten now surfaces. Waits on the ?all=1
              fetches with a plain loading line. */}
          <div style={{ marginBottom: 14 }}>
            <SectionLabel text="Held through more than one fund" />
            {holdingsFetchError ? (
              <p style={{ fontSize: 13, color: theme.colors.error, margin: 0 }}>{holdingsFetchError}</p>
            ) : resultFull === null ? (
              <p style={{ fontSize: 13, color: theme.colors.textDim, margin: 0 }}>
                Loading the funds&apos; full holdings lists…
              </p>
            ) : resultFull.overlaps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resultFull.overlaps.map(o => (
                  <div key={o.key} style={{ fontSize: 13, color: theme.colors.text }}>
                    {o.name ?? o.key}
                    {o.ticker && (
                      <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.textMuted }}>
                        {' '}({o.ticker})
                      </span>
                    )}
                    {' '}— {fmtMixPct(o.combined_weight_pct)} of the mix combined
                    <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                      {o.appears_in.map((a, i) => (
                        <span key={`${a.fund_ticker}-${i}`}>
                          {i > 0 && ' · '}
                          <span style={{ fontFamily: theme.fonts.mono }}>{a.fund_ticker}</span>
                          {': '}{fmtMixPct(a.contribution_pct)} of the mix
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
                No holding appears in more than one of the chosen funds.
              </p>
            )}
          </div>

          {/* B9 c11: the aggregated holdings list across the mix.
              H1 h2: never claims "all" — a contributing fund past the B9
              c5(a) 1,000-row ceiling (VFWAX: 3,918 filed) contributes its
              largest 1,000, so the list is the largest holdings, not all. */}
          <div style={{ marginBottom: 14 }}>
            <SectionLabel text="Holdings across the mix" />
            {holdingsFetchError ? (
              <p style={{ fontSize: 13, color: theme.colors.error, margin: 0 }}>{holdingsFetchError}</p>
            ) : resultFull === null ? (
              <p style={{ fontSize: 13, color: theme.colors.textDim, margin: 0 }}>
                Loading the funds&apos; full holdings lists…
              </p>
            ) : resultFull.holdings.length === 0 ? (
              <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: 0 }}>
                — nothing to list yet
              </p>
            ) : (
              <div>
                <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 4px' }}>
                  Small slivers are normal — a fund holds hundreds of
                  positions, and your mix holds a slice of each.
                </p>
                <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 8px' }}>
                  Showing the {resultFull.holdings.length} largest holdings
                  across the mix, ranked by combined weight.
                </p>
                <div
                  style={{
                    maxHeight: 360,
                    overflowY: 'auto',
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radii.sm,
                  }}
                >
                  {resultFull.holdings.map((h, idx) => (
                    <div
                      key={h.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 10px',
                        borderBottom:
                          idx < resultFull.holdings.length - 1
                            ? `1px solid ${theme.colors.border}`
                            : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: theme.colors.text,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h.name ?? h.key}
                      </span>
                      {h.ticker && (
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: theme.fonts.mono,
                            color: theme.colors.textDim,
                            flexShrink: 0,
                          }}
                        >
                          {h.ticker}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: theme.fonts.mono,
                          color: theme.colors.textMuted,
                          flexShrink: 0,
                          minWidth: 52,
                          textAlign: 'right',
                        }}
                      >
                        {fmtMixPct(h.combined_weight_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Concentration cell — plain text in the page's normal text
              color; the display color hhiLabel ships is never used. */}
          <div>
            <SectionLabel text="Concentration" />
            <p style={{ fontSize: 13, color: theme.colors.text, margin: 0 }}>
              {concentrationCell(entries, tickerById, result)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small shared bits ─────────────────────────────────────────────────────

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

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  verticalAlign: 'top',
};
