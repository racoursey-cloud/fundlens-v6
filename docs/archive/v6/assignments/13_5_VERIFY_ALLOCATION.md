**STATUS: COMPLETED** — April 8, 2026 (Session 13)

# Assignment 13.5: Verify Allocation Fix + Update Spec

**Session:** 13
**Estimate:** 20 minutes
**Depends on:** 13.4 (all allocation changes complete)

---

## Spec Reference

- **§3.7** — Worked example with Fund A=85, B=40, C=40, D=30
- **§9, CRITICAL-6** — Must be marked resolved
- **§9, MISSING-14** — Must be marked resolved

## What to Do

### 1. Run TypeScript compiler

```bash
cd <repo-root>
npx tsc --noEmit
```

Must pass with zero errors. If it fails, fix the errors before proceeding.

### 2. Manual calculation verification

Walk through the §3.7 worked example with the new code:

**Input:** Fund A=85, B=40, C=40, D=30. Risk=4 (k=0.95). No money market. No fallbacks.

**Step 1 — MAD z-scores:**
- Median = (40+40)/2 = 40
- Deviations: |85-40|=45, |40-40|=0, |40-40|=0, |30-40|=10
- MAD = median(0, 0, 10, 45) = (0+10)/2 = 5
- mod_z: A = 0.6745 × 45/5 = +6.07, B = 0.0, C = 0.0, D = 0.6745 × (-10)/5 = -1.349

**Step 2 — Quality gate:** No fallbacks → all pass.

**Step 3 — Exponential (k=0.95):**
- A: e^(0.95 × 6.07) = e^5.767 ≈ 320.5
- B: e^(0.95 × 0) = 1.0
- C: e^(0.95 × 0) = 1.0
- D: e^(0.95 × -1.349) = e^(-1.282) ≈ 0.278
- Total = 322.778
- Normalized: A=99.3%, B=0.31%, C=0.31%, D=0.086%

**Step 4 — De minimis 5%:** B (0.31%), C (0.31%), D (0.086%) all < 5% → removed.
- Survivor: A → renormalized to 100%.

**Step 5 — Round:** A = 100%. Sum = 100%. Done.

**Expected output:** Fund A = 100% allocation.

Confirm the code would produce this result by tracing through the logic. Do NOT run the code — just trace the algorithm mentally and verify it matches.

### 3. Verify a balanced case

**Input:** 5 funds all scoring 50. Risk=4 (k=0.95). No MM. No fallbacks.

**Step 1:** Median=50, all deviations=0, MAD=0, safeMad=1e-9.
- mod_z for all: 0.6745 × 0/1e-9 = 0 (effectively)

**Step 3:** All e^(0.95 × 0) = 1.0. Normalized: all 20%.

**Step 4:** All at 20% > 5% → all survive.

**Step 5:** Round: all 20%. Sum=100%.

**Expected:** Equal allocation across all 5 funds. Correct — when scores are identical, allocation is uniform regardless of risk.

### 4. Review git diff

```bash
git diff
```

Confirm only these files were modified:
- `src/engine/constants.ts` — CAPTURE_HIGH/CAPTURE_STEP removed, DE_MINIMIS_PCT added
- `src/engine/allocation.ts` — Step 4 replaced, header comment updated
- `client/src/engine/allocation.ts` — new file (client-side port)
- `client/src/pages/Portfolio.tsx` — allocation import, useMemo, donut, table column

If any other files were modified, flag them and explain why.

### 5. Update FUNDLENS_SPEC.md §9

**CRITICAL-6:** Change status to resolved. Add:
```
**CRITICAL-6: Allocation Engine — Capture Threshold Instead of De Minimis Floor (§3.5) — RESOLVED (Session 13)**
File: `src/engine/allocation.ts`
Status: ✅ Capture threshold replaced with de minimis floor per §3.5. Constants updated: CAPTURE_HIGH/CAPTURE_STEP removed, DE_MINIMIS_PCT: 0.05 added. Single-pass implementation: drop all funds with allocation < 5%, renormalize survivors to 100%. Client-side allocation module created at `client/src/engine/allocation.ts` for instant Portfolio page computation.
```

**MISSING-14:** Change status to resolved. Add:
```
**MISSING-14: Allocation Display on Portfolio Page — RESOLVED (Session 13)**
Status: ✅ Portfolio.tsx now imports client-side computeClientAllocations(). Allocation computed from client-rescored composites + risk tolerance. Fund table shows "Alloc" column with whole percentages. Fund Allocation donut powered by real Kelly allocations (not score-weighted proxy). Both risk slider and weight sliders trigger instant allocation recomputation.
```

### 6. Update FUNDLENS_SPEC.md §10

Add a changelog entry:
```
### April [date], 2026 — Session 13: Allocation Fix + Portfolio Allocation Display

1. **Allocation engine: capture threshold replaced with de minimis floor (§3.5).** CAPTURE_HIGH and CAPTURE_STEP removed from constants. DE_MINIMIS_PCT: 0.05 added. allocation.ts Step 4 now drops individual funds below 5% allocation and renormalizes survivors. Single-pass operation (mathematically proven: removing sub-threshold funds only increases survivor allocations).

2. **Client-side allocation module created.** `client/src/engine/allocation.ts` — pure-math port of server-side allocation engine. No API calls, no server dependencies. Enables instant allocation computation when user changes risk tolerance or factor weights.

3. **Portfolio page now displays real Kelly allocations.** Fund table includes "Alloc" column. Fund Allocation donut powered by actual allocation engine output (was previously score-weighted top 10 proxy). Risk slider and weight sliders both trigger allocation recomputation. Resolves MISSING-14.
```

### 7. Commit and push

Two commits:
1. `Session 13: Replace capture threshold with de minimis floor, add allocation to Portfolio`
2. `Session 13: Update spec §9 + §10`

Push both to main.

## What NOT to Do

- Do NOT change any code in this task — this is verification only
- Do NOT modify any file other than FUNDLENS_SPEC.md
- Do NOT skip the manual calculation verification
- Do NOT commit if tsc --noEmit fails

## Rollback

If verification reveals a bug, go back to the specific task (13.1–13.4) that introduced it and fix there. Do not patch in this task.
