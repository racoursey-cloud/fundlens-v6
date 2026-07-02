# Assignment 15.1: HHI Concentration Utility Function — COMPLETED

**Session:** 15
**Estimate:** 20 minutes
**Depends on:** None (independent of Session 14 bugfixes)
**Status:** ✅ COMPLETED (Session 15, commit 2c1e4d0)

---

## Spec Reference

- **§6.6** — "HHI (Herfindahl-Hirschman Index) of sector exposure displayed per fund in the detail view. Informational only — not baked into the score."

## Background

The Herfindahl-Hirschman Index measures market concentration. For fund sector exposure:

```
HHI = Σ(sector_share[i]²)
```

Where `sector_share[i]` is the fraction (0–1) of the fund allocated to sector i.

- HHI = 1.0 → fund is 100% in one sector (maximum concentration)
- HHI = 1/N → fund is equally spread across N sectors (maximum diversification)
- For 14 sectors: minimum possible HHI = 1/14 ≈ 0.071

**Industry convention:** HHI is often displayed as 0–10,000 (multiply by 10,000). The DOJ considers:
- < 1,500 → unconcentrated
- 1,500–2,500 → moderately concentrated
- > 2,500 → highly concentrated

For FundLens, we'll compute HHI on the 0–1 scale and display it with a plain-language label.

## Files to Read First

- `client/src/components/FundDetail.tsx` — understand the fund detail sidebar structure
- `client/src/pages/Portfolio.tsx` — understand how sector exposure data flows (the `sectorExposure` in `factor_details`)

## Files to Create

- `client/src/utils/hhi.ts` — new utility file

## What to Do

### 1. Create the HHI utility

Create `client/src/utils/hhi.ts`:

```typescript
/**
 * FundLens v6 — HHI Concentration Index (§6.6)
 *
 * Herfindahl-Hirschman Index of sector exposure.
 * Informational only — not used in scoring or allocation.
 *
 * Session 15: Created for FundDetail sidebar display.
 */

/**
 * Compute the Herfindahl-Hirschman Index from sector weights.
 *
 * @param sectorWeights - Map or record of sector names to weight fractions (0–1, should sum to ~1.0)
 * @returns HHI value (0–1 scale) or null if no sector data
 */
export function computeHHI(sectorWeights: Record<string, number> | undefined): number | null {
  if (!sectorWeights) return null;

  const weights = Object.values(sectorWeights);
  if (weights.length === 0) return null;

  // Normalize weights to sum to 1.0 (in case they don't exactly)
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;

  const normalized = weights.map(w => w / total);
  const hhi = normalized.reduce((sum, w) => sum + w * w, 0);

  return hhi;
}

/**
 * Get a plain-language concentration label from HHI value.
 *
 * @param hhi - HHI on 0–1 scale
 * @returns Label and color for display
 */
export function hhiLabel(hhi: number): { label: string; color: string } {
  // Convert to DOJ-style 0–10,000 scale for threshold comparison
  const hhi10k = hhi * 10_000;

  if (hhi10k > 2500) return { label: 'Highly Concentrated', color: '#EF4444' };
  if (hhi10k > 1500) return { label: 'Moderately Concentrated', color: '#F59E0B' };
  return { label: 'Diversified', color: '#10B981' };
}
```

## What NOT to Do

- Do NOT integrate into FundDetail.tsx yet — that's Task 15.2
- Do NOT use HHI in scoring or allocation — it's informational only (§6.6)
- Do NOT add this to the server-side engine — it's a client-side display utility
- Do NOT add any dependencies — this is pure math

## Verification

1. `tsc --noEmit` — must pass
2. Mental verification:
   - A fund 100% in Technology: HHI = 1.0² = 1.0 → "Highly Concentrated" (correct)
   - A fund split 50/50 in two sectors: HHI = 0.5² + 0.5² = 0.50 → "Highly Concentrated" (correct, only 2 sectors)
   - A fund equally across 10 sectors: HHI = 10 × 0.1² = 0.10 → score 1000 → "Diversified" (correct)

## Rollback

Delete `client/src/utils/hhi.ts`.
