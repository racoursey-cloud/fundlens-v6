**STATUS: COMPLETED** — April 8, 2026 (Session 14)

# Assignment 14.3: Scoring Output Validation

**Session:** 14
**Estimate:** 30 minutes
**Depends on:** 14.2 (pipeline has completed with scores in database)

---

## Spec Reference

- **§2.1** — Composite formula (z-standardize → weight → CDF → 0-100)
- **§2.2** — Default weights: Cost 25%, Quality 30%, Momentum 25%, Positioning 20%
- **§2.3** — Cost efficiency scoring curve
- **§2.7** — Money market funds fixed at 50

## Purpose

Spot-check 3+ fund scores against manual calculation to verify the scoring pipeline produces correct output with real data.

## What to Do

### 1. Fetch all scores

```bash
curl -s http://localhost:3000/api/scores \
  -H "Authorization: Bearer <your-jwt>" | jq '.scores[] | {
    ticker: .funds.ticker,
    composite: .composite_default,
    cost: .cost_efficiency,
    quality: .holdings_quality,
    momentum: .momentum,
    positioning: .positioning,
    z_cost: .z_cost_efficiency,
    z_quality: .z_holdings_quality,
    z_momentum: .z_momentum,
    z_positioning: .z_positioning
  }' > /tmp/scores.json
```

### 2. Sanity checks (all funds)

- **Range:** All composites should be 0–100. All factor scores should be 0–100.
- **Money market:** FDRXX and ADAXX should have composite = 50, all factors = 50.
- **Distribution:** Composites should span a reasonable range (not all 50, not all 95). A healthy universe might span 25–85.
- **Z-scores:** Should include both positive and negative values. Mean should be near 0.
- **No nulls:** Every fund should have all 4 factor scores (unless flagged as Low Data).

### 3. Spot-check Fund 1 (pick the highest-scoring non-MM fund)

Fetch its detailed scores and factor_details:

```bash
curl -s http://localhost:3000/api/scores/<TICKER> \
  -H "Authorization: Bearer <your-jwt>" | jq .
```

Verify:
- **Cost efficiency:** Look at the fund's expense ratio. Use the category benchmarks from §2.3 to compute where it falls. Does the score make sense? (e.g., an index fund at 0.03% should score 95+)
- **Holdings quality:** factor_details should show dimension scores. Are profitability/balance sheet/cash flow/earnings/valuation scores reasonable?
- **Momentum:** Check if the fund's 3/6/9/12-month returns are positive or negative. Momentum score should directionally match.
- **Positioning:** Check if the fund's sector exposure aligns with the thesis. A tech-heavy fund during a tech-favorable thesis should score higher.

### 4. Spot-check Fund 2 (pick a mid-range fund)

Same process as Fund 1. Verify the factor scores are directionally reasonable.

### 5. Spot-check Fund 3 (pick the lowest-scoring non-MM fund)

Same process. Verify low scores are justified by the data (high expenses, poor quality metrics, negative momentum, or poor sector alignment).

### 6. Verify composite calculation

For one of the spot-checked funds, manually compute the composite:

```
z_composite = z_cost × 0.25 + z_quality × 0.30 + z_momentum × 0.25 + z_positioning × 0.20
composite = 100 × Φ(z_composite)
```

Where Φ is the normal CDF. Compare against the stored `composite_default`. Should match within ±1 (rounding).

### 7. Document findings

```
## Scoring Validation

### Sanity Checks
- [ ] All composites in 0–100 range
- [ ] All factor scores in 0–100 range
- [ ] Money market funds at composite 50
- [ ] Score distribution spans reasonable range
- [ ] Z-scores include positive and negative values
- [ ] No null factor scores (except Low Data funds)

### Spot-Check Results
| Fund | Composite | Cost | Quality | Momentum | Position | Reasonable? |
|------|-----------|------|---------|----------|----------|-------------|
| [ticker] | [score] | [score] | [score] | [score] | [score] | YES/NO + notes |
| [ticker] | [score] | [score] | [score] | [score] | [score] | YES/NO + notes |
| [ticker] | [score] | [score] | [score] | [score] | [score] | YES/NO + notes |

### Manual Composite Verification
Fund: [ticker]
z_composite = [calculation]
Expected composite = [value]
Actual composite = [value]
Match: YES/NO (±1 rounding tolerance)

### Issues Found
[List any scoring anomalies]
```

## What NOT to Do

- Do NOT modify any source code
- Do NOT rerun the pipeline
- Do NOT adjust scores manually
- Do NOT trust "looks about right" — compute at least one composite manually

## Verification

At least 3 funds spot-checked. At least 1 composite manually verified. All findings documented.
