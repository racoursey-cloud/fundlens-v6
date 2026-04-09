# Assignment 14.4: Allocation Output Validation

**Session:** 14
**Estimate:** 20 minutes
**Depends on:** 14.2 (pipeline has completed with scores in database)

---

## Spec Reference

- **§3.1–3.6** — Allocation algorithm (MAD z-score, quality gate, exponential, de minimis, rounding)
- **§3.7** — Worked example

## Purpose

Verify the allocation engine produces correct output with real fund scores. Pick one risk level, compute allocation manually, compare against the engine output.

## What to Do

### 1. Get the composite scores

From the scores fetched in 14.3, extract the composite scores for all non-MM funds. You need: ticker and composite_default for each fund.

### 2. Pick a risk level

Use risk = 4.0 (Moderate, k = 0.95). This is the default and the most commonly tested.

### 3. Manual calculation

Follow §3.2–3.6 with real scores:

**Step 1 — MAD z-scores:**
```
med = median of all non-MM composite scores
mad = median of |score[i] - med| for all non-MM funds
safe_mad = max(mad, 1e-9)
mod_z[i] = 0.6745 × (score[i] - med) / safe_mad
```

**Step 3 — Exponential (k=0.95):**
```
raw_weight[i] = e^(0.95 × mod_z[i])
total = sum of raw_weights
normalized[i] = raw_weight[i] / total × 100
```

**Step 4 — De minimis 5%:**
```
Drop any fund with normalized < 5%
Renormalize survivors to 100%
```

**Step 5 — Round:**
```
Round each to whole %
Absorb error into largest
Sum must be exactly 100%
```

### 4. Compare against engine output

The client-side allocation module (from Session 13) should produce the same result. To test, you can either:

a) Look at the Portfolio page in a browser and compare the Alloc column
b) Write a quick Node script that imports the server-side allocation.ts and runs it

Record both the manual calculation and the engine output.

### 5. Document findings

```
## Allocation Validation

### Input
Risk level: 4.0 (k = 0.95)
Funds: [N] non-MM funds

### Manual Calculation
| Fund | Composite | mod_z | raw_weight | normalized | After de minimis | Rounded |
|------|-----------|-------|------------|------------|-----------------|---------|
| ... | ... | ... | ... | ... | ... | ... |

### Engine Output
| Fund | Alloc % |
|------|---------|
| ... | ... |

### Match: YES/NO
[If NO, describe the discrepancy]

### Observations
- Number of funds surviving de minimis: [N]
- Largest allocation: [ticker] at [N]%
- Smallest allocation: [ticker] at [N]%
- Does the concentration feel right for risk=4 (Moderate)? [yes/no + reasoning]
```

## What NOT to Do

- Do NOT modify any source code
- Do NOT change the allocation algorithm
- Do NOT skip the manual calculation — this is the whole point of the task

## Verification

Manual calculation matches engine output within ±1% per fund (rounding tolerance). Findings documented.
