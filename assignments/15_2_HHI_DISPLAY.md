# Assignment 15.2: Add HHI Display to FundDetail Sidebar

**Session:** 15
**Estimate:** 30 minutes
**Depends on:** 15.1 (HHI utility exists)

---

## Spec Reference

- **§6.6** — "HHI of sector exposure displayed per fund in the detail view."
- **§6.7** — "Fund detail sidebar (420px slide-in)"

## Files to Read First

- `client/src/components/FundDetail.tsx` — the fund detail sidebar. Read the entire file. Understand:
  - How it receives fund data
  - What sections it currently displays
  - Where sector exposure data is available (likely from `factor_details.sectorExposure`)
- `client/src/utils/hhi.ts` — the utility you created in 15.1

## Files to Change

- `client/src/components/FundDetail.tsx`

## What to Do

### 1. Import the HHI utility

```typescript
import { computeHHI, hhiLabel } from '../utils/hhi';
```

### 2. Compute HHI from the fund's sector exposure data

Find where the fund's `factor_details` are accessed. Extract the `sectorExposure` (or equivalent key). Compute HHI:

```typescript
const sectorExposure = (factorDetails?.sectorExposure || factorDetails?.sectors) as Record<string, number> | undefined;
const hhi = computeHHI(sectorExposure);
const hhiInfo = hhi !== null ? hhiLabel(hhi) : null;
```

### 3. Add HHI display to the sidebar

Add a small section in the FundDetail sidebar that shows:

```
Sector Concentration
[HHI value] — [label]
```

For example:
```
Sector Concentration
0.18 — Diversified
```

Use the color from `hhiInfo.color` for the label. If HHI is null (no sector data), show "No sector data" in muted text.

Style it consistently with the existing sidebar sections. Keep it compact — one line with the value and label.

### 4. Position in the sidebar

Place the HHI display near the sector exposure information (if the sidebar shows sector breakdown) or in a "Fund Metrics" area. It should be visible but not prominent — it's informational, not a primary metric.

## What NOT to Do

- Do NOT use HHI in any scoring or allocation calculation
- Do NOT add HHI to the fund table (it's sidebar-only per §6.6)
- Do NOT change any other FundDetail functionality
- Do NOT add HHI to server-side code

## Verification

1. `tsc --noEmit` — must pass
2. Code review: HHI is computed from sector exposure data and displayed in the sidebar
3. HHI display is informational only — no connection to scoring or allocation

## Rollback

```
git checkout -- client/src/components/FundDetail.tsx
```
