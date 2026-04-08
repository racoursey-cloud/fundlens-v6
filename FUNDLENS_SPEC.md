# FundLens — Master Specification
## Version 7.0 — Single Source of Truth
**Last updated:** April 7, 2026 (Session 11)
**Owner:** Robert Coursey (racoursey@gmail.com)

---

## HOW TO USE THIS DOCUMENT

This file is the authority for all FundLens development. Every coding session must read it before writing any code. If the code does not match this spec, the code is wrong.

**Rules:**
1. **The spec is the authority, not the code.** If code and spec disagree, fix the code.
2. **No silent changes.** If a session needs to change a decision here, they must update this document as a deliverable and add a Changelog entry (Section 10) explaining what changed and why.
5. **Read Section 9 (Implementation Status) before coding.** It tells you exactly what's working, what's broken, and what's missing. Don't rediscover gaps — they're cataloged.
3. **Evidence Gate Protocol.** Before writing any code, the session must: (a) read this entire document, (b) cite the specific section that governs each design decision, (c) state findings and gaps before coding, (d) verify all interfaces after delivery.
4. **If it's not in this document, ask Robert before building it.**
5. **Set up GitHub push access early.** Before doing any coding work, configure git so you can push directly. See "Repository & Git Setup" below. This saves significant time — do not defer it to end-of-session.

### Repository & Git Setup

**Repo:** `racoursey-cloud/fundlens-v6` (GitHub, private)
**Branch:** `main` (all work lands here unless Robert says otherwise)
**Push token:** Classic PAT named "Phase 2" with full `repo` scope.

**First thing every session — configure the remote with the token:**

```
cd <repo-root>
git remote set-url origin https://racoursey-cloud:<GITHUB_PAT>@github.com/racoursey-cloud/fundlens-v6.git
```

Robert will provide the token value at session start if it is not already configured. If the token is expired or returns a 403, ask Robert to regenerate the "Phase 2" classic token at: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).

**Commit and push conventions:**
- Commit after completing each logical unit of work (don't batch an entire session into one commit).
- Prefix commit messages with the session topic, e.g. `Session 3: Tiingo Integration — add fee data fetcher`.
- Push to `main` after each commit or at minimum before ending the session.
- Always update FUNDLENS_SPEC.md (Section 9 status + Section 10 changelog) as part of the session's final commit.

---

## 1. PRODUCT

FundLens is a 401(k) fund scoring and allocation platform for ~200 coworkers at TerrAscend. It evaluates the funds available in their retirement plan, scores them across four factors using financial data and AI-driven macro analysis, and recommends personalized allocations based on each user's risk tolerance and factor preferences.

**Target user:** The active 401(k) participant who wants to make informed allocation decisions — not a day trader, not a set-it-and-forget-it investor. Someone who reviews their portfolio quarterly and wants to understand why their funds are performing the way they are.

**Product positioning:** FundLens is the advisor that shows up. It proactively delivers a personalized Investment Brief every 30 days, even if the user forgets the platform exists. It democratizes the kind of analysis that institutional investors pay thousands for.

**Fund universe:** ~18 funds in the TerrAscend 401(k) menu. This is a curated, manageable list. Where APIs cannot provide data for a fund, data may be manually maintained in Supabase on a periodic cadence. Every fund in the universe must have complete data for all four scoring factors — no fund should default to 50 due to missing data.

**Scoring philosophy:** Every fund receives one universal score. The score describes how attractive the fund is right now, based on its costs, the financial health of its holdings, its recent price performance, and how well its sector exposure aligns with current macro conditions. The score does not change based on who is viewing it. Risk tolerance affects allocation sizing only, never scoring.

**Theoretical foundation:** The scoring model follows the Black-Litterman framework (1992): three objective factors (Cost Efficiency, Holdings Quality, Momentum) represent the "market equilibrium" view, and one AI-informed factor (Positioning) represents the "views overlay." The 80/20 split between objective factors and the views overlay is conservative by design — forecast errors in the positioning factor cannot overwhelm the fundamentals.

---

## 2. SCORING MODEL

### 2.1 Composite Formula

All scoring operates in z-score space. Raw factor scores (0–100 scale) are standardized to z-scores across the fund universe, weighted, composited in z-space, then mapped back to 0–100 via the normal CDF. This ensures each factor contributes its intended weight regardless of the raw score distribution.

```
Step 1: Compute raw factor scores (0–100) for each fund
  raw_cost[i], raw_quality[i], raw_momentum[i], raw_positioning[i]

Step 2: Standardize each factor to z-scores across the fund universe
  For each factor f:
    mean_f = Σ(raw_f[i]) / n
    stdev_f = √(Σ(raw_f[i] - mean_f)² / (n - 1))    // Bessel-corrected
    z_f[i] = (raw_f[i] - mean_f) / stdev_f

Step 3: Compute weighted composite in z-space
  z_composite[i] = z_cost[i] × W_cost
                  + z_quality[i] × W_quality
                  + z_momentum[i] × W_momentum
                  + z_positioning[i] × W_positioning

Step 4: Map back to 0–100 via normal CDF
  composite[i] = 100 × Φ(z_composite[i])
  composite[i] = round(clamp(composite[i], 0, 100))
```

Where Φ is the standard normal CDF (Abramowitz & Stegun approximation, max error ≈ 7.5 × 10⁻⁸).

### 2.2 Factor Weights (Defaults)

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Cost Efficiency | 25% | Most proven predictor of future fund returns (Morningstar, Sharpe 1966, Carhart 1997, French 2008) |
| Holdings Quality | 30% | Richest data signal; profitability predicts returns (Novy-Marx 2013, Piotroski 2000, Asness et al. 2019) |
| Momentum | 25% | Strongest academic factor evidence (Jegadeesh & Titman 1993, Carhart 1997); vol-adjusted |
| Positioning | 20% | Black-Litterman "views overlay"; FundLens differentiator; lowest weight = conservative sizing for forecast signal |

Weights are user-adjustable via sliders. Defaults are 25/30/25/20. Changing weights triggers an instant client-side rescore (pure math, no API calls). Raw factor scores are the same for everyone.

**Weight redistribution:** When one slider moves, the other three redistribute proportionally to maintain a total of 100%. Minimum 5% per factor prevents any factor from being zeroed out.

### 2.3 Factor 1: Cost Efficiency (25%)

**Source:** Tiingo Mutual Fund & ETF Fee Data API (primary), Supabase manual fallback.

**What it measures:** How much the fund charges, relative to its category peers. Lower is better.

**Category detection:** Inferred from fund name keywords and expense ratio thresholds:
- **Passive/Index:** Name contains "index", "500", "total market", "total stock", "total bond", OR expense ratio < 0.15%
- **Active equity:** Default for equity funds not matching passive criteria
- **Bond:** Name contains "bond", "income", "treasury", "fixed"
- **Target-date:** Name contains "target", "retirement", "lifecycle", a 4-digit year
- **Money market:** Name contains "money market", "cash", "government cash"

**Category percentile benchmarks:**

| Category | p10 | p25 | p50 | p75 | p90 |
|----------|-----|-----|-----|-----|-----|
| Passive | 0.03% | 0.05% | 0.10% | 0.20% | 0.40% |
| Active equity | 0.45% | 0.60% | 0.80% | 1.00% | 1.30% |
| Bond | 0.04% | 0.10% | 0.35% | 0.55% | 0.75% |
| Target-date | 0.08% | 0.12% | 0.40% | 0.65% | 0.90% |
| Money market | 0.10% | 0.20% | 0.35% | 0.45% | 0.60% |
| Default | 0.05% | 0.15% | 0.50% | 0.85% | 1.20% |

**Scoring curve (piecewise linear interpolation):**
- ER ≤ p10 → score 95–100
- p10 < ER ≤ p25 → score 80–95
- p25 < ER ≤ p50 → score 60–80
- p50 < ER ≤ p75 → score 35–60
- p75 < ER ≤ p90 → score 15–35
- ER > p90 → score 0–15

**Enhanced expense analysis (from Tiingo fee data):** When Tiingo provides granular fee breakdowns (12b-1 marketing fees, load fees, distribution fees), these should be factored into the score. A fund with a 0.85% net expense ratio that includes a 0.25% 12b-1 fee should score lower than a fund at 0.85% with no 12b-1 fee, because the marketing fee is pure drag with zero benefit to the investor. Implementation: add a penalty modifier within the cost factor for 12b-1 fees > 0 (suggested: -5 points per 0.10% of 12b-1 fee, capped at -15).

**Money market funds:** Score 50 (neutral). They are not penalized or rewarded on cost — they serve a capital preservation function.

### 2.4 Factor 2: Holdings Quality (30%)

**Source:** FMP Starter API (ratios, key metrics) for equity holdings; EDGAR NPORT-P for bond credit data; Supabase manual fallback.

**What it measures:** Financial health of the companies (or issuers) inside the fund. Profitability, balance sheet strength, cash flow quality, earnings quality, and valuation.

#### 2.4.1 Equity Holdings — Multi-Dimensional Quality Model

Five dimensions, weighted by predictive importance:

| Dimension | Weight | Key Ratios |
|-----------|--------|------------|
| Profitability | 0.25 | Gross Profit Margin, Operating Margin, Net Profit Margin, ROE, ROA, ROIC |
| Balance Sheet | 0.20 | Current Ratio, Quick Ratio, Debt-to-Equity, Debt-to-Assets, Interest Coverage |
| Cash Flow | 0.20 | FCF Yield, Operating CF/Share, Free CF/Share, Income Quality (OCF/Net Income) |
| Earnings Quality | 0.15 | Earnings Yield, Dividend Yield, Payout Ratio, Revenue/Share, Book Value/Share |
| Valuation | 0.20 | P/E, P/B, Price-to-Sales, EV/EBITDA, Price-to-Cash Flow |

**Per-ratio scoring:** Each ratio is scored 0–100 using piecewise thresholds appropriate to the metric (see v6 quality.ts for the full threshold table — those thresholds are carried forward).

**Per-holding aggregation:**
```
holding_score = Σ(dimension_score × dimension_weight)
where dimension_score = mean of available ratio scores within that dimension
```

**Per-fund aggregation (position-weighted):**
```
fund_quality = Σ(holding_score[i] × holding_weight[i]) / Σ(holding_weight[i])
```

**Coverage requirement:** Score only the holdings captured by the holdings pipeline (see Section 4.3 for the 65%/50-holding cutoff). Track coverage_pct = sum of scored holding weights / sum of all holding weights in the cutoff.

**Coverage-based confidence scaling (Grinold 1989):**
```
If coverage_pct < 0.40:
  quality_weight_adj = base_quality_weight × max(coverage_pct / 0.40, 0.10)
  freed_weight = base_quality_weight - quality_weight_adj
  momentum_weight_adj = base_momentum_weight + freed_weight
  Renormalize all weights to sum to 1.0
```
This reduces quality's influence when data is sparse and redistributes to the factor with the most reliable data (momentum — price data is almost always available).

#### 2.4.2 Bond Holdings — Issuer Category Quality Map

For holdings identified as fixed income in NPORT-P filings:

| Issuer Category | Quality Score | Equivalent Rating |
|----------------|--------------|-------------------|
| UST (Treasury) | 1.00 | AAA |
| USG (US Government agency) | 0.95 | AA |
| MUN (Municipal) | 0.80 | A |
| CORP (Corporate, investment grade) | 0.60 | BBB |
| Default / unknown | 0.50 | — |

**Distressed bond adjustments:**
- isDefault = 'Y' → 0.10
- fairValLevel = '3' → 0.35
- debtInArrears = 'Y' → 0.35

```
bond_quality = Σ(issuer_quality[i] × holding_weight[i]) / Σ(holding_weight[i])
bond_quality_scaled = bond_quality × 100    // maps to 0–100
```

#### 2.4.3 Blended Fund Scoring

For funds containing both equity and bond holdings:
```
equity_ratio = Σ(equity holding weights) / Σ(all holding weights)
bond_ratio = 1 - equity_ratio
fund_quality = (equity_quality × equity_ratio) + (bond_quality × bond_ratio)
```

If only equity data exists: fund_quality = equity_quality.
If only bond data exists: fund_quality = bond_quality.
If neither exists: fund_quality = 50 (neutral) with dataQuality flag.

#### 2.4.4 Fund-of-Funds Look-Through

When a holding is itself another fund (investment company):
1. Fetch that sub-fund's NPORT-P filing from EDGAR
2. Score its underlying holdings using the same equity/bond scoring paths
3. Use the resulting score as the holding-level quality score
4. Recursion capped at depth 1 (look through one layer only)
5. Top 10 sub-fund holdings by weight
6. Caches shared across recursion to deduplicate API calls

**Status:** This logic exists in v5.1's quality.js. Verify it is actually executing in production before carrying forward. If it was bypassed in favor of manual data entry, document that decision here.

### 2.5 Factor 3: Momentum (25%)

**Source:** Tiingo EOD prices (primary), FMP historical prices (fallback).

**What it measures:** Recent price performance trends, volatility-adjusted, cross-sectionally ranked. Backward-looking confirmation signal.

#### 2.5.1 Multi-Window Blended Returns

| Window | Weight | Trading Days (~) |
|--------|--------|-------------------|
| 3-month | 0.10 | 63 |
| 6-month | 0.30 | 126 |
| 9-month | 0.30 | 189 |
| 12-month | 0.30 | 252 |

```
For each window w:
  raw_return_w = (latest_close - past_close) / past_close

blended_return = Σ(raw_return_w × window_weight_w)
// Window weights normalized to sum to 1.0 if any window is unavailable
```

Window tolerance: ±5 trading days around the target lookback. If a window has fewer than 2 usable prices, that window is excluded and remaining weights renormalize.

#### 2.5.2 Volatility Adjustment

Before cross-sectional ranking, divide each fund's blended return by its realized volatility to prevent high-volatility funds from dominating the momentum signal:

```
daily_returns = [(close[i] - close[i-1]) / close[i-1] for each day in longest available window]
daily_vol = stdev(daily_returns)
period_vol = daily_vol × √(trading_days_in_window)
vol_adjusted_return = blended_return / period_vol
```

This is a simplified risk-adjusted return (Sharpe-like) that ensures a fund with 12% return and 8% volatility scores higher than one with 15% return and 25% volatility.

#### 2.5.3 Cross-Sectional Z-Score + CDF

```
1. Collect vol_adjusted_return for all funds with data
2. mean = Σ(vol_adjusted_return) / n
3. stdev = √(Σ(vol_adjusted_return - mean)² / (n - 1))    // Bessel-corrected
4. z[i] = (vol_adjusted_return[i] - mean) / stdev
5. z_winsorized[i] = clamp(z[i], -3, 3)
6. momentum_score[i] = 100 × Φ(z_winsorized[i])
```

This produces a continuous S-curve centered at 50. Self-adjusting across market conditions (relative to peers, not absolute). Floor/ceiling hits require extreme statistical outliers (±3 sigma).

**Edge cases:**
- If fewer than 2 funds have valid returns → all funds get 50 (neutral)
- If all returns are identical (stdev = 0) → all funds get 50
- If a single fund has data → score 75
- If no price data available for a fund → score 50 with dataQuality flag

### 2.6 Factor 4: Positioning (20%)

**Source:** Claude Sonnet macro thesis (driven by RSS headlines + FRED macro data + FRED commodity data).

**What it measures:** Whether the fund's sector exposure aligns with current macro conditions. Forward-looking, thesis-driven. FundLens's unique differentiator.

#### 2.6.1 Thesis Generation

Claude Sonnet receives:
- FRED macro indicators (9 economic + 4–5 commodity series — see Section 4.4)
- FRED-derived signals (fed stance, inflation trend, employment health, consumer confidence)
- RSS headlines from 5–7 feeds (see Section 4.5)
- Deterministic FRED-based sector preference priors (see Section 2.6.2)

Claude outputs structured JSON:
```json
{
  "narrative": "2-4 paragraph macro assessment",
  "sectorPreferences": {
    "Technology": { "score": 7.3, "reason": "..." },
    "Healthcare": { "score": 5.8, "reason": "..." },
    ...
  },
  "dominantTheme": "2-4 word label",
  "macroStance": "risk-on | risk-off | mixed",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "riskFactors": ["risk1", "risk2", "risk3"]
}
```

**Sector scores: 1.0 to 10.0 scale (one decimal).**

**Range anchoring rules (enforced in prompt):**
- At least 2 sectors must score 7.0 or above
- At least 2 sectors must score 4.0 or below
- Spread between highest and lowest must be ≥ 4.0 points

These rules prevent Claude from generating wishy-washy "everything is about a 6" outputs.

**14 standard sectors (shared between classification and thesis):**
Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples, Energy, Industrials, Materials, Real Estate, Utilities, Communication Services, Precious Metals, Fixed Income, Cash & Equivalents

#### 2.6.2 Deterministic FRED-Based Sector Preference Priors

Before Claude generates its thesis, the engine computes deterministic sector adjustments from hard FRED data. These are passed to Claude as "priors" that Claude can adjust but must acknowledge:

```
If yield_curve_spread < 0 (inverted):
  Financials prior = -1.0 (headwind)

If CPI_year_over_year > 4%:
  Energy prior = +1.0, Precious Metals prior = +1.0

If fed_funds_rate increasing (latest > 3-month-ago):
  Real Estate prior = -0.5, Utilities prior = -0.5

If unemployment_rate > 5%:
  Consumer Discretionary prior = -0.5, Consumer Staples prior = +0.5
```

These relationships are well-documented in macro-finance research and do not require AI to mediate. Claude's contribution is the nuance — "this particular inflation is supply-driven, so Energy benefits less than usual." The priors ensure a floor of correctness even if Claude has an off day.

**Implementation note:** The specific prior rules above are starting points. Expand this table as FRED data usage matures. Each rule must cite the economic relationship it reflects.

#### 2.6.3 Positioning Score Calculation

Pure math — no Claude call. Computed after thesis generation and holdings sector classification.

```
For each fund:
  For each sector s in fund holdings:
    normalized_pref[s] = (thesis_sector_score[s] - 1) / 9    // maps 1–10 → 0–1
    contribution[s] = fund_sector_weight[s] × normalized_pref[s]

  positioning_score = (Σ contributions / Σ fund_sector_weights) × 100
```

Holdings with null or unclassified sector are grouped separately. Their weight counts toward the denominator but contributes a neutral 0.5 to the numerator (effectively neutral positioning).

Sectors present in fund holdings but absent from thesis default to score 5.0 (neutral).

### 2.7 Special Cases

- **Money market funds** (FDRXX, ADAXX, and any fund classified as money market): Fixed composite score of 50. Skip all factor scoring. Display as "MM" tier in UI. Include in allocation engine at weight 0 (never recommended, but shown in fund list).
- **Null raw scores:** If any factor cannot be computed for a fund, that factor defaults to 50 (neutral) and a dataQuality flag is set. The goal is to eliminate all 50-defaults through complete data coverage of the TerrAscend fund universe.

### 2.8 Worked Example

Given 4 hypothetical funds with raw factor scores:

| Fund | Cost | Quality | Momentum | Positioning |
|------|------|---------|----------|-------------|
| A | 92 | 78 | 81 | 65 |
| B | 45 | 62 | 55 | 70 |
| C | 78 | 71 | 48 | 40 |
| D | 30 | 55 | 70 | 58 |

**Step 2 — Standardize to z-scores (Bessel-corrected):**

Cost: mean=61.25, stdev=28.67
- A: +1.072, B: -0.567, C: +0.584, D: -1.090

Quality: mean=66.50, stdev=10.08
- A: +1.141, B: -0.446, C: +0.446, D: -1.141

Momentum: mean=63.50, stdev=14.84
- A: +1.179, B: -0.573, C: -1.044, D: +0.438

Positioning: mean=58.25, stdev=13.12
- A: +0.514, B: +0.895, C: -1.391, D: -0.019

**Step 3 — Weighted composite in z-space (25/30/25/20):**

Fund A: (1.072×0.25) + (1.141×0.30) + (1.179×0.25) + (0.514×0.20) = 0.268 + 0.342 + 0.295 + 0.103 = **+1.008**
Fund B: (-0.567×0.25) + (-0.446×0.30) + (-0.573×0.25) + (0.895×0.20) = -0.142 + (-0.134) + (-0.143) + 0.179 = **-0.240**
Fund C: (0.584×0.25) + (0.446×0.30) + (-1.044×0.25) + (-1.391×0.20) = 0.146 + 0.134 + (-0.261) + (-0.278) = **-0.259**
Fund D: (-1.090×0.25) + (-1.141×0.30) + (0.438×0.25) + (-0.019×0.20) = -0.273 + (-0.342) + 0.110 + (-0.004) = **-0.509**

**Step 4 — CDF mapping to 0–100:**

Fund A: 100 × Φ(1.008) = 100 × 0.843 = **84**
Fund B: 100 × Φ(-0.240) = 100 × 0.405 = **41**
Fund C: 100 × Φ(-0.259) = 100 × 0.398 = **40**
Fund D: 100 × Φ(-0.509) = 100 × 0.305 = **31**

Note: Funds B and C have nearly identical composites despite very different factor profiles. B is cheap with good positioning; C has strong fundamentals but weak positioning and momentum. The universal score correctly reflects they are equally attractive overall, while the per-factor breakdown reveals *why* — which is what the Investment Brief explains.

---

## 3. ALLOCATION ENGINE

### 3.1 Overview

The allocation engine converts universal fund scores into personalized position sizing based on the user's risk tolerance. Scores are universal; allocations are personal. The same fund scoring 85 will receive a larger allocation for an aggressive investor (concentrated bets on high-conviction picks) than for a conservative investor (spread across more funds).

**Theoretical basis:** Fractional Kelly Criterion (Kelly 1956, applied by Thorp, formalized by Boyd et al. at Stanford as Risk-Constrained Kelly). Grinold & Kahn's Fundamental Law of Active Management governs the relationship between skill signal (scores) and position sizing (transfer coefficient).

### 3.2 Step 1: Modified Z-Score (MAD-Based)

Use Median Absolute Deviation instead of standard deviation for robustness to outliers:

```
For non-money-market funds only:
  med = median(composite_scores)
  mad = median(|score[i] - med|)
  safe_mad = mad > 0 ? mad : 1e-9

  mod_z[i] = 0.6745 × (score[i] - med) / safe_mad
```

The 0.6745 constant makes MAD consistent with standard deviation for normal distributions (it equals 1/Φ⁻¹(0.75)).

### 3.3 Step 2: Quality Gate

```
If fund has 4 or more factor fallbacks (dataQuality flags) → excluded (0% allocation)
```

This prevents the engine from allocating to funds where the score is mostly defaults. The fund still appears in the UI with its score but is marked as "Low Data" and excluded from allocation.

### 3.4 Step 3: Exponential Allocation Curve

```
k = Kelly-fraction-derived parameter from risk level (see table and interpolation below)
raw_weight[i] = e^(k × mod_z[i])
normalized_weight[i] = raw_weight[i] / Σ(raw_weight)
```

**7-Point Risk Scale — Kelly Fraction Anchor Points:**

| Risk Level | Label | Kelly Fraction | k Parameter | Capture Character |
|------------|-------|---------------|-------------|-------------------|
| 1 | Very Conservative | ~0.15 | 0.30 | Very spread out |
| 2 | Conservative | ~0.22 | 0.50 | Diversified with mild tilt |
| 3 | Moderate-Conservative | ~0.30 | 0.70 | Balanced diversification |
| 4 | Moderate | ~0.40 | 0.95 | Moderate concentration |
| 5 | Moderate-Aggressive | ~0.50 | 1.20 | Concentrated |
| 6 | Aggressive | ~0.65 | 1.50 | High conviction |
| 7 | Very Aggressive | ~0.80 | 1.85 | Maximum conviction |

**Continuous interpolation (Session 7 decision):** The risk slider accepts any value from 1.0 to 7.0 (continuous, not integer-only). The k parameter is linearly interpolated between the two nearest anchor points:

```
floor_level = Math.floor(risk_tolerance)
ceil_level  = Math.ceil(risk_tolerance)
fraction    = risk_tolerance - floor_level

If floor_level == ceil_level:
  k = k_table[floor_level]
Else:
  k = k_table[floor_level] + (k_table[ceil_level] - k_table[floor_level]) × fraction
```

Example: risk_tolerance = 5.3 → k = 1.20 + (1.50 - 1.20) × 0.3 = 1.29. This produces a meaningfully different allocation than either 5.0 (k=1.20) or 6.0 (k=1.50).

The 7 named anchor points provide orientation ("I'm somewhere between Moderate and Moderately Aggressive"). The math between them is smooth. Fund count and concentration are emergent properties — no hard-coded fund counts, no stair-step mapping from slider value to fund count, no inverse mapping tables. The number of funds in the allocation is a mathematical consequence of the curve steepness and the de minimis floor.

**Why linear interpolation is sufficient (Session 9 discussion with Robert):** The k-value gaps between anchor points are nearly uniform (0.20 to 0.35), which might suggest the interpolation is "just a straight line." But k feeds into `e^(k × mod_z)`, and the mod_z values themselves have already passed through two non-linear statistical transforms (z-standardization + CDF in the scoring engine, then MAD-based modified z-scoring in the allocation engine). The exponential is the third non-linear layer. Because `e^x` is steeper at higher x, a given increment in k produces a larger allocation shift at the conservative end (low k, where the exponential is flatter and more funds survive the de minimis floor) than at the aggressive end (high k, where the curve is already steep and concentrated). This means the allocation impact per unit of slider movement is inherently non-linear — more sensitive for conservative users, less sensitive for aggressive users — even though the k interpolation itself is linear. Curved interpolation (spline, etc.) was considered and rejected: it would add complexity without perceptible benefit because the non-linearity is already handled by the exponential and the upstream statistical pipeline. If the sensitivity curve ever needs reshaping, the right lever is the anchor k-values themselves, not the interpolation method.

**Are three non-linear transforms too many? (Session 9 discussion with Robert):** Robert asked whether stacking z-standardization → CDF → MAD z-scoring → exponential corrupts the signal. Answer: no, because each layer answers a different question and none are redundant. Layer 1 (z-standardization + CDF, §2.1) makes factors *comparable* — removes scale differences so a cost score clustering 60–90 doesn't dominate a momentum score spreading 20–80. Standard portfolio analytics (Grinold & Kahn). Layer 2 (MAD z-scoring, §3.2) measures fund *separation* — how far each fund stands from the pack. Uses MAD instead of stdev so a single outlier fund (e.g. FXAIX at 92 when everything else is 40–65) doesn't distort the spread measurement for all other funds. Layer 3 (exponential, §3.4) converts separation into *position sizing* — the Kelly criterion application where risk appetite (k) scales how aggressively the portfolio concentrates on high-conviction picks. Each layer preserves fund ordering and relative distances while progressively removing sensitivity to distributional quirks (outliers, skewed factors, fat tails). Corruption would manifest as: meaningfully different funds getting near-identical allocations, or tiny score differences producing wildly different allocations. The §3.7 worked example shows neither pathology. The key insight: Layer 1 z-scores per-factor raw scores (for comparability), Layer 2 z-scores the final composites (for robust separation) — same technique applied to different inputs for different purposes, with MAD in Layer 2 specifically chosen for its outlier robustness, which would be wrong in Layer 1 where you need Gaussian properties for CDF mapping.

### 3.5 Step 4: De Minimis Floor (5%)

```
After normalization:
  Drop any fund with allocation < 5%
  Renormalize survivors to sum to 100%
```

**Research basis:** Industry-standard de minimis threshold. Positions below 5% contribute negligibly to portfolio outcomes (Journal of Financial Economics, 2025 — active fund managers cluster positions asymmetrically below 5%). A 401(k) participant would not realistically set a fund to 3% in their plan interface.

### 3.6 Step 5: Rounding and Error Absorption

```
Round each surviving fund to whole percentage
Absorb rounding error (typically ±1%) into largest position
Final allocation sums to exactly 100%
```

### 3.7 Worked Example

Using the composite scores from Section 2.8 (Fund A: 85, B: 40, C: 40, D: 30) at Risk Level 4 (k = 0.95):

**Step 1 — Modified Z-Scores:**
Median = (40 + 40) / 2 = 40, MAD = median(|85-40|, |40-40|, |40-40|, |30-40|) = median(45, 0, 0, 10) = 5
mod_z: A = 0.6745 × 45/5 = +6.07, B = 0.0, C = 0.0, D = 0.6745 × (-10)/5 = -1.35

**Step 3 — Exponential (k = 0.95):**
A: e^(0.95 × 6.07) = e^5.77 = 320.5, B: e^0 = 1.0, C: e^0 = 1.0, D: e^(-1.28) = 0.28
Normalized: A = 99.3%, B = 0.3%, C = 0.3%, D = 0.1%

**Step 4 — De minimis 5% floor:** Only Fund A survives → 100% allocation to Fund A.

*This example illustrates an extreme case where one fund dominates. With real TerrAscend data (~18 funds with less extreme score separation), the exponential curve produces more balanced distributions.*

---

## 4. DATA STACK

### 4.1 Paid Sources

| Source | Cost | Provides | Used By |
|--------|------|----------|---------|
| FMP Starter | $19/mo | Company ratios, key metrics, balance sheets, income statements, cash flow, profiles, quotes, historical prices (fallback), financial news with sentiment | Holdings Quality (primary), Momentum (fallback) |
| Tiingo | Free tier or paid | Mutual fund NAV history (cleaned, split-adjusted, back to 1970s), mutual fund fee data (net/gross ER, 12b-1, loads, all fee components), EOD equity prices | Momentum (primary), Cost Efficiency (fee data) |

### 4.2 Free Sources

| Source | Provides | Used By |
|--------|----------|---------|
| SEC EDGAR (NPORT-P) | Complete fund holdings with weights, expense ratios, bond credit data, issuer categories, fund metadata | Holdings Quality, Cost Efficiency, Bond quality scoring |
| OpenFIGI | CUSIP-to-ticker resolution (batch API, 100 per request) | Holdings pipeline (maps EDGAR CUSIPs to tickers for FMP lookups) |
| FRED | Macro economic indicators (GDP, unemployment, CPI, fed funds, yields, spread, sentiment, industrial production) + commodity prices (WTI crude, Brent crude, gold, copper, dollar index) | Positioning (thesis context + deterministic priors) |
| EIA | Weekly petroleum status, natural gas storage, renewable energy production | Positioning (supplemental energy/materials data, fetched on weekly cadence, stored in Supabase) |
| Claude API (Haiku) | Sector classification of holdings | Holdings pipeline |
| Claude API (Sonnet) | Macro thesis generation | Positioning |
| Claude API (Opus) | Investment Brief writing | Investment Brief |
| RSS News Feeds | Headlines for thesis context | Positioning, Investment Brief |

### 4.3 Holdings Pipeline

```
For each fund:
  1. Lookup CIK via SEC company_tickers_mf.json
  2. Fetch latest NPORT-P filing from EDGAR
  3. Parse XML → holdings array (name, CUSIP, weight, issuer category, credit data)
  4. Walk holdings by weight (largest first)
  5. Stop when cumulative weight reaches 65% OR 50 holdings, whichever first
  6. Resolve CUSIPs to tickers via OpenFIGI (batch API, 100 per request)
     - Prefer US-listed equities when multiple results returned
     - Cache results in Supabase cusip_cache table
  7. Return enriched holdings array for scoring
```

**OpenFIGI configuration:**
- Endpoint: POST https://api.openfigi.com/v3/mapping
- Batch size: 100 CUSIPs per request
- Conditional X-OPENFIGI-APIKEY header (use key if available, anonymous otherwise)
- Rate limiting: respect 429 responses with backoff

**The 65% value** is a pragmatic coverage threshold for how much of a fund's holdings to analyze. It is NOT related to the (now-removed) allocation capture threshold. This value reflects that the largest holdings drive the fund's character; the long tail of sub-0.5% positions adds noise without signal.

### 4.4 FRED Macro Indicators

**Current (9 economic indicators):**
GDP, Unemployment Rate, CPI, Fed Funds Rate, 2Y/10Y Treasury Yields, Yield Curve Spread, Consumer Sentiment, Industrial Production

**Add (commodity series — same API, same key):**
- DCOILWTICO — WTI Crude Oil (daily)
- DCOILBRENTEU — Brent Crude Oil (daily)
- GOLDAMGBD228NLBM — Gold Price London Fix (daily)
- DTWEXBGS — Trade-Weighted Dollar Index (daily)
- Copper price series (identify appropriate FRED series)

**Derived signals (computed from raw FRED data):**
- Fed stance (tightening/easing/holding based on fed funds rate direction)
- Inflation trend (CPI year-over-year direction)
- Employment health (unemployment rate vs. 12-month trend)
- Consumer confidence (sentiment vs. historical average)

### 4.5 RSS News Feeds

Five confirmed feeds, cached every 120 minutes, 15–20 headlines each (75–100 total per run):

| Feed | Coverage |
|------|----------|
| Google News Business (replaced Reuters) | Global wire service, market-moving events |
| CNBC Economy | US economic conditions, Fed coverage, labor market, inflation |
| CNBC World | Geopolitical events, trade policy, international markets |
| Google News World (replaced AP) | Breaking non-financial events that move markets |
| Federal Reserve Press Releases | Direct monetary policy source |

**Consider adding (for commodity/materials/trade coverage):**
- A commodity-focused feed (e.g., Investing.com commodities RSS or similar)
- A trade/tariff policy feed (USTR or similar)

### 4.6 Data Fallback Chain

| Data Point | Primary | Fallback 1 | Fallback 2 |
|-----------|---------|------------|------------|
| Fund NAV / prices | Tiingo | FMP historical prices | Supabase manual entry |
| Fund expense data | Tiingo fee API | EDGAR NPORT-P | Supabase manual entry |
| Company fundamentals | FMP ratios + key metrics | — | Supabase manual entry |
| CUSIP → ticker | OpenFIGI | FMP search | Supabase manual entry |
| Sector classification | Claude Haiku | Supabase cache (15-day TTL) | Manual classification |
| Bond credit quality | EDGAR NPORT-P issuer category | — | Supabase manual entry |

**Principle:** For the ~18 TerrAscend funds, no fund should ever default to 50 on any factor. If an API can't provide the data, it gets entered manually and cached.

---

## 5. ARCHITECTURE

### 5.1 Stack

- **Server:** Express (Node.js) on Railway — TypeScript
- **Client:** React SPA built with Vite — TypeScript
- **Database:** Supabase Postgres via PostgREST (supaFetch pattern)
- **Auth:** Supabase magic link (only part using Supabase JS client directly)
- **Email:** Resend SMTP (auth links + Investment Brief delivery)
- **AI:** Claude API (Haiku for classification, Sonnet for thesis, Opus for Briefs)
- **Cron:** node-cron in-process on Railway (pipeline daily 2 AM ET, briefs daily 6 AM ET, health hourly)

### 5.2 Architecture Principle

Server-side scoring engine. The pipeline runs on the server, not in the browser. The React client is a display layer that reads scores from Supabase and applies user-specific weighting client-side (pure math rescore via computeComposite — no API calls).

### 5.3 Key Patterns

- **supaFetch():** Universal data access. All Supabase queries route through Express server using service_role key. React client never talks to Supabase directly except for magic link auth.
- **Sequential Claude calls:** All Claude API calls MUST be sequential with 1.2s delays. NEVER Promise.all() for Claude calls. This has broken production 5+ times.
- **All Claude calls** route through /api/claude proxy (Railway injects the key).
- **All FMP/Tiingo/EDGAR calls** have 500ms delays between sequential requests.
- **No localStorage** in engine files.
- **No web_search tool** in any Claude API calls.

### 5.4 Pipeline Steps

```
Step 1:  Fetch fund list from Supabase
Step 2:  Fetch NPORT-P holdings from EDGAR for each fund
Step 3:  Resolve CUSIPs to tickers via OpenFIGI
Step 4:  Fetch company fundamentals from FMP (sequential, rate-limited)
Step 5:  Classify holdings into sectors via Claude Haiku (sequential, 1.2s delays)
Step 6:  Score Holdings Quality factor
Step 7:  Fetch Tiingo fee data; Score Cost Efficiency factor
Step 8:  Fetch Tiingo prices; compute momentum returns per window
Step 9:  Score Momentum factor (vol-adjust, cross-sectional Z + CDF)
Step 10: Fetch cached RSS headlines + FRED macro data (economic + commodities)
Step 11: Compute deterministic FRED-based sector priors
Step 12: Generate macro thesis via Claude Sonnet (with priors, headlines, FRED data)
Step 13: Score Positioning factor (sector alignment × thesis preferences)
Step 14: Standardize all factors to z-scores, compute composite (Section 2.1)
Step 15: Persist scores, thesis, holdings data to Supabase
Step 16: (If Brief triggered) Generate Investment Brief per user via Claude Opus
Step 17: Persist allocation to allocation_history table (§7.7)
```

Each step wrapped in try/catch. Partial results flow forward. Non-fatal failures produce fallback inputs (50 scores, null values).

### 5.5 File Inventory

**Server engine (src/engine/):**
| File | Purpose |
|------|---------|
| constants.ts | All thresholds, weights, API config, factor labels, pipeline steps |
| types.ts | Shared TypeScript interfaces |
| pipeline.ts | Pipeline orchestrator (all steps) |
| edgar.ts | SEC EDGAR NPORT-P XML parser |
| cusip.ts | OpenFIGI CUSIP→ticker resolver |
| holdings.ts | Holdings pipeline: EDGAR fetch → cutoff → CUSIP resolve |
| fmp.ts | FMP API client (ratios, key metrics, prices, profiles) |
| tiingo.ts | Tiingo API client (NAV prices, fee data) |
| cost-efficiency.ts | Cost Efficiency factor scoring |
| quality.ts | Holdings Quality factor scoring (equity + bond + blended + look-through) |
| momentum.ts | Momentum factor scoring (multi-window, vol-adjusted, cross-sectional) |
| positioning.ts | Positioning factor scoring (sector alignment × thesis) |
| scoring.ts | Composite scoring engine (z-standardize, weight, CDF map, tier badges) |
| allocation.ts | Allocation engine (MAD z-score, Kelly exponential, de minimis, rounding) |
| classify.ts | Claude Haiku sector classification |
| thesis.ts | Claude Sonnet macro thesis generation |
| fred.ts | FRED macro data + commodity prices |
| rss.ts | RSS feed fetcher |
| brief-engine.ts | Investment Brief generator (data packet, allocation, Claude Opus) |
| brief-email.ts | Brief email delivery via Resend |
| brief-scheduler.ts | Brief eligibility checker (30-day cadence) |
| cache.ts | Supabase cache service (FMP, Tiingo, Finnhub fees, sector classifications) |
| persist.ts | Supabase persistence (scores, thesis, holdings) |
| monitor.ts | System health checks |

**Server infrastructure (src/):**
| File | Purpose |
|------|---------|
| server.ts | Express entry point, CORS, routes, cron jobs, static file serving |
| routes/routes.ts | API endpoints (funds, scores, profile, pipeline, briefs, thesis, health) |
| services/supabase.ts | supaFetch() and helpers |
| middleware/auth.ts | JWT decode + HMAC-SHA256 verification |
| prompts/editorial-policy.md | Versioned editorial policy for Brief generation |

**Client (client/src/):**
| File | Purpose |
|------|---------|
| App.tsx | Route definitions |
| main.tsx | React entry point |
| auth.ts | Supabase client, magic link sign-in |
| api.ts | Typed fetch wrapper with JWT auth |
| theme.ts | Dark theme constants |
| context/AuthContext.tsx | Auth state management |
| components/AppShell.tsx | Navigation shell (responsive) |
| components/ProtectedRoute.tsx | Auth guard |
| components/FundDetail.tsx | Fund detail sidebar |
| components/ErrorBoundary.tsx | Error boundary |
| pages/Login.tsx | Magic link login |
| pages/SetupWizard.tsx | Onboarding wizard |
| pages/AuthCallback.tsx | Auth redirect handler |
| pages/Portfolio.tsx | Main portfolio view |
| pages/Briefs.tsx | Investment Brief page |
| pages/Pipeline.tsx | Pipeline monitoring page |

### 5.6 Environment Variables (Railway)

| Variable | Purpose |
|----------|---------|
| OPENFIGI_API_KEY | OpenFIGI CUSIP resolution |
| FMP_API_KEY | FMP Starter (fundamentals, profiles, prices fallback) |
| TINNGO_KEY | Tiingo (prices, fee data) — intentional typo, do not correct |
| ANTHROPIC_API_KEY | Claude API (Haiku, Sonnet, Opus) |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key (client auth) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role (server bypass RLS) |
| SUPABASE_JWT_SECRET | JWT signature verification |
| FRED_API_KEY | FRED macro data |
| RESEND_API_KEY | Email delivery |
| IS_PRODUCTION | Enables cron jobs when "true" |
| PORT | Auto-set by Railway |
| VITE_SUPABASE_URL | Client-side Supabase URL |
| VITE_SUPABASE_ANON_KEY | Client-side Supabase anon key |

---

## 6. UI RULES

### 6.1 Visual Design (Permanent)

- **Background:** #0e0f11
- **Surface:** #16181c
- **Borders:** #25282e
- **Accent:** #3b82f6 (blue)
- **Primary font:** Inter
- **Data font:** JetBrains Mono
- **Theme:** Dark only. No light theme. Ever.

### 6.2 Score Display

- **Scale:** 0–100, displayed as whole numbers
- **Color coding:** Green ≥ 75, Blue ≥ 50, Amber ≥ 25, Red < 25
- **Factor display names:** Cost, Quality, Momentum, Positioning
- **Composite label:** "FundLens Score" or simply "Score"

### 6.3 Tier Badges (from Modified Z-Score in allocation engine)

| Tier | Z-Score Threshold | Color |
|------|-------------------|-------|
| BREAKAWAY | ≥ 2.0 | Amber/Gold |
| STRONG | ≥ 1.2 | Green |
| SOLID | ≥ 0.3 | Blue |
| NEUTRAL | ≥ -0.5 | Gray |
| WEAK | < -0.5 | Red |
| MONEY MARKET | — | Muted "MM" |
| LOW DATA | 4+ fallbacks | Muted "Low Data" |

### 6.4 Risk Tolerance Control

- **Type:** Continuous slider (1.0 to 7.0, supports fractional values like 5.3)
- **Label:** "Investment Style"
- **Left end (1.0):** "Very Conservative"
- **Right end (7.0):** "Very Aggressive"
- **Default:** 4.0 ("Moderate")
- **Anchor points:** 7 named positions shown as tick marks/labels on the slider (see §3.4 table). Users can stop anywhere between them.
- **Affects:** Allocation only. Scores do not change. The k parameter is interpolated between anchor points (§3.4) so every slider position produces a unique allocation.
- **Storage:** `risk_tolerance` stored as FLOAT in `user_profiles`. Validation: 1.0 ≤ value ≤ 7.0.

### 6.5 Factor Weight Sliders

- Four sliders, one per factor
- Proportional redistribution when one moves
- Minimum 5% per factor
- Default: 25/30/25/20 (Cost/Quality/Momentum/Positioning)
- Changing weights triggers instant client-side rescore

### 6.6 Concentration Display

HHI (Herfindahl-Hirschman Index) of sector exposure displayed per fund in the detail view. Informational only — not baked into the score. Users can see at a glance whether a fund is concentrated in one sector or broadly diversified.

### 6.7 UI Components (Carry Forward from v6)

- SVG-only charts (no canvas, no third-party chart libraries)
- Setup wizard flow (onboarding)
- Two-donut Portfolio view (sector exposure + fund allocation)
- Fund detail sidebar (420px slide-in)
- Pipeline status indicator
- Investment Brief page (current + history)
- Responsive: mobile bottom tab bar, tablet collapsed sidebar, desktop full sidebar
- Error boundary wrapping entire app

---

## 7. INVESTMENT BRIEF

### 7.1 What It Is

A personalized monthly Investment Brief delivered to each user. Named "Investment Brief" — not "letter," not "report." This is FundLens's core product — the thing that makes 401(k) participants feel like they have a personal advisor. The scores and charts are supporting evidence; the Brief is the value.

**Design philosophy:** The best advisory communications feel like a conversation with a knowledgeable advisor, not a data dump. FundLens's Brief should read like advice from a smart friend who's great with money — someone you'd trust at a company cookout when you pull them aside to ask about your 401(k). Confident, clear, occasionally witty, never condescending. Not a financial advisor in a suit, not a Reddit poster.

**Research basis:** Industry best practices surveyed across JPMorgan quarterly outlooks, Glass Lake Wealth Management client letters, Andrew Hill Investment Advisors quarterly letters, Fidelity Quarterly Market Perspectives, and investment writing research (Susan Weiner, InvestSuite, InData). Key findings: readers prefer under 2 pages, prioritize investment strategy and performance attribution over generic commentary, and want to understand "how and why they made or lost money." The best letters combine macro narrative with specific fund-level reasoning and feel personal, not templated.

### 7.2 Brief Structure — 4 Sections

The Brief follows a "lead with the answer" structure. The recommendation is the opening, not the conclusion. Everything after it is the evidence that backs it up. This signals confidence and respects the reader's time — your buddy who's good at markets leads with what they'd do, then explains why.

**Section 1: "Where the Numbers Point"** — The Recommendation
Named funds, allocation percentages, and a sentence or two per fund explaining why in plain investment language. This is the most valuable section — a reader who only has 30 seconds gets the full actionable answer here. Example of good fund reasoning: "FXAIX at 40% — it holds profitable, well-run companies, it's been on a solid run, and at 0.015% it's basically free. Hard to beat that combination." Every recommended fund gets a brief, genuine explanation.

**Section 2: "What Happened"** — Market Narrative + Portfolio Changes
Combines macro context with what changed in the allocation since last month, and why. This is one cohesive narrative — cause and effect together, not separated into redundant sections. Grounded in real headlines from RSS feeds and real numbers from FRED data. Length is driven by relevance, not an arbitrary cap — could be 2 paragraphs in a quiet month or 5 in a volatile one. Must reference specific events, indicators, and data points. Should feel like catching up on what happened over coffee.

**Section 3: "What We're Watching"** — Risks + Catalysts
Short, punchy. 3-5 items that could change the picture. "Fed meeting June 12 — any hawkish surprise could hit bond-heavy funds." "Oil above $85 is good for Energy but squeezes Consumer Discretionary." Translates FRED priors and macro thesis into plain language that a non-expert can act on.

**Section 4: "Where We Stand"** — Sector Scorecard
Which sectors we favor, which we're cautious on, and why. Presented as a visual grid in the UI (14 sectors, each with a stance: Favor / Neutral / Cautious and a one-line reason). This is the deep dive for readers who want to understand the thesis behind the recommendations. Backed by deterministic FRED priors (§2.6.2) and Claude's macro analysis.

### 7.3 Voice and Tone

**Voice:** A knowledgeable friend who does well in the market. Somewhere between approachable professional and conversational direct. Not stuffy institutional, not casual Reddit. The kind of person who says "here's what I'd do" and you trust them because they've clearly done their homework.

**Characteristics:**
- Confident but not arrogant — states views directly without hedging everything
- Uses plain English — explains financial concepts naturally, not with textbook definitions
- Specific, not vague — names funds, cites numbers, references real events
- Occasionally witty but never flippant about someone's retirement savings
- Candid about negatives — if a fund has a problem, says so plainly
- Never condescending — assumes the reader is smart, just not a financial professional

### 7.4 Prohibited Language — "Behind the Curtain" Rule

The Brief must never expose the scoring model's internal mechanics. The reader should never think "a computer wrote this" or "this is a formula talking." If they want to understand the model, the Help section gives accurate answers. The Brief reads like an advisor's genuine assessment, not a scorecard readout.

**Never use in the Brief:**
- Factor names as technical terms ("Cost Efficiency factor," "Holdings Quality score")
- Weights or percentages of the model ("weighted at 30%," "our highest-weighted factor")
- Scoring terminology ("z-score," "composite score," "MAD z-score," "CDF mapping")
- Model language ("our scoring engine," "our model rates," "based on our analysis framework")
- Phrases that reveal ranking mechanics ("receives our highest rating," "scores 85 out of 100")
- Any reference to how factors are combined or weighted

**Instead, use natural investment language:**
- "holds profitable, well-run companies" (not "high Holdings Quality score")
- "one of the cheapest funds in the plan" (not "Cost Efficiency score of 95")
- "has been on a strong run lately" (not "Momentum score of 78")
- "its sector mix lines up well with where the economy is headed" (not "Positioning score of 82")

### 7.5 Data Feed — What Claude Sees

Claude Opus receives the raw investment data, not pre-digested summaries and not model outputs. This prevents both "leading the witness" (pre-written descriptions that Claude parrots) and model leakage (scores that Claude references). Claude gets the same briefing packet an analyst would get and forms its own narrative.

**Data packet contents:**
- **Per fund:** Expense ratio + category + peer percentile rank. Top 10 holdings with actual financial ratios (margins, ROE, debt levels, cash flow metrics). 3/6/9/12-month returns and realized volatility. Sector breakdown percentages. Whether it's new to the allocation, removed, or changed weight.
- **Macro context:** Full RSS headlines from the last 30 days. All FRED indicators with current values and direction (yield curve, CPI, fed funds rate, employment, commodity prices). Deterministic sector priors with the reasoning.
- **Thesis:** Claude Sonnet's macro thesis narrative, sector preferences (1-10 scale), dominant theme, macro stance, risk factors.
- **Allocation:** The computed allocation output from the allocation engine — fund names, percentages, tier labels. Previous month's allocation for delta computation.
- **User profile:** Risk tolerance level (continuous 1.0-7.0), factor weight preferences.

**What Claude does NOT receive:** Raw factor scores (0-100), z-scores, factor weights as model percentages, composite scores, MAD z-scores, tier threshold definitions, or any description of how the scoring model works.

### 7.6 Editorial Rules (Retained from v1)

**Evidence rules:**
- Every claim must trace to a specific data point in the input packet
- Never characterize a fund positively without citing the metric that supports it
- Never characterize a fund negatively without citing the metric that supports it
- If you reference a holding, state its weight in the fund
- If you reference a macro indicator, state its value and direction

**Honesty rules:**
- Never omit a material negative
- Never invent a reason to own a fund
- If no data supports a recommendation, do not manufacture one
- Conservative and aggressive users see the same facts; emphasis differs, truth doesn't

**Language rules:**
- Never imply certainty about future performance
- Use "may," "could," "historically," "tends to," "is positioned to"
- Never use exclamation points or sales language
- No filler phrases ("in today's market," "as we all know")

### 7.7 Allocation Persistence

Every Brief generation persists its allocation to an `allocation_history` table in Supabase. This enables:
- **"What Changed" narrative:** The Brief compares current vs. previous allocation to identify new positions, removed positions, and weight changes.
- **Consistency tracking:** Users can see their allocation history over time. Consistency builds confidence.
- **Future feature:** Performance attribution — did last month's recommendation outperform?

**Table: `allocation_history`**
```
id:              UUID (PK)
user_id:         UUID (FK → auth.users)
pipeline_run_id: UUID (FK → pipeline_runs)
brief_id:        UUID (FK → briefs, nullable — null for pipeline-only runs)
risk_tolerance:  FLOAT (user's risk level at time of allocation)
allocations:     JSONB (array of { ticker, pct, tier, tierColor })
created_at:      TIMESTAMPTZ
```

### 7.8 Delivery

- **Automatic:** Sent via Resend email every 30 days after signup
- **On-demand:** User can generate anytime from the app
- **History:** All past Briefs archived and viewable
- **Target length:** 600-1000 words. Substantive enough to feel valuable, short enough to read in one sitting. Research shows >40% of advisory clients prefer under 2 pages.

### 7.9 Negative Examples (Anti-Patterns for Prompt)

These examples are included in the Claude Opus system prompt to anchor what bad Brief writing looks like:

**BAD — Exposes model mechanics:**
"FXAIX receives our highest rating due to its strong performance in the Holdings Quality factor, which is weighted at 30% of our composite score. Combined with a Cost Efficiency score of 95 and Momentum z-score of 1.47, it achieves a composite of 84."

**BAD — Generic, no specifics:**
"Markets were volatile this month. We recommend staying diversified across your fund options. Some funds performed better than others."

**BAD — Pre-digested, templated:**
"FXAIX has strong holdings quality, solid momentum, favorable positioning, and low costs." (Reads like a checklist, not analysis.)

**GOOD — Natural advisor voice:**
"FXAIX is our top pick this month. The companies it holds — Apple, Microsoft, Nvidia — are printing money. Apple's gross margins are sitting at 46%, Microsoft at 69%. These aren't speculative bets; they're cash machines. The fund's been up 24% over the past year, expenses are basically zero at 0.015%, and with tech and healthcare making up nearly half the portfolio, it's well-positioned for the current growth environment. The one thing to keep an eye on: it's heavily concentrated in mega-cap tech. If that trade reverses, this fund feels it first."

---

## 8. DO NOT BUILD

| Item | Reason | Date Killed |
|------|--------|-------------|
| predictROI function | Removed in v3, resurrects bad UX patterns | Pre-v5 |
| Light theme | Dark with blue accent is final and permanent | Pre-v5 |
| Manager quality scoring | No reliable live data source; replaced by Holdings Quality | v5.1 |
| Mandate scoring via Claude | Non-deterministic, high variance between runs; replaced by sector alignment math | v5.1 |
| Sharpe ratio as standalone factor | Subsumed into vol-adjusted momentum | v5.1 |
| Web search tool in Claude calls | Never. Produces inconsistent, uncontrollable results. | v5.1 |
| Flow modifier (±0.2) | Academic evidence is contrarian for mutual funds (Frazzini & Lamont 2008); removed | v7 |
| Turnover modifier | Insufficient signal for the complexity; cost already captured by expense factor | v7 |
| Concentration penalty on scores | Muddled "how good is this fund" with "how comfortable should this person feel"; risk belongs in allocation only (Grinold & Kahn) | v7 |
| Risk tolerance in scoring | Scores must be universal — same fund, same score, regardless of viewer. Risk affects allocation only. | v7 |
| FMP CUSIP endpoint | Requires Professional plan ($99/mo), returns 403 on Starter. Use OpenFIGI instead. | v6 Session 12 |
| Culture/trends in scoring | Adds noise to objective model; use in Brief narrative only when applicable | v7 |
| Prediction tracking / cycle accuracy | Removed from scope | Pre-v5 |
| Shared portfolios, PDF export | Post-launch, if ever | Deferred |

---

## 9. IMPLEMENTATION STATUS

**Last updated:** April 7, 2026 (after Session 11)

This section tells future sessions exactly what state the codebase is in relative to this spec. **Read this before writing any code.** If a feature is listed as "BROKEN" or "MISSING," the code does not match the spec and must be fixed.

### 9.1 What's Working (Matches Spec)

| Feature | Spec Section | File(s) | Notes |
|---------|-------------|---------|-------|
| Default factor weights | §2.2 | constants.ts | 25/30/25/20 (Cost/Quality/Momentum/Positioning) — corrected Session 1 |
| Category benchmarks for cost scoring | §2.3 | cost-efficiency.ts | All 6 categories, piecewise linear interpolation |
| Holdings cutoff 65%/50 | §4.3 | constants.ts, holdings.ts | TARGET_WEIGHT_PCT=65, MAX_HOLDINGS=50 |
| Quality 5 dimensions at correct weights | §2.4.1 | quality.ts | 0.25/0.20/0.20/0.15/0.20 |
| 25+ financial ratios scored | §2.4.1 | quality.ts | All ratios from spec present |
| Position-weighted fund quality aggregation | §2.4.1 | quality.ts | Σ(score×weight)/Σ(weight) |
| Multi-window momentum blend | §2.5.1 | momentum.ts | 3/6/9/12-month at 10/30/30/30, renormalize missing |
| 14 standard sectors | §2.6.1 | thesis.ts | Exact list from spec |
| Claude sequential calls with 1.2s delay | §5.3 | constants.ts, pipeline.ts | CLAUDE_CALL_DELAY_MS=1200, never Promise.all |
| API call delay 500ms | §5.3 | constants.ts, pipeline.ts | API_CALL_DELAY_MS=500 |
| RSS feeds (5 feeds, 120min cache) | §4.5 | constants.ts, rss.ts | All 5 feeds configured |
| EDGAR User-Agent | §4.1 | constants.ts | FundLens fundlens.app racoursey@gmail.com |
| OpenFIGI batch 100 | §4.3 | constants.ts | BATCH_SIZE=100 |
| FMP /stable/ endpoints | §4.1 | constants.ts | Migrated from /api/v3/ |
| UI theme colors | §6.1 | constants.ts | #0e0f11, #16181c, #25282e, #3b82f6 |
| Fonts | §6.1 | constants.ts | Inter + JetBrains Mono |
| Brief delivery interval 30 days | §7.5 | constants.ts | DELIVERY_INTERVAL_DAYS=30 |
| Weight redistribution slider logic | §6.5 | scoring.ts | Proportional, 5% min per factor |
| Weight validation sum to 1.0 | §2.2 | scoring.ts, routes.ts | ±0.02 tolerance |
| Kelly risk table constants | §3.4 | constants.ts | 7 levels, k=0.30 to 1.85 — added Session 1 |
| Tier badge constants | §6.3 | constants.ts | 5 tiers + MM + Low Data — added Session 1 |
| Risk scale 1–7 validation | §6.4 | routes.ts | RISK_MIN=1, RISK_MAX=7 — fixed Session 1 |
| Brief model = Opus | §4.2 | constants.ts | claude-opus-4-6 — fixed Session 1 |
| Security hardening | — | server.ts, routes.ts, thesis.ts, classify.ts, edgar.ts, Briefs.tsx | Session 0 complete |
| CUSIP resolver: Supabase cache wired in | §4.3 | cusip.ts | cusipCacheLookup/cusipCacheSave with negative caching — Session 2 |
| CUSIP resolver: OpenFIGI → FMP search fallback chain | §4.6 | cusip.ts | OpenFIGI primary, FMP searchByName fallback, cache save — Session 2 |
| CUSIP resolver: US equity preference | §4.3 | cusip.ts | Prefers US-listed equities from OpenFIGI results — verified Session 2 |
| CUSIP resolver: 429 rate limit retry | §4.3 | cusip.ts | 10s backoff + single retry — verified Session 2 |
| Fund-of-funds look-through depth = 1 | §2.4.4 | holdings.ts | MAX_LOOKTHROUGH_DEPTH=1 — fixed Session 2 (was 2) |
| pctOfNav whole-percent units documented | §4.3 | types.ts | Doc comments corrected from "0.0–1.0" to whole-percent — Session 2 |
| Tiingo API client (NAV prices) | §4.1, §4.6 | tiingo.ts | fetchTiingoPrices(), convertTiingoPricesToFmpFormat() — Session 3. NOTE: fetchFundFees() exists but Tiingo fee endpoint returns 404 — Finnhub is primary for fee data. |
| Tiingo constants and endpoint config | §4.1, §5.6 | constants.ts | TIINGO config block, TINNGO_KEY env var (intentional typo) — Session 3 |
| Pipeline: Tiingo primary for prices (Step 8) | §4.6 | pipeline.ts | Tiingo → FMP fallback chain for NAV/price data — Session 3 |
| Pipeline: Finnhub primary for expense ratios (Step 7a) | §4.6 | pipeline.ts, finnhub.ts | Finnhub → FMP → static fallback → persist to funds table — Session 4 continuation |
| Finnhub API client (expense ratios, fee data) | §2.3, §4.1 | finnhub.ts | fetchFinnhubExpenseRatio(), fetchExpenseRatio(), KNOWN_EXPENSE_RATIOS static map — Session 4 continuation |
| Cost Efficiency: 12b-1 fee penalty | §2.3 | cost-efficiency.ts, finnhub.ts | -5 pts per 0.10% of 12b-1, capped at -15 — Session 3. Finnhub fee12b1 wired Session 5. |
| Momentum: volatility-adjusted returns | §2.5.2 | momentum.ts | Barroso & Santa-Clara 2015: blended / period_vol — Session 5 |
| Momentum: z-score + CDF scoring | §2.5.3 | momentum.ts | Bessel z-standardize → winsorize ±3σ → normalCDF → 0-100 — Session 5 |
| Bond quality scoring (issuer category map) | §2.4.2 | quality.ts | UST=1.0, USG=0.95, MUN=0.80, CORP=0.60 + distressed adjustments — Session 5 |
| Blended equity/bond fund scoring | §2.4.3 | quality.ts | Weighted by portfolio share — Session 5 |
| Coverage-based confidence scaling | §2.4.1 | pipeline.ts, scoring.ts | Per-fund weight adjustment when coverage < 40% (Grinold 1989) — Session 5 |
| NPORT-P bond field parsing | §2.4.2 | edgar.ts, types.ts | isDebt, fairValLevel, debtIsDefault, debtInArrears from <debtSec> — Session 5 |
| Cost Efficiency: accepts NormalizedFeeData | §2.3, §4.6 | cost-efficiency.ts | Accepts optional NormalizedFeeData parameter — Session 3 |
| Sector exposure in factor_details | §6.6 | pipeline.ts, scoring.ts | sectorExposure map built from classified holdings, stored in factor_details for UI donut chart — Session 4 continuation |
| Helmet CSP allows Supabase auth | §5.1 | server.ts | Explicit CSP directives: connect-src allows https://*.supabase.co and wss://*.supabase.co — Session 4 continuation |
| Composite scoring: z-space + CDF pipeline | §2.1 | scoring.ts | `scoreAndRankFunds()` → `zStandardize()` → weighted z-sum → `normalCDF()` → 0–100. Bessel-corrected. A&S 7.1.26. — Session 4 |
| Normal CDF: Abramowitz & Stegun | §2.1 | scoring.ts | `normalCDF()` max error ≈ 7.5 × 10⁻⁸. Validated against §2.8 worked example. — Session 4 |
| Z-scores persisted for client rescore | §2.1, §5.2 | persist.ts, types.ts | `z_cost_efficiency`, `z_holdings_quality`, `z_positioning`, `z_momentum` columns — Session 4 |
| Client-side rescore uses z-scores + CDF | §2.1, §5.2 | Portfolio.tsx | Weighted z-sum + `normalCDF()`. No universe data needed client-side. — Session 4 |
| Fallback: <2 funds → raw weighted average | §2.1 | scoring.ts | Z-standardization undefined for n<2, graceful fallback — Session 4 |
| Weight validation: ±0.02 tolerance, 5% min | §2.2 | scoring.ts | `validateWeights()` updated to spec tolerances — Session 4 |
| Thesis: 1.0–10.0 continuous sector scale | §2.6.1 | thesis.ts | Range anchoring: ≥2 sectors ≥7.0, ≥2 ≤4.0, spread ≥4.0. Replaces -2/+2 integer scale — Session 6 |
| Positioning: correct normalization | §2.6.3 | positioning.ts | `(score - 1) / 9` maps 1–10 → 0–1. Unclassified = neutral 0.5 — Session 6 |
| Deterministic FRED sector priors | §2.6.2 | thesis.ts | `computeSectorPriors()`: yield curve, CPI, fed stance, employment rules — Session 6 |
| FRED commodity series | §4.4 | fred.ts, constants.ts | WTI, Brent, Gold, Dollar Index in INDICATOR_META + fetchMacroSnapshot — Session 6 |
| Allocation: MAD + Kelly exponential | §3.1–3.6 | allocation.ts | MAD z-score, quality gate, e^(k×modZ), 5% de minimis, rounding absorption — Session 6 |
| Money market global skip | §2.7 | pipeline.ts, constants.ts, allocation.ts | FDRXX/ADAXX fixed composite 50, skip all factor scoring, MM tier — Session 6 |
| Portfolio: Invalid Date fix | §6 | Portfolio.tsx | Null/invalid timestamp guard for pipeline run display — Session 6 |
| Tier badges: end-to-end wiring | §6.3 | scoring.ts, persist.ts, types.ts, api.ts, Portfolio.tsx, FundDetail.tsx | MAD z-score → tier computed in scoring engine, persisted to fund_scores, rendered in fund table + detail sidebar. Client-side recomputation on slider change. — Session 7 |
| Continuous risk slider with interpolation | §3.4, §6.4 | allocation.ts, routes.ts, Portfolio.tsx, types.ts | `interpolateK()` linearly interpolates k between anchor points. Float risk_tolerance (1.0–7.0) throughout stack. — Session 9 |
| Allocation history persistence | §7.7 | brief-engine.ts, types.ts | `allocation_history` table, `persistAllocationHistory()` after each Brief, `fetchPreviousAllocation()` + `computeAllocationDelta()` for "What Changed" delta. — Session 9 |
| Pipeline caching: FMP fundamentals | §4.6 | cache.ts, pipeline.ts | 7-day TTL in `fmp_cache` table. Batch pre-fetch all unique tickers, skip cached, save misses. — Session 10 |
| Pipeline caching: Tiingo prices | §4.6 | cache.ts, pipeline.ts | 1-day TTL in `tiingo_price_cache` table. Batch pre-fetch all fund tickers, skip cached, save misses. — Session 10 |
| Pipeline caching: Finnhub fees | §4.6 | cache.ts, pipeline.ts | 90-day TTL in `finnhub_fee_cache` table. Batch pre-fetch, skip cached. — Session 10 |
| Pipeline caching: sector classifications | §4.6 | cache.ts, pipeline.ts | 15-day TTL in `sector_classifications` table. Cross-fund deduplication. — Session 10 |
| API delay reduced 500ms→250ms | §5.3 | constants.ts | Matches v5.1's 200-300ms range while staying conservative. — Session 10 |
| Classification batch size 25 | §5.3 | classify.ts | Matches v5.1. Fewer Claude calls = fewer 1.2s delays. — Session 10 |
| v5.1 UI layout ported | §6.7 | Portfolio.tsx, AppShell.tsx, FundDetail.tsx | Two SVG donuts + 7-col fund table + sliders. 4-tab nav. 420px sidebar. — Session 11 |
| Shared DonutChart component | §6.7 | DonutChart.tsx | SVG arc math, hover tooltips, click drill-in, MiniDonut variant. — Session 11 |
| SectorScorecard component | §2.6.1 | SectorScorecard.tsx | 14 sectors, 1–10 scale, progress bars, reasoning. Compact mode for Briefs. — Session 11 |
| Thesis page | §2.6.1, §6.7 | Thesis.tsx | Macro thesis card + sector scorecard. Data from /api/thesis/latest. — Session 11 |
| Settings page | §6.7 | Settings.tsx | Profile, fund list, pipeline controls, about. Replaces admin-only Pipeline tab. — Session 11 |
| Brief serif headers | §7.2 | Briefs.tsx | Section headings use Libre Baskerville serif font. — Session 11 |
| Theme: serif font + surfaceAlt | §6.1 | theme.ts | Added Libre Baskerville, surfaceAlt color. — Session 11 |
| ThesisData typed API client | §2.6.1 | api.ts | Typed ThesisData interface for /api/thesis/latest. — Session 11 |

### 9.2 What's BROKEN (Code Exists But Doesn't Match Spec)

These are the highest priority. The code runs but produces wrong results.

**~~CRITICAL-1: Scoring Engine — Missing Z-Space + CDF (§2.1)~~ — RESOLVED (Session 4)**
File: `src/engine/scoring.ts`
Status: ✅ Implemented. `scoreAndRankFunds()` now performs full z-space + CDF pipeline: raw scores → `zStandardize()` (Bessel-corrected, n-1) → weighted composite in z-space → `normalCDF()` (Abramowitz & Stegun 7.1.26) → 0–100. Z-scores persisted to `fund_scores` table for client-side rescore. Client-side rescore in `Portfolio.tsx` uses pre-computed z-scores + lightweight `normalCDF()`. Validated against §2.8 worked example: Fund A=84, B=41, C=40, D=31 — all match. Edge cases handled: <2 funds → raw fallback, identical scores → all 50.

**~~CRITICAL-2: Momentum — Missing Volatility Adjustment (§2.5.2)~~ — RESOLVED (Session 5)**
File: `src/engine/momentum.ts`
Status: ✅ Implemented. `scoreMomentumCrossSectional()` now computes daily returns → daily vol (Bessel) → period vol = daily_vol × √(trading_days) → vol_adjusted = blended / period_vol (Barroso & Santa-Clara 2015). MIN_DAILY_RETURNS_FOR_VOL = 10. Falls back to raw blended return if insufficient data.

**~~CRITICAL-3: Momentum — Missing Z-Score + CDF Scoring (§2.5.3)~~ — RESOLVED (Session 5)**
File: `src/engine/momentum.ts`, function `scoreMomentumCrossSectional()`
Status: ✅ Implemented. Z-standardize (Bessel, n-1) → winsorize ±3σ → normalCDF() → 0-100. Edge cases: <2 funds → all 50, stdev=0 → all 50, single fund → 75, no data → 50. Uses vol-adjusted returns when available.

**~~CRITICAL-4: Positioning — Wrong Scale (§2.6.1)~~ — RESOLVED (Session 6)**
Files: `src/engine/thesis.ts`, `src/engine/positioning.ts`
Status: ✅ Complete rewrite. thesis.ts prompt now requests 1.0–10.0 continuous scale with one decimal. SectorPreference interface uses `score: number`. Range anchoring validation added: ≥2 sectors ≥7.0, ≥2 sectors ≤4.0, spread ≥4.0. Deterministic FRED-based sector priors injected into prompt. positioning.ts normalization corrected to `(score - 1) / 9`. Backward compat with old DB rows (handles both `score` and `preference` fields).

**~~CRITICAL-5: Allocation Engine — Wrong Algorithm (§3.1–3.6)~~ — RESOLVED (Session 6)**
File: `src/engine/allocation.ts` (new file, extracted from brief-engine.ts)
Status: ✅ Full spec §3 implementation. MAD-based modified z-scores (0.6745 consistency constant). Quality gate (4+ fallbacks → excluded). Exponential curve `e^(k × mod_z)` using KELLY_RISK_TABLE k-parameters. 5% de minimis floor with iterative removal + renormalization. Rounding with error absorption into largest position. Money market funds excluded with MM tier. brief-engine.ts updated to call computeAllocations() from allocation.ts.

### 9.3 What's MISSING (Spec Feature Not Yet Implemented)

**~~MISSING-1: Cost Efficiency 12b-1 Fee Penalty (§2.3)~~ — RESOLVED (Session 3)**
File: `src/engine/cost-efficiency.ts`
Spec: When Tiingo provides 12b-1 fees, apply -5 points per 0.10% of 12b-1, capped at -15.
Status: ✅ Implemented. scoreCostEfficiency() accepts optional NormalizedFeeData. Penalty applied when twelveb1Fee > 0. CostEfficiencyResult includes twelveb1Penalty and feeDataSource fields.

**~~MISSING-2: Bond Quality Scoring (§2.4.2, §2.4.3)~~ — RESOLVED (Session 5)**
File: `src/engine/quality.ts`, `src/engine/edgar.ts`, `src/engine/types.ts`, `src/engine/holdings.ts`
Status: ✅ Implemented. Issuer Category Quality Map (UST=1.00, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50). Distressed adjustments (isDefault=Y → 0.10, fairValLevel=3 → 0.35, debtInArrears=Y → 0.35). Bond fields parsed from NPORT-P `<debtSec>` element. Blended equity/bond scoring by portfolio share (§2.4.3). Bond fields flow through types.ts → holdings.ts → pipeline.ts → quality.ts.

**~~MISSING-3: Coverage-Based Confidence Scaling (§2.4.1)~~ — RESOLVED (Session 5)**
File: `src/engine/quality.ts`, `src/engine/pipeline.ts`, `src/engine/scoring.ts`
Status: ✅ Implemented. quality.ts returns `coveragePct`. Pipeline computes per-fund weight adjustments when coverage < 0.40: `quality_weight_adj = base × max(coverage/0.40, 0.10)`, freed weight → momentum, renormalize to 1.0. `scoreAndRankFunds()` accepts per-fund weight overrides so z-standardization stays uniform but composites use adjusted weights.

**~~MISSING-4: FRED Commodity Series (§4.4)~~ — RESOLVED (Session 6)**
Files: `src/engine/fred.ts`, `src/engine/constants.ts`
Status: ✅ 4 commodity indicators (WTI crude, Brent crude, Gold, Dollar Index) added to INDICATOR_META in fred.ts. fetchMacroSnapshot() now fetches combined FRED_SERIES + FRED_COMMODITY_SERIES. Data flows to thesis prompt.

**~~MISSING-5: Deterministic FRED-Based Sector Priors (§2.6.2)~~ — RESOLVED (Session 6)**
File: `src/engine/thesis.ts`
Status: ✅ `computeSectorPriors()` implemented. Deterministic rules: yield curve inverted → Financials -1.0; inflation rising → Energy +1.0, Precious Metals +1.0; fed tightening → Real Estate -0.5, Utilities -0.5; weak employment → Consumer Disc -0.5, Consumer Staples +0.5. Priors injected into Claude prompt as "SECTOR PRIORS (pre-computed)" block before Claude generates scores.

**~~MISSING-6: Money Market Global Skip (§2.7)~~ — RESOLVED (Session 6)**
Files: `src/engine/pipeline.ts`, `src/engine/constants.ts`, `src/engine/allocation.ts`
Status: ✅ MONEY_MARKET_TICKERS set (FDRXX, ADAXX) in constants.ts. pipeline.ts separates money market funds before scoring loops — they get fixed composite 50 with all factors at 50, skip holdings/fundamentals/classification/momentum/positioning. allocation.ts excludes MM funds from allocation (0% weight, MM tier badge).

**MISSING-7: HHI Concentration Display (§6.6)**
Spec: Herfindahl-Hirschman Index of sector exposure per fund in detail view. Informational only.
Status: Not implemented anywhere.

**~~MISSING-8: Tiingo Integration (§4.1, §4.6)~~ — FULLY RESOLVED (Session 3 + Session 4 + Session 5)**
Spec: Tiingo is primary source for fund NAV history (split-adjusted). Fee data (12b-1, loads) from Finnhub.
Status: ✅ Tiingo prices working (fetchTiingoPrices, convertTiingoPricesToFmpFormat). Pipeline Step 8 uses Tiingo → FMP fallback for prices. ✅ Fee data (12b-1, frontLoad) now comes from **Finnhub** (`fetchFinnhubExpenseRatio` returns `fee12b1` + `frontLoad`). Dead Tiingo fee code removed in Session 5. Pipeline Step 7b constructs NormalizedFeeData from Finnhub for cost-efficiency scoring.

**MISSING-9: Help Section — FAQs + Live Claude Chat (Robert's request)**
Spec: Not yet in spec — feature idea from build planning session. Help section with static FAQs and Claude Haiku chat scoped strictly to FundLens questions.
Status: Planned for Session 9 of the build roadmap.

**MISSING-10: Investment Brief Redesign — 4-Section Structure + Advisor Voice (§7.2–7.9)**
Spec: Complete rewrite of §7. 4-section brief ("Where the Numbers Point" → "What Happened" → "What We're Watching" → "Where We Stand"). New voice guidelines (knowledgeable buddy, not research analyst). "Behind the curtain" rule prohibiting model language. Raw data feed to Claude (not scores). Allocation persistence for "What Changed" delta.
Status: **PARTIALLY COMPLETE (Session 8 + Session 9).** editorial-policy.md rewritten (v2.0 — advisor voice, 4-section W structure, behind-the-curtain rule). brief-engine.ts rewritten (raw data feed, no scores/factor names in prompt, natural-language allocation reasons). ✅ allocation_history table and delta computation added Session 9. Remaining: Briefs.tsx client redesign (→ Session 11).

**~~MISSING-11: Continuous Risk Slider with Interpolation (§3.4, §6.4)~~ — RESOLVED (Session 9)**
Spec: Risk slider accepts 1.0–7.0 continuous values. k parameter interpolated between anchor points. risk_tolerance stored as FLOAT.
Status: ✅ Complete. `interpolateK()` in allocation.ts implements linear interpolation between anchor points. `clampRisk()` no longer rounds to integer. routes.ts validation accepts floats (1.0–7.0), rounds to one decimal. Portfolio.tsx slider updated: min=1, max=7, step=0.1, shows nearest anchor label + decimal value. types.ts doc comment updated. Migration changes user_profiles.risk_tolerance to DOUBLE PRECISION with CHECK constraint.

**~~MISSING-12: Allocation History Persistence (§7.7)~~ — RESOLVED (Session 9)**
Spec: allocation_history table stores each brief's recommended allocation for "What Changed" delta and future performance tracking.
Status: ✅ Complete. Migration creates `allocation_history` table with RLS policies. `persistAllocationHistory()` called after each Brief save in generateBrief(). `fetchPreviousAllocation()` queries most recent prior allocation. `computeAllocationDelta()` computes new/removed/changed positions (1% threshold). Delta passed to Claude prompt in "Portfolio Changes Since Last Brief" section for "What Happened" narrative.

**~~MISSING-13: Pipeline Performance — 9 min → <3 min~~ — RESOLVED (Session 10)**
Spec: v6 pipeline takes 9 minutes vs v5.1's 2 minutes. Root causes identified: 500ms delays (v5.1 uses 200-300ms), no Supabase caching layer (v5.1 batch-queries cache before API calls), no Claude classification batching (v5.1 batches 25 holdings per call).
Status: ✅ Complete. Created `cache.ts` with 4 cache layers (FMP 7-day, Tiingo 1-day, Finnhub 90-day, sector classifications 15-day). Pipeline rewritten to batch-check caches before API loops, skip cached data, save misses. API delay reduced 500ms→250ms. Classification batch size 15→25. Classification deduplicated across funds (same holding in 5 funds = 1 classification). Migration: `session10_cache_tables.sql`.

### 9.4 CUSIP Resolver — COMPLETED (Session 2)

Robert flagged the CUSIP resolver for dedicated review. Session 2 audited `cusip.ts`, `holdings.ts`, `pipeline.ts`, and `types.ts` against spec §4.3 and §4.6. Seven issues found and fixed:
1. Supabase cusip_cache wired in (was never called — cacheLookup/cacheSave now default)
2. FMP search-by-name fallback added for unresolved CUSIPs (spec §4.6 chain complete)
3. Parameter renamed `fmpApiKey` → `openFigiKey` in holdings.ts (was always OpenFIGI key)
4. MAX_LOOKTHROUGH_DEPTH fixed from 2 → 1 (spec §2.4.4)
5. `resolved: true` edge case fixed when ticker is null (now correctly marks as unresolved)
6. pctOfNav doc comments corrected from "0.0–1.0" to whole-percent units
7. Negative caching implemented (unresolved CUSIPs cached to avoid re-querying)

**Remaining:** `resolveSubFundTicker()` in holdings.ts is still a stub (always returns null). Fund-of-funds look-through scaffolding exists but cannot fire without sub-fund ticker resolution. This can be wired when FMP search is tested against real fund names (could be addressed in Session 3 or deferred).

### 9.5 Build Roadmap (Remaining Sessions)

| Session | Focus | Key Gaps Addressed | Status |
|---------|-------|--------------------|--------|
| 2 | CUSIP Resolver Deep Review | §4.3 — flagged by Robert | **DONE** |
| 3 | Tiingo Integration | MISSING-8, MISSING-1 (12b-1 fees depend on Tiingo) | **DONE** |
| 4 | Scoring Engine | CRITICAL-1 (z-space + CDF composite) | **DONE** |
| 5 | Factor Upgrades | CRITICAL-2, CRITICAL-3 (momentum vol-adjust + z-score), MISSING-2 (bond scoring), MISSING-3 (coverage scaling) | **DONE** |
| 6 | Thesis + Allocation + MM Skip | CRITICAL-4 (1-10 scale), CRITICAL-5 (Kelly allocation), MISSING-4 (FRED commodities), MISSING-5 (sector priors), MISSING-6 (money market skip) | **DONE** |
| 7 | Tier Badges + Brief/Slider Spec | §6.3 tier badges E2E. §7 brief redesign (4-section, advisor voice). §3.4 continuous slider. §7.7 allocation persistence. Spec-only for MISSING-10 through MISSING-13. | **DONE** |
| 8 | Brief Engine Redesign | MISSING-10: Rewrite editorial-policy.md + brief-engine.ts prompt. Raw data feed. 4-section output. Advisor voice. | **DONE** |
| 9 | Allocation Persistence + Continuous Slider | MISSING-11 + MISSING-12: allocation_history table, risk slider float, interpolation | **DONE** |
| 10 | Pipeline Performance | MISSING-13: Reduce delays, add Supabase caching, batch Claude classification. Target <3 min. | **DONE** |
| 11 | v5.1 UI Port | Port v5.1 layout/UX to v6 React client. All 4 factors visible. Sector scorecard. Inline Brief rendering. | **DONE** |
| 12 | Help Section | MISSING-9 (FAQs + Claude Haiku chat) | |
| 13 | HHI + Polish | MISSING-7 (HHI concentration display). Final UI polish. | |
| 14 | Integration Testing | End-to-end pipeline validation against worked example (§2.8) | |

---

## 10. CHANGELOG

### April 7, 2026 — v7 Specification Created (Planning Session with Robert)

**Decisions made:**

1. **Universal scores, risk in allocation only.** Scores describe the fund objectively. Risk tolerance (7-point scale) affects the allocation engine's exponential curve steepness via Kelly-fraction mapping. Concentration penalty removed from scoring. (Rationale: Grinold & Kahn — information coefficient is independent of transfer coefficient.)

2. **4-factor model at 25/30/25/20.** Cost Efficiency promoted from ±0.5 modifier (v5.1) to full 25% factor (supported by Morningstar, Sharpe, Carhart, French). Holdings Quality at 30% (Novy-Marx, Piotroski, Asness). Momentum at 25% with vol-adjustment (Jegadeesh & Titman). Positioning at 20% as Black-Litterman views overlay.

3. **Z-space standardization carried forward from v5.1 code.** Raw scores standardized to z-scores before weighting. Prevents any single factor's raw distribution from dominating. Maps back to 0–100 via normal CDF.

4. **Volatility-adjusted momentum carried forward from v5.1 code.** Raw returns divided by realized volatility before cross-sectional ranking. Prevents high-vol funds from gaming momentum signal. Combined with v6's multi-window approach (3/6/9/12-month blend at 10/30/30/30 weights).

5. **Bond quality scoring restored from v5.1.** V6 dropped all bond/fixed-income quality scoring. Issuer category quality map (UST=1.0, USG=0.95, MUN=0.80, CORP=0.60) plus distressed-bond adjustments carried forward. Blended scoring for mixed equity/bond funds.

6. **Tiingo restored as primary price and fee data source.** Tiingo provides cleaner NAV history (split/distribution-adjusted, back to 1970s) and granular fee breakdowns (12b-1, loads, etc.) that FMP does not. FMP remains primary for company fundamentals. Each API does what it does best; each backs up the other where possible.

7. **Thesis range anchoring carried forward from v5.1.** Sector scores on 1–10 scale with enforced constraints (≥2 sectors above 7.0, ≥2 below 4.0, spread ≥4.0). Prevents wishy-washy "everything is about a 6" outputs.

8. **Deterministic FRED-based sector priors added.** Hard macro data relationships (inverted yield curve → Financials headwind, rising CPI → Energy/Precious Metals tailwind, etc.) computed before Claude sees the data. Passed as priors Claude must acknowledge. Ensures floor of correctness independent of AI interpretation quality.

9. **FRED commodity series added.** WTI crude, Brent crude, gold, dollar index, copper added to existing 9 economic indicators. Same API, zero additional cost. Provides direct data for Energy, Materials, Precious Metals sector priors.

10. **EIA data on weekly cadence.** Fetched weekly, stored in Supabase, used as supplemental energy/materials context. Not blocking — failure doesn't affect pipeline.

11. **Allocation engine: v5.1's MAD Z-score + exponential curve, with 7-point Kelly-fraction risk scale and 5% de minimis floor.** Replaces v5.1's 1–9 slider and arbitrary 65% capture threshold. k parameter derived from fractional Kelly fractions. 5% minimum allocation floor based on industry-standard de minimis threshold (JFE 2025). Fund count and concentration emerge naturally from the math.

12. **Scoring scale: 0–100, displayed as whole numbers.** Provides intuitive anchoring (school grades, percentages) without false precision. Internal computation uses full floating point; rounding only at presentation layer.

13. **Flow modifier dropped.** Academic evidence runs against it for mutual funds (Frazzini & Lamont 2008 — flows are contrarian predictor). At ±0.2 on old scale, it was doing almost nothing anyway.

14. **Coverage-based quality weight redistribution kept.** When holdings data coverage < 40%, quality factor weight is reduced proportionally (floor 10% of base weight) and freed weight goes to momentum (most reliable data source). Prevents low-confidence quality scores from distorting composites.

15. **Fund-of-funds look-through status TBD.** Logic exists in v5.1's quality.js but may not have been executing in practice. Verify before carrying forward.

16. **No culture/trends in scoring.** Social media sentiment, generational preferences, etc. add noise to the objective model. Claude may reference current events and cultural context in the Investment Brief narrative when it enhances readability and relevance.

17. **Cost Efficiency enhanced with Tiingo fee components.** When 12b-1 marketing fees are present, apply penalty within cost factor (-5 points per 0.10% of 12b-1, capped at -15). Distinguishes funds with identical headline expense ratios but different fee structures.

## April 7, 2026 — Session 11: v5.1 UI Port

**Deliverables:**

1. **Portfolio.tsx rebuilt to match v5.1 layout.** Two SVG donut charts (Sector Exposure + Fund Allocation) with hover tooltips and click drill-in. Sector donut click shows company holdings within that sector across all funds. Fund donut click opens 420px FundDetail sidebar. 7-column fund table (Fund, Score, Tier, Cost, Quality, Momentum, Positioning) — all 4 factors visible. Money market funds sort to bottom. Factor weight sliders with proportional redistribution. Continuous risk slider (1.0–7.0, step 0.1) preserved from Session 9.

2. **DonutChart.tsx extracted as shared component.** Ported v5.1's SVG arc math including the 360° edge case (two semicircular arcs). Supports hover tooltips (center label), click drill-in with expandable holdings list, and MiniDonut variant for the sidebar. Used by Portfolio.tsx and FundDetail.tsx.

3. **SectorScorecard.tsx created.** Ported from v5.1's SectorScorecard.jsx. Grid layout: sector name with colored dot, score in JetBrains Mono, progress bar (1–10 → 0–100%), one-line reasoning. Supports compact mode for inline use in Briefs. Used by Thesis.tsx and available for inline Brief rendering.

4. **Thesis.tsx page created.** Two cards: Investment Thesis (macro stance badge, dominant theme badge, narrative text, key themes) and Sector Outlook (SectorScorecard grid). Data from GET /api/thesis/latest. Libre Baskerville serif font for card headers matching v5.1 pattern.

5. **FundDetail.tsx rebuilt as 420px slide-in sidebar.** Fixed right panel with backdrop overlay, slide-in animation, close-on-backdrop-click. Sections: header (name, ticker, expense ratio, tier badge), composite score (38px JetBrains Mono), 4 factor bars with color coding, sector donut with expandable holdings per sector (v5.1 click-to-expand pattern), AI reasoning blocks. Width increased from 250px to 420px per spec §6.7.

6. **AppShell.tsx updated to 4-tab navigation.** Portfolio | Thesis | Briefs | Settings. Pipeline moved out of top-level nav (accessible from Settings page). Responsive: desktop sidebar, tablet collapsed sidebar, mobile bottom tab bar — all 4 tabs.

7. **Settings.tsx page created.** Ported from v5.1's SettingsTab.jsx. Sections: Profile (display name, email), Scoring Preferences (read-only summary of weights and risk), Fund List (all ~18 TerrAscend funds with ticker, name, expense ratio), Pipeline controls (admin — run pipeline button, status display), About placeholder.

8. **Briefs.tsx refined.** Section headings now use Libre Baskerville serif font. Empty state improved with clearer copy ("Run Analysis to generate your first Investment Brief"). SectorScorecard component available for inline rendering in "Where We Stand" section.

9. **theme.ts updated.** Added serif font (`'Libre Baskerville', Georgia, serif`), surfaceAlt color (`#1c1e23`).

10. **api.ts updated.** Added ThesisData interface with typed sector_preferences, dominant_theme, macro_stance, key_themes, risk_factors.

**v6 improvements preserved (not regressed):**
- 4 visible factors (Cost, Quality, Momentum, Positioning) at 25/30/25/20
- Continuous risk slider 1.0–7.0 with 0.1 step and Kelly k-interpolation
- 4-section Brief structure ("Where the Numbers Point" → "What Happened" → "What We're Watching" → "Where We Stand")
- "Behind the curtain" rule
- Tier badges (Breakaway/Strong/Solid/Neutral/Weak)
- TypeScript + Vite client
- Error boundary

## April 7, 2026 — Session 0: Security Hardening

1. **XSS prevention in Briefs.tsx.** Added DOMPurify sanitization with strict ALLOWED_TAGS whitelist and escapeHtml() preprocessing before inline markdown formatting. Prevents stored XSS via Claude-generated Brief content.

2. **Prompt injection hardening in thesis.ts and classify.ts.** Added sanitizePromptInput() and sanitizeHoldingText() functions that strip control characters, prompt delimiter patterns, and instruction-like text before embedding RSS headlines or holding names in Claude prompts.

3. **Rate limiting added.** Global 100 requests/minute/IP. Pipeline endpoints: 3/hour per user. Brief generation: 5/day per user. Prevents abuse and Claude API quota exhaustion.

4. **Admin role enforcement.** Pipeline run and retry endpoints now require admin email whitelist check via requireAdmin middleware. Only racoursey@gmail.com can trigger pipeline runs.

5. **XXE prevention in EDGAR XML parsing.** DOCTYPE stripping before xml2js parsing plus strict mode enabled. Prevents XML External Entity attacks via malicious NPORT-P filings.

6. **Mandatory environment variables.** Server now crashes on startup (process.exit(1)) if SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET, or ANTHROPIC_API_KEY are missing.

7. **CORS locked to explicit origins.** Production CORS restricted to fundlens.app and www.fundlens.app only. Development allows localhost:5173 and localhost:3000.

8. **Helmet security headers enabled.** CSP disabled in dev for hot reload; enabled in production.

9. **Internal error details stripped from API responses.** All 7 routes that returned `${error}` in 500 responses now log details server-side and return generic user-facing messages.

10. **Input validation hardened.** Ticker format validation (isValidTicker) on /api/funds/:ticker and /api/scores/:ticker. UUID format validation (isValidUUID) on /api/briefs/:id. Individual weight bounds (0.05–0.60) on PUT /api/profile.

## April 7–8, 2026 — Session 1: Foundation — Constants, Types, 7-Point Kelly Risk Model

1. **Default factor weights corrected (§2.2).** Momentum and Positioning were swapped in constants.ts — Momentum was 0.20 (should be 0.25), Positioning was 0.25 (should be 0.20). Fixed to match spec: Cost 25%, Quality 30%, Momentum 25%, Positioning 20%.

2. **Brief model corrected to Opus (§4.2, §5.1).** BRIEF_MODEL changed from claude-sonnet-4-6 to claude-opus-4-6.

3. **Kelly risk table added (§3.4).** KELLY_RISK_TABLE constant with all 7 levels: labels, Kelly fractions (0.15–0.80), and k parameters (0.30–1.85). Replaces the old 3-value RISK_LEVELS enum.

4. **Risk scale changed from 1–9 to 1–7 (§3.4, §6.4).** RISK_MIN and RISK_MAX constants added. Validation in PUT /api/profile and POST /api/profile/setup updated. riskLabel() rewritten to use KELLY_RISK_TABLE. Profile summary descriptions aligned to 7-point scale. Display strings changed from /9 to /7.

5. **Tier badge constants added (§6.3).** TIER_BADGES array with z-score thresholds and colors: BREAKAWAY (≥2.0, amber), STRONG (≥1.2, green), SOLID (≥0.3, blue), NEUTRAL (≥-0.5, gray), WEAK (<-0.5, red). SPECIAL_TIERS for Money Market and Low Data.

6. **Score color constants added (§6.2).** SCORE_COLORS: Green ≥75, Blue ≥50, Amber ≥25, Red <25.

7. **Allocation engine constants added (§3).** MAD_CONSISTENCY (0.6745), DE_MINIMIS_PCT (0.05), QUALITY_GATE_MAX_FALLBACKS (4).

8. **FRED commodity series constants added (§4.4).** FRED_COMMODITY_SERIES: DCOILWTICO, DCOILBRENTEU, GOLDAMGBD228NLBM, DTWEXBGS.

9. **Spec-vs-code gap analysis completed.** 20 gaps identified (7 Critical, 8 High, 5 Medium). Saved as FundLens_Spec_vs_Code_Gap_Analysis.md. Critical gaps include: missing z-space + CDF in scoring engine, wrong positioning scale (-2/+2 vs 1–10), missing momentum vol-adjustment, and wrong allocation algorithm.

## April 8, 2026 — Session 2: CUSIP Resolver Deep Review

Dedicated audit of `cusip.ts`, `holdings.ts`, `pipeline.ts`, and `types.ts` against spec §4.3 and §4.6. Robert flagged this module as unaudited in Sessions 0–1.

**7 issues found and fixed:**

1. **Supabase cusip_cache wired in (§4.3).** `cusipCacheLookup()` and `cusipCacheSave()` built directly into `cusip.ts` as default parameters on `resolveCusips()`. Pipeline no longer needs to pass cache functions explicitly — they default to the built-in Supabase cache. Negative caching prevents re-querying OpenFIGI for CUSIPs known to not resolve.

2. **FMP search fallback added (§4.6).** Full fallback chain now implemented: Supabase cache → OpenFIGI (batch) → FMP `searchByName()` → cache save. For CUSIPs that OpenFIGI can't resolve, `tryFmpSearchFallback()` queries FMP by the security name, preferring US-listed results (NYSE/NASDAQ/AMEX).

3. **Parameter renamed `fmpApiKey` → `openFigiKey` (§4.3).** `holdings.ts` parameter was misleadingly named — it was always the OpenFIGI API key being passed to `resolveCusips()`.

4. **MAX_LOOKTHROUGH_DEPTH fixed from 2 to 1 (§2.4.4).** Spec explicitly states "Recursion capped at depth 1 (look through one layer only)." Code had 2. Robert confirmed depth 1 is correct for now.

5. **`resolved: true` edge case fixed.** OpenFIGI sometimes returns metadata without a usable ticker. Previously marked `resolved: true` with `ticker: null`, which would skip fallback logic. Now correctly marks as `resolved: false` with warning, allowing FMP fallback to attempt resolution.

6. **pctOfNav doc comments corrected (§4.3).** Four doc comments in `types.ts` (`EdgarHolding.pctOfNav`, `ResolvedHolding.pctOfNav`, `HoldingsCacheRow.pct_of_nav`, `HoldingsPipelineResult.coverage.weightCovered`) changed from "0.0–1.0" to "whole-percent units" to match actual NPORT-P data and the `TARGET_WEIGHT_PCT=65` threshold.

7. **Negative caching implemented.** Unresolved CUSIPs are now saved to `cusip_cache` with `resolved=false`. Subsequent pipeline runs skip the OpenFIGI call for known-unresolvable CUSIPs, reducing API usage.

**Not addressed (deferred):**
- `resolveSubFundTicker()` in `holdings.ts` remains a stub (returns null). Fund-of-funds look-through scaffolding exists but can't fire. Can be wired when FMP search is tested against real sub-fund names.
- Supabase manual entry as final fallback (§4.6 step 4) not yet implemented. Would require an admin UI or manual SQL for Robert to enter overrides.

**Files changed:** `cusip.ts`, `holdings.ts`, `pipeline.ts`, `types.ts`
**Verification:** `tsc --noEmit` passes clean (exit code 0).

## April 7, 2026 — Session 3: Tiingo Integration

Primary deliverable: Create `src/engine/tiingo.ts` and wire Tiingo into the pipeline as the primary data source for fund NAV prices and fee data, per spec §4.1 and §4.6.

**1. Created `src/engine/tiingo.ts` (§4.1, §4.6).** Typed Tiingo API client with:
- `fetchTiingoPrices()`: Fetches split/distribution-adjusted daily NAV history. Primary source for momentum calculations.
- `fetchFundFees()`: Fetches granular fee breakdowns (net/gross ER, 12b-1, loads, management fees). Tries dedicated fee endpoint first, falls back to metadata endpoint.
- `convertTiingoPricesToFmpFormat()`: Adapter that converts Tiingo price responses to FMP-compatible shape, so `momentum.ts` needs no interface changes.
- `normalizeFeeData()`: Converts TiingoFundFees to NormalizedFeeData for cost-efficiency scoring.
- `normalizeFeeResponse()`: Internal helper that handles multiple possible Tiingo field naming conventions (camelCase, snake_case, abbreviated).
- Uses `TINNGO_KEY` env var (intentional typo per §5.6).
- 500ms delays between sequential requests (§5.3).
- Rate limit handling (429 → 10s backoff).

**2. Added Tiingo constants to `constants.ts` (§4.1).** TIINGO config block with base URL (`https://api.tiingo.com`) and endpoint paths for daily prices, fund metadata, and fund fees.

**3. Implemented 12b-1 fee penalty in `cost-efficiency.ts` (§2.3, MISSING-1).** `scoreCostEfficiency()` now accepts optional `NormalizedFeeData` parameter. When Tiingo provides 12b-1 fees > 0, applies -5 points per 0.10% of 12b-1, capped at -15. Tiingo expense ratio preferred over Supabase fund table value when available. `CostEfficiencyResult` extended with `twelveb1Penalty` and `feeDataSource` fields.

**4. Wired Tiingo into pipeline.ts Steps 7–8 (§4.6, §5.4).**
- Step 7: Fetches Tiingo fee data for each fund before scoring cost efficiency. Falls back to fund table `expense_ratio` if Tiingo unavailable.
- Step 8: Fetches Tiingo prices for each fund (primary). Falls back to FMP `fetchHistoricalPrices()` if Tiingo returns no data. Uses `convertTiingoPricesToFmpFormat()` adapter.

**CORRECTION (Session 4 continuation):** The Tiingo fee endpoint (`/tiingo/fundamentals/fees/{ticker}`) was tested and returns 404 — it does not exist. Tiingo does NOT provide mutual fund fee data via a dedicated endpoint. The v6 rebuild incorrectly assumed Tiingo covered fee data based on the spec planning session. In v5.1, expense ratios came from **Finnhub** (`/api/v1/mutual-fund/profile`), which was the working source all along. Session 4 continuation created `finnhub.ts` and wired it into pipeline Step 7a as the primary expense ratio source. The `fetchFundFees()` function in tiingo.ts is now dead code — it can be removed in a future cleanup.

**Files created:** `tiingo.ts`
**Files changed:** `constants.ts`, `cost-efficiency.ts`, `pipeline.ts`
**Resolved:** MISSING-1 (12b-1 fee penalty), MISSING-8 (Tiingo integration)
**Verification:** `tsc --noEmit` passes clean (exit code 0).

## April 7, 2026 — Session 4: Scoring Engine (Z-Space + CDF)

Primary deliverable: Rewrite the composite scoring engine in `src/engine/scoring.ts` to implement the z-space + CDF pipeline from spec §2.1. This is the mathematical heart of FundLens — without it, every composite score in the system was wrong.

**1. Implemented `normalCDF()` — Abramowitz & Stegun 7.1.26 (§2.1).** Standard normal CDF via erf approximation with max error ≈ 7.5 × 10⁻⁸. The A&S coefficients approximate `erf(x)`, and the normal CDF relates via `Φ(z) = 0.5 × (1 + erf(z/√2))`. Uses Horner form for numerical stability.

**2. Implemented `zStandardize()` — Bessel-corrected (§2.1).** Standardizes an array of raw scores to z-scores across the fund universe. Divides by (n-1) per spec. Returns null for n < 2 (z-standardization undefined). Returns all zeros if stdev = 0 (all identical scores).

**3. Rewrote `scoreAndRankFunds()` — full z-space + CDF pipeline (§2.1).** The server-side scoring function now performs all four steps from §2.1: (1) raw scores already computed, (2) z-standardize each factor across universe, (3) weighted composite in z-space, (4) map to 0–100 via normalCDF. Falls back to raw weighted average if fewer than 2 funds. Z-scores stored on each `FundCompositeScore` for downstream persistence and client use.

**4. Added `computeCompositeFromZScores()` — client-side rescore function (§2.1, §5.2).** Takes pre-computed z-scores (already stored in Supabase) and user weights, returns composite via weighted z-sum + CDF. Pure math, no universe data needed. This is what runs when users adjust weight sliders.

**5. Preserved `computeComposite()` — legacy raw-weighted-average fallback.** Maintained for the <2 funds edge case. `brief-engine.ts` updated to use `computeCompositeFromZScores()` with z-scores read from Supabase.

**6. Updated persistence layer to store z-scores (§2.1).** `persist.ts` now writes `z_cost_efficiency`, `z_holdings_quality`, `z_positioning`, `z_momentum` to `fund_scores` table. `FundScoresRow` in `types.ts` extended with z-score fields. SQL migration created (`migrations/session4_add_z_scores.sql`). Full schema (`v6_full_schema.sql`) updated.

**7. Updated client-side rescore in `Portfolio.tsx` (§5.2).** Replaced inline raw weighted average with z-score weighted sum + `normalCDF()`. Added lightweight `normalCDF()` function to Portfolio.tsx (identical to server-side, ~15 lines). `FundScore` interface in `api.ts` extended with z-score fields. The `select: '*'` in routes automatically picks up new columns — no route changes needed.

**8. Updated weight validation to spec tolerances (§2.2).** `validateWeights()` now enforces ±0.02 sum tolerance (was 0.001) and minimum 5% per factor.

**Architecture decision — client-side rescore approach:** Discussed with Robert whether to keep client-side rescore or move all computation server-side. Decision: keep lightweight client-side rescore for instant slider feedback. Server computes z-scores during pipeline (heavy lifting), stores them. Client does weighted z-sum + one CDF call (~15 lines of math). This keeps the client thin while maintaining the instant feel when dragging sliders. Universal scores confirmed: same fund, same score, regardless of viewer. Risk tolerance affects allocation only (§3), never scoring.

**Validation:** §2.8 worked example produces correct results: Fund A=84, Fund B=41, Fund C=40, Fund D=31. All intermediate z-scores and z-composites match spec. Edge cases verified: single fund → null z-scores → raw fallback, all identical → z=0 → composite 50.

**Database migration required:** Run `migrations/session4_add_z_scores.sql` in Supabase SQL Editor before deploying. Adds 4 z-score columns to `fund_scores` with default 0. Existing rows will be populated on next pipeline run.

**Files changed:** `scoring.ts`, `persist.ts`, `types.ts`, `brief-engine.ts`, `v6_full_schema.sql`, `client/src/api.ts`, `client/src/pages/Portfolio.tsx`
**Files created:** `migrations/session4_add_z_scores.sql`
**Resolved:** CRITICAL-1 (scoring engine z-space + CDF)
**Verification:** `tsc --noEmit` passes clean on both server and client.

## April 7, 2026 — Session 4 Continuation: Production Fixes + Finnhub Expense Ratio Integration

This session diagnosed and fixed three production issues discovered after deploying Session 4's scoring engine changes, and corrected a fundamental data source error that had been in the spec since the planning session.

**1. Fixed Helmet CSP blocking Supabase auth (server.ts).** The app was stuck on "Loading..." in production because the default Helmet CSP (`contentSecurityPolicy: undefined` in production) applied a strict `connect-src: 'self'` policy that blocked all cross-origin requests to Supabase. Fix: explicit CSP directives allowing `https://*.supabase.co` and `wss://*.supabase.co` in `connect-src`. Dev mode remains CSP-disabled for hot reload.

**2. Fixed empty sector exposure donut chart (pipeline.ts, scoring.ts).** The client reads `factor_details.sectorExposure` for the donut chart, but the pipeline was not including this data. Fix: pipeline now builds a `sectorExposure` map from classified holdings (sector → cumulative pctOfNav) and includes it in `factorDetails`. Added `sectorExposure?: Record<string, number>` to `FundCompositeScore.factorDetails` interface in `scoring.ts`.

**3. Diagnosed and fixed Cost=50 for all funds — root cause: missing expense ratio data.**
- **Root cause chain:** The v6 spec planning session incorrectly stated that Tiingo provides mutual fund fee data and that NPORT-P contains expense ratios. Both are wrong: Tiingo's fee endpoint (`/tiingo/fundamentals/fees/{ticker}`) returns 404, and NPORT-P's `fundInfo` section does not contain expense ratios. With no working fee data source, all funds had `expense_ratio = NULL` in the funds table, producing a universal Cost score of 50.
- **Discovery:** Robert directed review of the v5.1 codebase (`racoursey-cloud/fundlens`), which revealed that **Finnhub** (`/api/v1/mutual-fund/profile`) was the working expense ratio source all along. The v6 rebuild plan incorrectly dismissed Finnhub with the note "Free tier rate limiting degraded data quality. FMP covers the same data." — FMP does NOT cover mutual fund expense ratio data.
- **Fix:** Created `src/engine/finnhub.ts` — a complete Finnhub API client ported from v5.1's `expenses.js`. Three-layer lookup chain: (1) Finnhub mutual fund profile API (primary), (2) FMP etf-info / raw profile (secondary), (3) static `KNOWN_EXPENSE_RATIOS` map with all 22 TerrAscend fund expense ratios from prospectus data (last resort). Added pipeline Step 7a that auto-fetches expense ratios for any fund with `expense_ratio = NULL` and persists the result to the funds table for future runs.
- **Finnhub API details:** Endpoint `GET https://finnhub.io/api/v1/mutual-fund/profile?symbol={ticker}&token={key}`. Returns `expenseRatio` as a percentage (e.g. 0.75 = 0.75%) — converted to decimal (0.0075) internally. Also returns `fee12b1`, `frontLoad`, `category`, `benchmark`, `navTotal`, `inceptionDate`. Free tier: 60 calls/min. With Supabase persistence, a 22-fund portfolio hits Finnhub at most once per fund per quarter.

**4. Created one-time seed SQL (`migrations/populate_expense_ratios.sql`).** Seeds all 22 TerrAscend fund expense ratios from prospectus data as an immediate unblock while the automated Finnhub fetch is verified.

**5. Corrected spec data source claims.** Multiple spec sections updated:
- §2.3: Source changed from "Tiingo" to "Finnhub" for expense ratios
- §4.1: Added Finnhub to Paid Sources table; removed fee data from Tiingo row
- §4.2: Removed "expense ratios" from EDGAR NPORT-P description
- §4.6: Fallback chain updated: Finnhub → FMP → static map (was: Tiingo → NPORT-P → manual)
- §5.4: Pipeline Step 7 updated, Step 7a added for Finnhub expense sync
- §5.5: Added finnhub.ts to file inventory
- §5.6: Added FINNHUB_KEY to environment variables
- §9.1: Updated working features list
- Planning decisions #6, #17: Corrected Tiingo → Finnhub attribution

**Files created:** `finnhub.ts`, `migrations/populate_expense_ratios.sql`
**Files changed:** `pipeline.ts`, `scoring.ts`, `server.ts`, `fmp.ts`, `constants.ts`, `FUNDLENS_SPEC.md`
**Resolved:** Cost=50 for all funds (expense ratio data source), empty sector donut, Helmet CSP auth block
**Pending verification:** FINNHUB_KEY must be added to Railway environment variables. Pipeline re-run needed to confirm Finnhub returns data for TerrAscend fund tickers.

## April 7, 2026 — Session 5: Factor Upgrades (Momentum Vol-Adjust, Bond Quality, Coverage Scaling)

**Goal:** Restore v5.1's "secret sauce" mathematical modeling to v6 while keeping v6's structural improvements. Hybrid approach: port v5.1's exact math formulas, adapt to v6's architecture.

**Gaps addressed:** CRITICAL-2, CRITICAL-3, MISSING-2, MISSING-3, plus Finnhub fee12b1 wiring and dead Tiingo fee code cleanup.

**1. Momentum: volatility-adjusted returns + z-score/CDF scoring (CRITICAL-2, CRITICAL-3).**
File: `momentum.ts`, `pipeline.ts`
- Added `dailyReturns: number[]` to FundMomentum interface
- Added `computeDailyReturns()`: reverse price array to chronological, compute day-over-day fractional returns
- Volatility adjustment (Barroso & Santa-Clara 2015): daily vol (Bessel-corrected) → period vol = daily_vol × √(trading_days) → vol_adjusted = blended / period_vol
- Replaced linear rank scoring with z-score (Bessel, n-1) → winsorize ±3σ → normalCDF (A&S 7.1.26) → 0-100
- MIN_DAILY_RETURNS_FOR_VOL = 10. Edge cases: <2 funds → all 50, stdev=0 → all 50, single fund → 75

**2. Bond quality scoring + blended fund scoring (MISSING-2).**
Files: `quality.ts`, `edgar.ts`, `types.ts`, `holdings.ts`, `pipeline.ts`
- Extended EdgarHolding with: fairValLevel, isDebt, debtIsDefault, debtInArrears
- Extended ResolvedHolding with same bond fields (carried through holdings pipeline)
- EDGAR parser extracts `<debtSec>` element for bond identification
- Issuer Category Quality Map: UST=1.0, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50
- Distressed adjustments: isDefault=Y → 0.10, fairValLevel=3 → 0.35, debtInArrears=Y → 0.35
- `isBondHolding()` / `isEquityHolding()` classification helpers
- Blended fund scoring: equity score × equity_ratio + bond score × bond_ratio (§2.4.3)
- Returns coverage_pct for confidence scaling

**3. Coverage-based confidence scaling (MISSING-3, Grinold 1989).**
Files: `pipeline.ts`, `scoring.ts`
- When quality coverage_pct < 0.40: quality_weight_adj = base × max(coverage/0.40, 0.10)
- Freed weight redistributed to momentum (most reliable — price data always available)
- `scoreAndRankFunds()` now accepts per-fund weight overrides
- Z-standardization remains uniform; only weighted composite uses adjusted weights

**4. Finnhub fee12b1 + frontLoad wiring.**
Files: `finnhub.ts`, `pipeline.ts`
- `fetchFinnhubExpenseRatio()` extended to return `fee12b1` and `frontLoad` (both as decimals)
- Pipeline Step 7b constructs NormalizedFeeData from Finnhub fee components
- Replaces dead Tiingo fee path — 12b-1 penalty now properly wired end-to-end

**5. Dead Tiingo fee code removal.**
Files: `tiingo.ts`, `constants.ts`
- Removed: `fetchFundFees()`, `normalizeFeeData()`, `normalizeFeeResponse()`, `fetchTiingoMeta()`, `TiingoFundFees`, `TiingoFundMeta` interfaces, FUND_FEES/FUND_META constants
- Kept: `NormalizedFeeData` interface (shared type), `fetchTiingoPrices()`, `convertTiingoPricesToFmpFormat()` (still used for momentum)

**Files changed:** `momentum.ts`, `quality.ts`, `edgar.ts`, `types.ts`, `holdings.ts`, `pipeline.ts`, `scoring.ts`, `finnhub.ts`, `tiingo.ts`, `constants.ts`, `FUNDLENS_SPEC.md`
**Resolved:** CRITICAL-2 (momentum vol-adjust), CRITICAL-3 (momentum z-score/CDF), MISSING-2 (bond quality), MISSING-3 (coverage scaling), MISSING-8 fully resolved (Finnhub fee data wired)
**Verification:** `tsc --noEmit` passes clean. Pipeline re-run recommended to verify scoring changes with live data.
**Note from Robert:** v5.1 UI strongly preferred over v6 UI — future session (Session 8) will port v5.1 UI.

---

## April 7, 2026 — Session 6: Thesis Scale, Allocation Engine, Money Market Skip, FRED Commodities

**Goal:** Restore the remaining v5.1 "secret sauce" — the thesis scoring scale, allocation engine, deterministic sector priors, FRED commodities, and money market handling. This session merged the planned Session 6 (Thesis Overhaul) and Session 7 (Allocation Engine) into a single session.

**Gaps addressed:** CRITICAL-4, CRITICAL-5, MISSING-4, MISSING-5, MISSING-6, plus Portfolio.tsx "Invalid Date" UI bug.

**1. Thesis: 1.0–10.0 continuous sector scale with range anchoring (CRITICAL-4).**
File: `thesis.ts` — complete rewrite.
- SectorPreference interface: `score: number` (1.0–10.0) replacing `preference: number` (-2 to +2)
- MacroThesis extended: `dominantTheme`, `macroStance`, `riskFactors`
- Prompt rewritten with v5.1-style scoring instructions and range anchoring rules
- Parser handles JSON object and array formats; `clampScore()` enforces 1.0–10.0
- `checkRangeAnchoring()` validates: ≥2 sectors ≥7.0, ≥2 sectors ≤4.0, spread ≥4.0

**2. Deterministic FRED-based sector priors (MISSING-5).**
File: `thesis.ts`, function `computeSectorPriors()`
- Yield curve inverted → Financials -1.0
- Inflation rising → Energy +1.0, Precious Metals +1.0
- Fed tightening → Real Estate -0.5, Utilities -0.5
- Weak employment → Consumer Disc -0.5, Consumer Staples +0.5
- Priors injected into Claude prompt as "SECTOR PRIORS (pre-computed)" block

**3. Positioning normalization corrected (CRITICAL-4 companion).**
File: `positioning.ts` — complete rewrite.
- Normalization: `(score - 1) / 9` maps 1–10 → 0–1 (was `(preference + 2) / 4`)
- Alignment thresholds: favorable = ≥7.0, unfavorable = ≤4.0
- Unclassified holdings contribute neutral 0.5

**4. Allocation engine: full Kelly rewrite (CRITICAL-5).**
File: `allocation.ts` — new file, extracted from brief-engine.ts.
- MAD-based modified z-scores (0.6745 consistency constant)
- Quality gate: 4+ fallbacks → excluded
- Exponential curve `e^(k × mod_z)` using KELLY_RISK_TABLE k-parameters
- 5% de minimis floor with iterative removal + renormalization
- Rounding with error absorption into largest position
- brief-engine.ts updated: old `computeAllocation()` replaced with bridge to `computeAllocations()`

**5. FRED commodity series wired in (MISSING-4).**
File: `fred.ts`
- 4 commodity indicators added to INDICATOR_META: WTI Crude, Brent Crude, Gold, Dollar Index
- `fetchMacroSnapshot()` fetches combined FRED_SERIES + FRED_COMMODITY_SERIES

**6. Money market global skip (MISSING-6).**
Files: `constants.ts`, `pipeline.ts`, `allocation.ts`
- MONEY_MARKET_TICKERS = Set(['FDRXX', 'ADAXX'])
- Pipeline separates money market funds before all scoring loops
- Fixed composite 50, all factors at 50, skip holdings/fundamentals/classification
- Allocation engine excludes with MM tier badge, 0% weight

**7. Portfolio.tsx "Invalid Date" fix.**
File: `client/src/pages/Portfolio.tsx`
- IIFE guard: checks for null/undefined timestamp, validates with `isNaN(d.getTime())`

**8. Backward compatibility: thesis_cache and brief-engine.**
Files: `types.ts`, `persist.ts`, `brief-engine.ts`, `pipeline.ts`
- ThesisCacheRow.sector_preferences broadened to accept both `score` and `preference` fields
- brief-engine.ts thesis reconstruction handles old DB rows
- persist.ts saves `dominant_theme`, `macro_stance`, `risk_factors`
- Pipeline fallback thesis includes new MacroThesis fields

**Files created:** `allocation.ts`
**Files changed:** `thesis.ts`, `positioning.ts`, `brief-engine.ts`, `pipeline.ts`, `fred.ts`, `constants.ts`, `types.ts`, `persist.ts`, `Portfolio.tsx`, `FUNDLENS_SPEC.md`
**Resolved:** CRITICAL-4 (thesis scale), CRITICAL-5 (allocation engine), MISSING-4 (FRED commodities), MISSING-5 (sector priors), MISSING-6 (money market skip), Invalid Date UI bug
**Pending:** `thesis_cache` Supabase migration needed for `dominant_theme`, `macro_stance`, `risk_factors` columns. Pipeline re-run needed to generate fresh scores. `resolveSubFundTicker()` stub still returns null (fund-of-funds look-through can't fire).
**Verification:** `tsc --noEmit` passes clean on both server and client.

---

## April 7, 2026 — Session 7: Tier Badges End-to-End (§6.3)

**Goal:** Wire tier badges from server computation through to client rendering. Tier badges were defined in constants.ts (Session 1) but never computed, stored, or displayed.

**1. Tier computation extracted to scoring.ts.**
File: `src/engine/scoring.ts`
- Added `computeTiers()`: uses the same MAD-based modified z-score logic as allocation.ts (§3.2) to derive tier labels from composite scores. Replicates median, MAD, and tier threshold logic without depending on the full allocation engine.
- Added `getTier()` helper: walks TIER_BADGES array by z-score threshold.
- `scoreAndRankFunds()` now calls `computeTiers()` and attaches `tier` + `tierColor` to each `FundCompositeScore`.
- `rescoreWithNewWeights()` recomputes tiers when composites change from slider adjustments.

**2. FundCompositeScore extended with tier fields.**
Files: `src/engine/scoring.ts`, `src/engine/types.ts`
- `FundCompositeScore` interface: added `tier: string` and `tierColor: string`.
- `FundScoresRow` interface: added `tier: string` and `tier_color: string`.

**3. Persistence layer writes tier data.**
File: `src/engine/persist.ts`
- Score row now includes `tier` and `tier_color` fields when writing to `fund_scores`.

**4. Client API type updated.**
File: `client/src/api.ts`
- `FundScore` interface: added `tier: string` and `tier_color: string`.

**5. Portfolio table renders tier badge column.**
File: `client/src/pages/Portfolio.tsx`
- Added "Tier" column header to fund table.
- Client-side tier recomputation via `computeClientTier()`: replicates MAD z-score logic so tiers update instantly when weight sliders change.
- Tier badge styled with colored text, tinted background, and subtle border matching the tier color.

**6. FundDetail sidebar shows tier badge.**
File: `client/src/components/FundDetail.tsx`
- Tier badge rendered in the fund header below expense ratio, using the same styling as the table badge.

**7. SQL migration created.**
File: `migrations/session7_add_tier_columns.sql`
- Adds `tier` (TEXT, default 'Neutral') and `tier_color` (TEXT, default '#6B7280') columns to `fund_scores`.
- Creates index on `tier` column.

**Files created:** `migrations/session7_add_tier_columns.sql`
**Files changed:** `scoring.ts`, `types.ts`, `persist.ts`, `api.ts`, `Portfolio.tsx`, `FundDetail.tsx`, `FUNDLENS_SPEC.md`
**Verification:** `tsc --noEmit` passes clean on both server and client.
**Database migration required:** Run `migrations/session7_add_tier_columns.sql` in Supabase SQL Editor before deploying. Existing rows default to 'Neutral'; next pipeline run populates real tiers.

## April 7, 2026 — Session 7 (continued): Investment Brief Redesign + Continuous Slider + Allocation Persistence

**Context:** Robert ran v5.1 and v6 side by side. v5.1 scores look great, runs in ~2 minutes. v6 takes 9 minutes. Robert strongly prefers v5.1's UI. Session pivoted from UI coding to strategic design work: how should the Investment Brief feel, what voice should it use, and how should the portfolio page be structured.

**Research conducted:** Surveyed JPMorgan quarterly outlooks, Glass Lake Wealth Management Q1 2026 client letter, Andrew Hill Investment Advisors Q4 2025 letter, Fidelity Quarterly Market Perspectives, Susan Weiner's investment writing research, InvestSuite and InData wealth management reporting guides. Key finding: the best advisory communications feel like a conversation with a knowledgeable advisor, not a data dump. Readers prefer under 2 pages, want specific fund reasoning, and prioritize "how and why" over generic market commentary.

**Decisions made with Robert:**

1. **Investment Brief voice: "Your buddy who's good at markets."** Not a research analyst in a suit (old v1 editorial policy), not a Reddit poster. The kind of person at the company cookout who people pull aside to ask about their 401(k). Confident, clear, occasionally witty, never condescending. Leads with the answer.

2. **4-section brief structure with "W" titles:**
   - "Where the Numbers Point" — The Recommendation (leads, not concludes)
   - "What Happened" — Market narrative + what changed in allocation (combined, not separate sections — avoids redundancy)
   - "What We're Watching" — Risks + catalysts
   - "Where We Stand" — Sector scorecard deep dive
   
   Robert's insight: the recommendation is the punchline when it's last, but it's the *value* when it's first. Your buddy leads with what they'd do.

3. **"Behind the curtain" rule.** The Brief must never expose scoring model mechanics. No factor names as technical terms, no weights, no z-scores, no "highest-weighted factor." If the user asks, the Help section gives accurate answers. The Brief reads like an advisor's genuine assessment. Robert flagged this after seeing briefs that said things like "as this is our highest weighted factor at 30%."

4. **Raw data feed to Claude, not pre-digested summaries.** Robert caught that pre-writing descriptions like "holds companies with strong profit margins" would make Claude a mail merge. Instead: feed actual financial ratios, actual returns, actual expense ratios. Let Claude form its own narrative from the same data an analyst would see. Prevents both templating and model leakage.

5. **Continuous risk slider (1.0–7.0) with k-parameter interpolation.** Robert requested that the slider not be stair-stepped. Risk 5.3 should produce a different allocation than 5.0 or 6.0. Linear interpolation between Kelly anchor points. Fund count emerges naturally from the math — never hard-coded or mapped 1:1 from the slider value.

6. **Allocation history persistence.** New `allocation_history` table stores each month's recommended allocation. Enables "What Changed" delta in the Brief and future performance attribution. Robert: "Consistency builds confidence."

7. **All 4 factors visible in the UI.** v5.1 shows 3 (Positioning, Momentum, Quality). v6 shows all 4 including Cost Efficiency since it's a full 25% factor in v6.

8. **Pipeline performance diagnosed.** v6 at 9 minutes vs v5.1 at 2 minutes. Root causes: 500ms delays (v5.1 uses 200-300ms), no Supabase caching (v5.1 batch-queries before API calls), no Claude classification batching. Fix deferred to Session 10.

**Spec sections updated:** §3.4 (continuous slider), §5.4 (pipeline Step 17), §5.5 (file inventory), §6.4 (slider control), §7.1–7.9 (complete rewrite), §9.3 (MISSING-10 through MISSING-13), §9.5 (roadmap Sessions 7–14)

### April 7, 2026 — Session 8: Brief Engine Redesign (MISSING-10)

**What changed:**

1. **editorial-policy.md rewritten to v2.0.** Old: research analyst voice, 4-section structure (Macro → Thesis → Fund-by-Fund → Allocation). New: "buddy who's good at markets" voice, 4-section W structure (Where the Numbers Point → What Happened → What We're Watching → Where We Stand). Added "Behind the Curtain" rule with explicit prohibited terms list and positive/negative examples. Recommendation leads the Brief instead of concluding it.

2. **brief-engine.ts completely rewritten.** Key changes:
   - `FundBriefData` stripped of: `scores` (factor scores 0-100), `userComposite`, `defaultComposite`, `factorDetails`, `relevanceTags`. Replaced with: `holdingFinancials` (actual margins, ROE, debt ratios, P/E from factor_details dimensions), `returns` (3/6/9/12-month), `sectorExposure`, `dataCoverage`, `isBondFund`.
   - `BriefDataPacket.user` stripped of: `factorWeights` (was sending "Cost Efficiency 25%, Holdings Quality 30%..." to Claude). Now sends only risk tolerance label and natural-language profile summary.
   - `computeRelevanceTags()` deleted entirely. Replaced by `extractHoldingFinancials()` which pulls actual ratio values from quality dimension breakdowns.
   - `computeAllocationForBrief()` reason strings rewritten. Old: "Breakaway tier, composite 85/100, mod-z 2.34σ". New: "Core position; very low cost." Natural language that Claude can echo without model leakage.
   - `profileSummary()` rewritten to avoid factor weight names. Old: "Emphasizes: company fundamentals, low costs". New: plain investor description.
   - Prompt template rebuilt for 4-section W structure. Separates allocated funds (covered in depth) from non-allocated (covered briefly). Feeds actual financial ratios per holding, not scores.
   - Internal fields `_composite` and `_rank` prefixed with underscore to signal they are never sent to Claude — used only for allocation computation and fund ordering.

3. **Zero regressions.** `tsc --noEmit` clean on both server and client. No external API signature changes — `generateBrief()` and `assembleDataPacket()` retain their existing signatures.

**Files modified:** `src/prompts/editorial-policy.md`, `src/engine/brief-engine.ts`, `FUNDLENS_SPEC.md` (§9.3 MISSING-10 status, §9.5 roadmap, §10 changelog)

### April 7, 2026 — Session 9: Continuous Risk Slider (MISSING-11) + Allocation History (MISSING-12)

**Goal:** Make the risk slider continuous (1.0–7.0 with fractional values) and persist allocation history for month-over-month delta tracking in Briefs.

**Gaps addressed:** MISSING-11, MISSING-12. Also fixed Portfolio.tsx risk slider range from incorrect 1–9 to correct 1–7.

**1. Continuous risk slider with k-parameter interpolation (MISSING-11).**
Files: `allocation.ts`, `routes.ts`, `Portfolio.tsx`, `types.ts`, `brief-engine.ts`
- `clampRisk()` no longer calls `Math.round()` — float values pass through.
- New `interpolateK()` function: linear interpolation between KELLY_RISK_TABLE anchor points. `floor_level = Math.floor(rt)`, `ceil_level = Math.ceil(rt)`, `k = k_table[floor] + (k_table[ceil] - k_table[floor]) × fraction`. Example: rt=5.3 → k = 1.20 + (1.50 - 1.20) × 0.3 = 1.29.
- `computeAllocations()` now uses `interpolateK(rt)` instead of exact table lookup.
- routes.ts: Both PUT /api/profile and POST /api/profile/setup validation changed from `Number.isInteger(rt)` to `Number.isFinite(rt)`. Values rounded to one decimal server-side.
- Portfolio.tsx: RiskSlider component changed from min=1/max=9/step=1 to min=1/max=7/step=0.1. Display shows nearest anchor label + decimal value (e.g. "Moderate-Aggressive 5.3/7"). Default risk state changed from 5 to 4.0 (spec §6.4 default).
- types.ts: UserProfileRow.risk_tolerance doc comment updated from "integer" to "continuous 1.0–7.0".
- brief-engine.ts: `riskLabel()` updated to find nearest anchor label via `Math.round()` for float values. Risk tolerance display in data packet uses `.toFixed(1)`.

**2. Allocation history persistence (MISSING-12).**
Files: `brief-engine.ts`, `types.ts`
- New `AllocationHistoryRow` interface in types.ts matching §7.7 schema.
- `fetchPreviousAllocation()`: queries `allocation_history` for user's most recent prior entry.
- `persistAllocationHistory()`: saves current allocation after each Brief generation in `generateBrief()` (Step 6, after saving investment_briefs row).
- `computeAllocationDelta()`: compares current vs. previous allocation. Identifies new positions, removed positions, and weight changes (≥1% threshold to filter rounding noise).
- `BriefDataPacket` extended with `allocationDelta: AllocationDelta[] | null`.
- `assembleDataPacket()` now fetches previous allocation and computes delta.
- `buildUserPrompt()` includes "Portfolio Changes Since Last Brief" section in prompt with NEW/REMOVED/CHANGED labels so Claude can write the "What Happened" narrative with specific allocation changes.

**3. Migration SQL.**
File: `migrations/session9_continuous_risk_and_alloc_history.sql`
- Part 1: `ALTER TABLE user_profiles ALTER COLUMN risk_tolerance TYPE DOUBLE PRECISION` with CHECK constraint (1.0–7.0).
- Part 2: `CREATE TABLE allocation_history` with UUID PK, user_id FK, pipeline_run_id, brief_id (nullable), risk_tolerance, allocations JSONB. Indexes on (user_id, created_at DESC) and (pipeline_run_id). RLS enabled with select policy for own rows.

**Bug fix — Portfolio.tsx risk slider range.** The slider had min=1/max=9 (leftover from v5.1's 1–9 scale), but routes.ts has validated 1–7 since Session 1. Users on the old slider could see values 8–9 that would be rejected by the API. Now correctly 1–7.

**Files created:** `migrations/session9_continuous_risk_and_alloc_history.sql`
**Files changed:** `allocation.ts`, `routes.ts`, `Portfolio.tsx`, `types.ts`, `brief-engine.ts`, `FUNDLENS_SPEC.md`
**Resolved:** MISSING-11 (continuous risk slider), MISSING-12 (allocation history persistence)
**Database migration required:** Run `migrations/session9_continuous_risk_and_alloc_history.sql` in Supabase SQL Editor before deploying.
**Verification:** `tsc --noEmit` passes clean on both server and client.

---

### April 7, 2026 — Session 10: Pipeline Performance (MISSING-13)

**Goal:** Reduce pipeline runtime from ~9 minutes to <3 minutes by porting v5.1's multi-tier caching architecture to v6.

**Root causes addressed (diagnosed Session 7):**
1. No Supabase caching layer — v6 re-fetched all external API data every run
2. API delays too conservative — 500ms vs v5.1's 200-300ms
3. Classification not deduplicated across funds or cached

**1. Created `src/engine/cache.ts` — 4 cache layers ported from v5.1's `cache.js`.**
- `fmp_cache` table (7-day TTL): FMP ratios + key metrics per equity ticker. Fundamentals change quarterly at most. Shared across funds — AAPL in 5 funds = 1 API call per 7 days.
- `tiingo_price_cache` table (1-day TTL): Tiingo daily price arrays per fund ticker. Prices stale after market close. Stores full raw price array so momentum can recompute daily returns.
- `finnhub_fee_cache` table (90-day TTL): Finnhub expense ratio + 12b-1 + front load per fund ticker. Fee structures change infrequently.
- `sector_classifications` table (15-day TTL): Claude Haiku sector labels per holding name. Keyed by holding name (not ticker) because many EDGAR holdings have names but no resolved ticker.

All cache functions use batch queries — one Supabase call for all tickers, not one per ticker.

**2. Pipeline rewritten to use cache-then-API pattern.**
- Step 4 (FMP fundamentals): Batch-check `fmp_cache` for all unique equity tickers in one query. Only hit FMP API for cache misses. Save misses to cache (fire-and-forget).
- Step 5 (Classification): Collect all unique holding names across ALL funds. Batch-check `sector_classifications` cache. Only classify uncached names via Claude Haiku. Apply cached sectors to all matching holdings across all funds. Save new classifications.
- Step 7 (Expenses/fees): Batch-check `finnhub_fee_cache` for all scorable fund tickers. Only hit Finnhub API for cache misses. Save misses.
- Step 8 (Prices): Batch-check `tiingo_price_cache` for all fund tickers. Only hit Tiingo API for cache misses. Skip delay entirely for cache hits. Save misses.

**3. API delay reduced 500ms→250ms (constants.ts).**
v5.1 uses 200-300ms delays successfully in production. 250ms is still conservative — well within FMP Starter (250 calls/day), Tiingo free tier (500/hr), and Finnhub free tier (60/min).

**4. Classification batch size increased 15→25 (classify.ts).**
Matches v5.1. With 50 unique holdings to classify, this reduces from 4 batches to 2 batches, saving 2 × 1.2s = 2.4 seconds of Claude delay.

**5. Classification deduplicated across funds.**
v6 previously classified per-fund (same AAPL classified 5 times if it appeared in 5 funds). Now collects unique names across all funds, classifies once, applies to all.

**Expected performance improvement:**
- First run (cold cache): ~4-5 minutes (reduced delays + deduplication)
- Subsequent runs (warm cache): ~1-2 minutes (90%+ cache hit rate, only API misses + Claude thesis + scoring math)

**Files created:** `src/engine/cache.ts`, `migrations/session10_cache_tables.sql`
**Files changed:** `src/engine/pipeline.ts`, `src/engine/constants.ts`, `src/engine/classify.ts`, `FUNDLENS_SPEC.md`
**Resolved:** MISSING-13 (pipeline performance)
**Database migration required:** Run `migrations/session10_cache_tables.sql` in Supabase SQL Editor before deploying. Creates 4 new tables: `fmp_cache`, `tiingo_price_cache`, `finnhub_fee_cache`, `sector_classifications`.
**Verification:** `tsc --noEmit` passes clean on both server and client.

---

*This document is the single source of truth for FundLens development. If you are reading this in a coding session, you have read your instructions. Now cite this document for every decision you make.*
