# FundLens — Master Specification
## Version 7.0 — Single Source of Truth
**Last updated:** April 8, 2026
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
k = Kelly-fraction-derived parameter from risk level (see table below)
raw_weight[i] = e^(k × mod_z[i])
normalized_weight[i] = raw_weight[i] / Σ(raw_weight)
```

**7-Point Risk Scale — Kelly Fraction Mapping:**

| Risk Level | Label | Kelly Fraction | k Parameter | Capture Character |
|------------|-------|---------------|-------------|-------------------|
| 1 | Very Conservative | ~0.15 | 0.30 | Very spread out |
| 2 | Conservative | ~0.22 | 0.50 | Diversified with mild tilt |
| 3 | Moderate-Conservative | ~0.30 | 0.70 | Balanced diversification |
| 4 | Moderate | ~0.40 | 0.95 | Moderate concentration |
| 5 | Moderate-Aggressive | ~0.50 | 1.20 | Concentrated |
| 6 | Aggressive | ~0.65 | 1.50 | High conviction |
| 7 | Very Aggressive | ~0.80 | 1.85 | Maximum conviction |

The k values are non-linearly spaced — tighter at the conservative end (where differences are subtle) and wider at the aggressive end (where differences are dramatic). This produces genuinely different allocation profiles at each level, not just linear rescaling.

Fund count and concentration are emergent properties of the math. No hard-coded fund counts, no inverse mapping tables.

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
| scoring.ts | Composite scoring engine (z-standardize, weight, CDF map) |
| classify.ts | Claude Haiku sector classification |
| thesis.ts | Claude Sonnet macro thesis generation |
| fred.ts | FRED macro data + commodity prices |
| rss.ts | RSS feed fetcher |
| brief-engine.ts | Investment Brief generator (data packet, allocation, Claude Opus) |
| brief-email.ts | Brief email delivery via Resend |
| brief-scheduler.ts | Brief eligibility checker (30-day cadence) |
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

- **Type:** 7-point slider
- **Label:** "Investment Style"
- **Left end (1):** "Very Conservative"
- **Right end (7):** "Very Aggressive"
- **Default:** 4 ("Moderate")
- **Affects:** Allocation only. Scores do not change.

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

A personalized monthly research document delivered to each user. Modeled after institutional advisor output. Named "Investment Brief" — not "letter," not "report."

### 7.2 Generation Model

**Layer 1 — Data Packet:** assembleDataPacket() builds per-user data with relevance tags based on risk tolerance and factor weights. Selects which truths are most relevant to each user's investment posture.

**Layer 2 — Editorial Policy:** editorial-policy.md governs Claude Opus writing:
- Every claim must trace to a specific data point
- Never characterize a fund positively without citing the metric
- Never omit a material negative
- Personalization means selecting which truths to emphasize, not altering the truth
- Never implies certainty about future performance
- Tone is research analyst, not sales

### 7.3 Allocation in Brief

The Brief includes a recommended allocation computed by the allocation engine (Section 3) using the user's risk tolerance. This is the only place risk tolerance influences the output.

### 7.4 News and Culture in Brief

Claude should reference current events, trends, and cultural context when it enhances the narrative. This makes the Brief feel current and relevant to readers of all ages. However, cultural signals never influence the scoring math — they are narrative-only.

### 7.5 Delivery

- **Automatic:** Sent via Resend email every 30 days after signup
- **On-demand:** User can generate anytime from the app
- **History:** All past Briefs archived and viewable

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

**Last updated:** April 8, 2026 (after Session 1)

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

### 9.2 What's BROKEN (Code Exists But Doesn't Match Spec)

These are the highest priority. The code runs but produces wrong results.

**CRITICAL-1: Scoring Engine — Missing Z-Space + CDF (§2.1)**
File: `src/engine/scoring.ts`, function `computeComposite()`
Spec requires: raw scores → z-standardize (Bessel-corrected stdev, n-1) → weighted composite in z-space → normal CDF map back to 0-100.
Code does: simple weighted average `raw.cost * w.cost + raw.quality * w.quality + ...` then clamp.
Impact: Without z-standardization, factors with wider natural score ranges dominate the composite. Without CDF mapping, scores distribute linearly instead of following the S-curve. This is the core formula of the entire system.
NOTE: This also affects client-side rescoring — `computeComposite()` is shared.

**CRITICAL-2: Momentum — Missing Volatility Adjustment (§2.5.2)**
File: `src/engine/momentum.ts`
Spec requires: `vol_adjusted_return = blended_return / period_vol` where `period_vol = daily_vol × √(trading_days)`.
Code does: uses raw blended returns for ranking.
Impact: High-volatility funds dominate the momentum signal. 15% return / 25% vol should score lower than 12% return / 8% vol.

**CRITICAL-3: Momentum — Missing Z-Score + CDF Scoring (§2.5.3)**
File: `src/engine/momentum.ts`, function `scoreMomentumCrossSectional()`
Spec requires: z-score (Bessel) → winsorize ±3 sigma → CDF map to 0-100. Edge cases: <2 funds → all 50, all identical → all 50, single fund → 75.
Code does: linear rank-to-score `95 - (rank / (n-1)) * 90`.
Impact: Wrong distribution shape. Doesn't handle edge cases per spec.

**CRITICAL-4: Positioning — Wrong Scale (§2.6.1)**
Files: `src/engine/thesis.ts` (prompt and types), `src/engine/positioning.ts` (normalization)
Spec requires: sector scores on 1.0–10.0 scale (one decimal). Range anchoring: ≥2 sectors ≥7.0, ≥2 sectors ≤4.0, spread ≥4.0. Normalization: `(score - 1) / 9`.
Code does: -2 to +2 integer scale. Prompt asks Claude for -2 to +2. Normalization: `(preference + 2) / 4`.
Impact: 5 discrete values vs continuous 1.0-10.0. Positioning scores compressed.

**CRITICAL-5: Allocation Engine — Wrong Algorithm (§3.1–3.6)**
File: `src/engine/brief-engine.ts`, function `computeAllocation()`
Spec requires: (1) MAD-based modified z-scores using 0.6745 consistency constant, (2) quality gate excluding 4+ fallback funds, (3) exponential curve `e^(k × mod_z)` using Kelly k parameter from KELLY_RISK_TABLE, (4) normalize, (5) 5% de minimis floor, (6) rounding with error absorption into largest position.
Code does: standard z-scores → linear threshold `(rt-1)/8` → proportional `z - threshold` weighting → 0.5% floor.
Impact: Fundamentally different allocation behavior. The exponential curve creates dramatically different concentration profiles at each risk level. The 5% de minimis floor is industry standard; 0.5% is meaningless.
NOTE: The allocation engine should be extracted to its own file (`allocation.ts`) rather than living inside brief-engine.ts.

### 9.3 What's MISSING (Spec Feature Not Yet Implemented)

**MISSING-1: Cost Efficiency 12b-1 Fee Penalty (§2.3)**
File: `src/engine/cost-efficiency.ts`
Spec: When Tiingo provides 12b-1 fees, apply -5 points per 0.10% of 12b-1, capped at -15.
Status: No 12b-1 handling. Depends on Tiingo fee data integration (Session 3).

**MISSING-2: Bond Quality Scoring (§2.4.2, §2.4.3)**
File: `src/engine/quality.ts`
Spec: Issuer Category Quality Map (UST=1.00, USG=0.95, MUN=0.80, CORP=0.60, Default=0.50). Distressed adjustments (isDefault=Y → 0.10, fairValLevel=3 → 0.35, debtInArrears=Y → 0.35). Blended equity/bond scoring.
Status: Only equity dimension scoring exists. No bond quality map.

**MISSING-3: Coverage-Based Confidence Scaling (§2.4.1)**
File: `src/engine/quality.ts`, `src/engine/pipeline.ts`
Spec: If coverage_pct < 0.40, reduce quality weight: `quality_weight_adj = base × max(coverage/0.40, 0.10)`, freed weight goes to momentum, renormalize all to 1.0.
Status: Not implemented. Quality returns score but not coverage_pct.

**MISSING-4: FRED Commodity Series (§4.4)**
Files: `src/engine/fred.ts`, `src/engine/constants.ts`
Spec: DCOILWTICO (WTI crude), DCOILBRENTEU (Brent crude), GOLDAMGBD228NLBM (gold), DTWEXBGS (dollar index), copper.
Status: Constants added in Session 1 (FRED_COMMODITY_SERIES). Not yet wired into fred.ts fetch or thesis prompt.

**MISSING-5: Deterministic FRED-Based Sector Priors (§2.6.2)**
File: `src/engine/thesis.ts`
Spec: Compute before Claude. Rules: yield curve inverted → Financials prior -1.0; CPI YoY > 4% → Energy +1.0, Precious Metals +1.0; fed tightening → Real Estate -0.5, Utilities -0.5; unemployment > 5% → Consumer Disc -0.5, Consumer Staples +0.5.
Status: Not implemented. No `computeSectorPriors()` function. FRED data goes directly to Claude.

**MISSING-6: Money Market Global Skip (§2.7)**
Spec: Money market funds get fixed composite 50, skip ALL factor scoring, display as "MM" tier, weight 0 in allocation engine.
Status: Category detection exists in cost-efficiency.ts. No global skip in pipeline.ts. No MM tier display. No allocation exclusion.

**MISSING-7: HHI Concentration Display (§6.6)**
Spec: Herfindahl-Hirschman Index of sector exposure per fund in detail view. Informational only.
Status: Not implemented anywhere.

**MISSING-8: Tiingo Integration (§4.1, §4.6)**
Spec: Tiingo is primary source for fund NAV history (split-adjusted) and fee data (12b-1, loads). FMP is fallback for prices.
Status: Tiingo client file may exist but integration with cost-efficiency (fee data) and momentum (prices) is not wired in pipeline.ts. Pipeline currently uses FMP for both.

**MISSING-9: Help Section — FAQs + Live Claude Chat (Robert's request)**
Spec: Not yet in spec — feature idea from build planning session. Help section with static FAQs and Claude Haiku chat scoped strictly to FundLens questions.
Status: Planned for Session 9 of the build roadmap.

### 9.4 CUSIP Resolver — Flagged for Dedicated Review

Robert flagged the CUSIP resolver (`src/engine/cusip.ts`) as needing its own dedicated review session. It was not audited in Session 0 or Session 1. The OpenFIGI integration, cache behavior, batch handling, and fallback logic all need verification against spec §4.3.

### 9.5 Build Roadmap (Remaining Sessions)

| Session | Focus | Key Gaps Addressed |
|---------|-------|--------------------|
| 2 | CUSIP Resolver Deep Review | §4.3 — flagged by Robert |
| 3 | Tiingo Integration | MISSING-8, MISSING-1 (12b-1 fees depend on Tiingo) |
| 4 | Scoring Engine | CRITICAL-1 (z-space + CDF composite) |
| 5 | Factor Upgrades | CRITICAL-2, CRITICAL-3 (momentum vol-adjust + z-score), MISSING-2 (bond scoring), MISSING-3 (coverage scaling) |
| 6 | Thesis Overhaul | CRITICAL-4 (1-10 scale), MISSING-4 (FRED commodities wired in), MISSING-5 (deterministic priors) |
| 7 | Allocation Engine | CRITICAL-5 (full Kelly rewrite), MISSING-6 (money market exclusion) |
| 8 | UI Alignment | Tier badges wired in, risk slider 1-7 in client, HHI (MISSING-7) |
| 9 | Help Section | MISSING-9 (FAQs + Claude Haiku chat) |
| 10 | Integration Testing | End-to-end pipeline validation against worked example (§2.8) |

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

---

*This document is the single source of truth for FundLens development. If you are reading this in a coding session, you have read your instructions. Now cite this document for every decision you make.*
