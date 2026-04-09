# Assignment 13.4: Add Allocation Display to Portfolio Page

**Session:** 13
**Estimate:** 45 minutes
**Depends on:** 13.3 (client-side allocation module exists)

---

## Spec Reference

- **§6.4** — Risk slider "Affects: Allocation only. Scores do not change."
- **§6.7** — "Two-donut Portfolio view (sector exposure + fund allocation)"
- **MISSING-14** — "Portfolio.tsx shows fund scores and a 'Fund Allocation' donut, but the donut displays top 10 funds by composite score (NOT Kelly allocations). The allocation engine is only called during Brief generation."

## v5.1 Behavior (Reference)

v5.1's PortfolioTab.jsx shows `allocation_pct` per fund in the fund table and powers the Fund Allocation donut chart with real Kelly-computed allocations. The risk slider triggers allocation recomputation.

## Files to Read First

- `client/src/engine/allocation.ts` — the client module you just created in 13.3
- `client/src/pages/Portfolio.tsx` — the full file (712 lines). Pay attention to:
  - Lines 226–259: `rankedScores` useMemo — client-side rescore (you'll feed these into allocation)
  - Lines 318–331: `fundSlices` useMemo — currently uses score-weighted top 10 (MUST BE REPLACED)
  - Lines 427: table headers — need an "Alloc" column added
  - Lines 634–663: risk slider — currently only persists, needs to trigger re-allocation

## Files to Change

- `client/src/pages/Portfolio.tsx`

## What to Do

### 1. Import the client allocation module

At the top of Portfolio.tsx, add:
```typescript
import { computeClientAllocations, type ClientAllocationInput } from '../engine/allocation';
```

### 2. Add an allocation computation useMemo

After the `rankedScores` useMemo (around line 259), add a new useMemo that computes allocations:

```typescript
const allocations = useMemo(() => {
  // Build allocation inputs from the client-rescored composites
  const inputs: ClientAllocationInput[] = rankedScores.map(s => ({
    ticker: s.funds?.ticker || s.fund_id,
    compositeScore: s.userComposite,
    isMoneyMarket: MM_TICKERS.has(s.funds?.ticker || s.fund_id),
    fallbackCount: (s.factor_details as Record<string, unknown>)?.fallbackCount as number ?? 0,
  }));

  return computeClientAllocations(inputs, risk);
}, [rankedScores, risk]);
```

This recomputes whenever scores change (from weight sliders) OR when risk changes (from risk slider).

### 3. Create an allocation lookup map

```typescript
const allocMap = useMemo(() => {
  const map = new Map<string, number>();
  for (const a of allocations) {
    if (a.allocationPct > 0) map.set(a.ticker, a.allocationPct);
  }
  return map;
}, [allocations]);
```

### 4. Replace the Fund Allocation donut

The current `fundSlices` useMemo (around line 318) normalizes top-10 scores to 100%. **Replace it entirely** with allocation-based slices:

```typescript
const fundSlices = useMemo((): DonutSlice[] => {
  return allocations
    .filter(a => a.allocationPct > 0)
    .map((a, i) => ({
      id: a.ticker,
      label: a.ticker,
      pct: a.allocationPct,
      color: FUND_PALETTE[i % FUND_PALETTE.length]!,
    }));
}, [allocations]);
```

### 5. Add an "Alloc" column to the fund table

In the table header row (around line 427), add "Alloc" after "Fund":

```typescript
{['Fund', 'Alloc', 'Score', 'Tier', 'Cost', 'Quality', 'Momentum', 'Position'].map(...)}
```

This makes it an 8-column table. The allocation column is second because it's the most actionable information after the fund name.

In the table body, add a new `<td>` after the Fund name cell (after the closing `</td>` of the ticker/name cell, before the Score cell):

```typescript
{/* Allocation % */}
<td style={{ padding: '10px 16px', textAlign: 'center' }}>
  {(() => {
    const alloc = allocMap.get(ticker);
    if (!alloc) return <span style={{ color: theme.colors.textDim }}>—</span>;
    return (
      <span style={{
        fontWeight: 700,
        fontFamily: theme.fonts.mono,
        color: theme.colors.text,
        fontSize: 14,
      }}>
        {alloc}%
      </span>
    );
  })()}
</td>
```

### 6. Verify slider behavior

The risk slider (`handleRiskChange` at line 221) updates the `risk` state. The `allocations` useMemo depends on `risk`, so it will automatically recompute. No additional wiring needed.

The weight sliders update `weights` state → `rankedScores` recomputes → `allocations` depends on `rankedScores` → allocations recompute. No additional wiring needed.

Both paths produce instant allocation updates with no API calls.

## What NOT to Do

- Do NOT remove or modify the sector exposure donut (left donut) — it stays as-is
- Do NOT change the scoring logic (rankedScores useMemo)
- Do NOT change the weight slider logic
- Do NOT change the risk slider persistence (it should still save to profile)
- Do NOT add any API calls for allocation — this is pure client-side math
- Do NOT change the FundDetail sidebar
- Do NOT change the factor score columns (Cost, Quality, Momentum, Position)

## Verification

1. `tsc --noEmit` — must pass clean
2. Visual inspection of the code:
   - `allocations` useMemo depends on `[rankedScores, risk]` — correct
   - `fundSlices` now uses allocation data, not score-weighted top 10
   - Table has 8 columns (Fund, Alloc, Score, Tier, Cost, Quality, Momentum, Position)
   - Alloc column shows whole percentages or "—" for non-allocated funds
3. No server-side files modified

## Rollback

```
git checkout -- client/src/pages/Portfolio.tsx
```
