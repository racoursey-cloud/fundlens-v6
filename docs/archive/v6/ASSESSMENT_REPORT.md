# FundLens v6 Full Assessment Report
## April 8, 2026 — Independent Assessment Session

---

## 1. EXECUTIVE SUMMARY

FundLens v6 is approximately 85% of the way to matching v5.1's functionality. The scoring engine math (z-space + CDF, volatility-adjusted momentum, bond quality, positioning) is correctly implemented per spec. However, the **allocation engine has a critical spec mismatch** — it uses a capture threshold (the v5.1 pattern) instead of the 5% de minimis floor specified in §3.5, despite the spec and changelog explicitly stating the capture threshold was replaced. The Portfolio page does not display allocations at all (v5.1 does), fund-of-funds look-through is still non-functional, and the project has **never been end-to-end tested with real data** after 11 sessions of changes. Two support documents (FUNDLENS_REBUILD_PLAN.md) are severely stale and contradict the spec.

---

## 2. WHAT WORKS

These features are genuinely functional and correctly match the spec:

**Scoring Engine (§2.1):**
- Z-standardization with Bessel correction (n-1) ✓
- Weighted composite in z-space ✓
- Normal CDF mapping (Abramowitz & Stegun 7.1.26, max error ≈ 7.5×10⁻⁸) ✓
- Client-side rescore via pre-computed z-scores (instant slider feedback) ✓
- Validated against §2.8 worked example: Fund A=84, B=41, C=40, D=31 ✓

**Cost Efficiency (§2.3):**
- Category detection (passive, active, bond, target-date, money market) ✓
- Piecewise linear interpolation against category benchmarks ✓
- 12b-1 fee penalty (-5 pts per 0.10%, capped at -15) via Finnhub fee data ✓
- Money market neutral score (50) ✓

**Holdings Quality (§2.4):**
- 25+ ratios across 5 dimensions at correct weights (0.25/0.20/0.20/0.15/0.20) ✓
- Position-weighted fund aggregation ✓
- Bond quality scoring (issuer category map: UST=1.0, USG=0.95, MUN=0.80, CORP=0.60) ✓
- Distressed bond adjustments (isDefault, fairValLevel=3, debtInArrears) ✓
- Blended equity/bond scoring ✓
- Coverage-based confidence scaling (Grinold 1989) — quality weight reduced when coverage < 40% ✓

**Momentum (§2.5):**
- Multi-window blend (3M=10%, 6M=30%, 9M=30%, 12M=30%) ✓
- Volatility adjustment (Barroso & Santa-Clara 2015): daily vol → period vol → vol_adjusted ✓
- Cross-sectional z-score + winsorize ±3σ + CDF → 0-100 ✓
- Edge cases: <2 funds → 50, stdev=0 → 50, single fund → 75 ✓

**Positioning (§2.6):**
- 1.0–10.0 continuous sector scale with range anchoring ✓
- Normalization: (score - 1) / 9 maps 1–10 → 0–1 ✓
- Unclassified holdings contribute neutral 0.5 ✓
- Deterministic FRED sector priors computed before Claude ✓

**Thesis (§2.6.1):**
- 14 standard sectors ✓
- Range anchoring validation (≥2 above 7.0, ≥2 below 4.0, spread ≥4.0) ✓
- FRED commodity series (WTI, Brent, Gold, Dollar Index) ✓
- Prompt injection hardening on RSS headlines ✓

**Infrastructure:**
- 4-layer Supabase caching (FMP 7d, Tiingo 1d, Finnhub 90d, sectors 15d) ✓
- Pipeline API delay 250ms (reduced from 500ms, matching v5.1) ✓
- Classification deduplication across funds ✓
- Batch classification (25 per Claude call) ✓
- Continuous risk slider (1.0–7.0) with Kelly k-interpolation ✓
- Allocation history persistence for Brief delta tracking ✓
- Security hardening (XSS, prompt injection, rate limiting, XXE, Helmet CSP) ✓

**UI:**
- Dark theme (#0e0f11 bg, #16181c surface, #3b82f6 accent, Inter + JetBrains Mono) ✓
- Two SVG donut charts (sector exposure + fund allocation proxy) ✓
- 7-column fund table (Fund, Score, Tier, Cost, Quality, Momentum, Positioning) ✓
- Tier badges (Breakaway/Strong/Solid/Neutral/Weak/MM/Low Data) ✓
- 420px FundDetail slide-in sidebar ✓
- Factor weight sliders with proportional redistribution (5% min) ✓
- 4-tab navigation (Portfolio, Thesis, Briefs, Settings) ✓
- Briefs page with markdown rendering and DOMPurify sanitization ✓
- SectorScorecard component with 14 sectors ✓

---

## 3. CRITICAL GAPS

### CRITICAL-1: Allocation Engine Uses Capture Threshold Instead of De Minimis Floor

**File:** `src/engine/allocation.ts`, lines 218-241
**Spec:** §3.5 — "Drop any fund with allocation < 5%. Renormalize survivors to sum to 100%."
**Code:** Step 4 implements a capture threshold trim:
```
targetCapture = CAPTURE_HIGH - (rt - 1) * CAPTURE_STEP
// = 70 - (risk - 1) × 5
// risk=1: 70%, risk=4: 55%, risk=7: 40%
```
Ranks funds by weight, walks down until cumulative weight hits targetCapture, cuts everything below.

**Why this matters:** The spec §3.4 explicitly states "No hard-coded fund counts, no stair-step mapping from slider value to fund count, no inverse mapping tables." The changelog (§10, item 11) says this approach "Replaces v5.1's 1–9 slider and arbitrary 65% capture threshold." Yet the code implements exactly the pattern the spec says was replaced, with different numbers (70%/5% step instead of v5.1's 65%/3% step).

The de minimis floor and capture threshold produce fundamentally different portfolios:
- **De minimis (spec):** Removes individual funds below 5% allocation. If 8 funds each get 12.5%, all survive.
- **Capture (code):** Keeps the top N funds until cumulative weight hits target. At risk=4, cuts after top funds covering 55%, which might eliminate several mid-allocation funds.

The `constants.ts` has `CAPTURE_HIGH: 70` and `CAPTURE_STEP: 5` but does NOT define a `DE_MINIMIS_PCT` constant at all. The file header comment claims "5% de minimis floor" was implemented, but the code implements capture threshold.

**Impact:** Every allocation computed by v6 is wrong relative to spec.

### CRITICAL-2: Portfolio Page Does Not Display Allocations

**File:** `client/src/pages/Portfolio.tsx`
**v5.1:** Shows `allocation_pct` per fund in the fund table, powers the Fund Allocation donut chart with actual Kelly-computed allocations.
**v6:** The fund table has Score, Tier, Cost, Quality, Momentum, Positioning — but NO allocation column. The "Fund Allocation" donut shows top 10 funds by composite score normalized to 100%, NOT the Kelly allocation output. The allocation engine (`allocation.ts`) is only called during Brief generation, never for the Portfolio page.

**Why this matters:** The allocation is the single most actionable output of FundLens. A user looking at the Portfolio page in v6 can see fund scores but cannot see "put 40% in FXAIX, 25% in VFIAX..." They must generate a Brief to see their allocation. In v5.1, allocation is front-and-center on the main page.

### CRITICAL-3: No End-to-End Integration Testing

After 11 sessions of changes, the pipeline has never been verified end-to-end with real TerrAscend fund data incorporating all the changes from Sessions 1-11. The individual modules type-check clean (`tsc --noEmit` passes), but:
- Has the scoring math been validated against real fund data (not just the §2.8 worked example)?
- Does the pipeline complete without runtime errors with all 18 funds?
- Do the Finnhub/Tiingo/FMP cache layers work correctly in practice?
- Does the Brief engine produce valid 4-section output with the new editorial policy?
- Do the FRED commodity series actually return data?

---

## 4. MISSING FEATURES

### Per spec but not implemented:

| Feature | Spec Section | Status |
|---------|-------------|--------|
| HHI Concentration Display | §6.6 | Not implemented. Informational only — not blocking scoring. |
| Help Section (FAQs + Claude Chat) | MISSING-9 | Not in spec yet, but planned. |
| Fund-of-Funds Look-Through | §2.4.4 | Scaffolding exists but `resolveSubFundTicker()` returns null. Cannot fire. |
| EIA Weekly Data | §4.4 | Not implemented. Supplemental energy/materials context. |
| Copper FRED Series | §4.4 | Spec says "identify appropriate FRED series" — never done. |
| Supabase Manual Entry Fallback | §4.6 | No admin UI for manual data entry overrides. |
| Brief Email Delivery Testing | §7.8 | Resend integration exists but delivery has not been tested. |

### v5.1 features not in v6:

| Feature | v5.1 File | Status in v6 |
|---------|-----------|-------------|
| Portfolio allocation display | PortfolioTab.jsx | Missing — allocation only visible in Brief |
| Data Quality Banner | DataQualityBanner.jsx | Not ported — flags fallbacks in pipeline data |
| Risk tolerance allocation preview | PortfolioTab.jsx | v5.1 generates 9 hypothetical allocations for slider visualization |
| Treasury yield curve direct fetch | world.js | v6 uses FRED yield data (same info, different source — acceptable) |
| GDELT news | world.js | Replaced by RSS feeds (intentional improvement) |
| Sector ETF momentum | world.js | v5.1 passes sector ETF 63-day trends to thesis — v6 does not |
| Zustand state management | store/useAppStore | v6 uses React useState/useEffect patterns (acceptable) |

---

## 5. DRIFT / CONFLICTS

### 5.1 FUNDLENS_REBUILD_PLAN.md vs FUNDLENS_SPEC.md

The rebuild plan is severely stale (last updated "through Session 9" per the header, but content reflects pre-Session 1 decisions). Key contradictions:

| Topic | Rebuild Plan Says | Spec Says |
|-------|-------------------|-----------|
| Factor weights | SA 25%, Momentum 40%, Quality 35% | Cost 25%, Quality 30%, Momentum 25%, Positioning 20% |
| Positioning weight | 25% | 20% |
| Momentum weight | 20% | 25% |
| Risk scale | 1–9 with 3 levels | 1–7 continuous with 7 Kelly anchor points |
| Allocation method | Z-score threshold (0.0σ / 0.5σ / 1.0σ) | Kelly exponential with k-parameter interpolation |
| Tiingo | "Test FMP first, drop Tiingo if possible" | Tiingo is primary for NAV prices |
| Finnhub | "Dropped — free tier rate limiting" | Primary source for expense ratios |
| Cost Efficiency | Listed as a factor | Promoted from modifier to full 25% factor |
| Brief model | Claude Sonnet | Claude Opus |
| Brief structure | 4 sections (Macro → Thesis → Fund → Allocation) | 4 sections (Where Numbers Point → What Happened → Watching → Stand) |
| Brief voice | "Research analyst" | "Buddy who's good at markets" |

**Recommendation:** Either delete FUNDLENS_REBUILD_PLAN.md or add a prominent deprecation notice. It will mislead any session that reads it before the spec.

### 5.2 allocation.ts Header vs Implementation

The allocation.ts file header (lines 8-11) claims: "5% de minimis floor (was 0.5% or capture-threshold)". But the code implements a capture threshold (lines 218-241), not a de minimis floor. The spec §9.1 entry for allocation also claims "5% de minimis" is implemented. This is factually incorrect.

### 5.3 constants.ts ALLOCATION Block

Contains `CAPTURE_HIGH: 70` and `CAPTURE_STEP: 5` — these constants support the capture threshold that the spec says was removed. Does NOT contain `DE_MINIMIS_PCT: 0.05` — the constant the spec §3.5 requires.

### 5.4 fund-summaries.ts — Undocumented File

`src/engine/fund-summaries.ts` exists in the codebase and generates natural-language fund summaries via Claude Haiku. This file is NOT listed in the spec §5.5 file inventory. Its purpose (providing AI-generated fund summaries for the fund detail sidebar) seems reasonable, but it was added without spec documentation.

### 5.5 v5.1 Scoring Scale (1–10) vs v6 (0–100)

v5.1 uses a 1.0–10.0 scoring scale. v6 uses 0–100. This is an intentional v6 design decision (spec §2.1 says 0-100, §8 changelog item 12 explains the rationale). Not a bug, but worth noting for anyone comparing outputs.

---

## 6. v5.1 FEATURES NOT YET PORTED

| Feature | v5.1 Implementation | Impact |
|---------|---------------------|--------|
| **Allocation in Portfolio** | PortfolioTab.jsx shows allocation_pct per fund | HIGH — users can't see their allocation without generating a Brief |
| **Data Quality Banner** | DataQualityBanner.jsx flags world data, thesis, holdings fallbacks | MEDIUM — users don't know when data is stale |
| **Concentration penalty** | scoring.js applies HHI-based penalty in z-space, risk-scaled | LOW — spec §8 explicitly removed this from scoring (moved to allocation only) |
| **Expense modifier** | scoring.js applies ±0.5 in z-space for very low/high ER | LOW — spec promoted cost to full 25% factor, modifier was redundant |
| **Flow modifier** | scoring.js applies ±0.2 for positive/negative flows | LOW — spec §8 explicitly removed (Frazzini & Lamont 2008) |
| **Sector ETF momentum** | world.js fetches 63-day sector ETF trends for thesis context | MEDIUM — additional signal for thesis generation |
| **GDELT news** | world.js fetches financial headlines | LOW — replaced by RSS feeds (intentional, GDELT was unreliable) |
| **Investor letter** | letter.js generates via Claude Sonnet | REPLACED — v6 uses Investment Brief via Opus with new structure |
| **Piotroski-lite quality** | quality.js uses 5 binary checks | REPLACED — v6 uses 25+ continuous ratio scoring (improvement) |

Items marked "LOW — spec explicitly removed" are intentional design decisions, not gaps.

---

## 7. DETAILED QUESTION ANSWERS

### Architecture

**Q1: v5.1 architecture?**
Express.js 4.21 + React 18.3 (Vite) + Zustand 5.0 state management + Supabase Postgres. 13 upstream API integrations (Anthropic, Tiingo, FRED, Finnhub, FMP, OpenFIGI, SEC/EDGAR, GDELT, Treasury, TwelveData, RSS, Supabase). Server proxies all API keys. In-memory caching with ETL-aware TTLs (Tiingo resets at midnight ET, others 24h). Railway deployment.

**Q2: v6 architecture?**
Express (TypeScript) + React 18 (Vite, TypeScript) + Supabase Postgres. Dropped Zustand for React useState. 10 API integrations (Anthropic, Tiingo, FRED, Finnhub, FMP, OpenFIGI, SEC/EDGAR, RSS, Supabase — dropped GDELT, Treasury, TwelveData). Server proxies all API keys. Multi-layer Supabase caching (replaced in-memory). Railway deployment.

**Q3: Architectural divergences from spec?**
- Spec §5.5 does not list `fund-summaries.ts` — it exists in code but is undocumented
- Spec §3.5 specifies de minimis floor; code implements capture threshold
- Spec §5.2 says client is "a display layer that reads scores from Supabase and applies user-specific weighting client-side" — accurate, but v5.1 also shows allocations client-side, and v6 doesn't

### Scoring Engine

**Q4: v5.1 composite scoring math?**
3-factor model (Sector Alignment 25%, Momentum 40%, Holdings Quality 35%). Each factor scored 1.0–10.0. Factors z-standardized across universe (Bessel-corrected). Weighted composite in z-space. Modifiers applied in z-space before CDF: concentration penalty (HHI × risk multiplier, 0–2 range), expense modifier (±0.5), flow modifier (±0.2). Z-composite mapped through CDF: `composite = clamp(1 + 9 × Φ(z), 1.0, 10.0)`. Z_SCALE = 9/√(2π) ≈ 3.5899.

**Q5: v6 composite scoring math?**
4-factor model (Cost 25%, Quality 30%, Momentum 25%, Positioning 20%). Each factor scored 0–100. Factors z-standardized (Bessel-corrected). Weighted composite in z-space. NO modifiers (concentration, expense, flow all removed per spec §8). Z-composite mapped through CDF: `composite = 100 × Φ(z)`. Abramowitz & Stegun.

**Q6: Where do they differ?**
- v5.1 has 3 factors; v6 has 4 (cost promoted from modifier)
- v5.1 weights: 25/40/35; v6 weights: 25/30/25/20
- v5.1 applies modifiers in z-space; v6 has no modifiers
- v5.1 output scale: 1–10; v6 output scale: 0–100
- v5.1 quality: Piotroski-lite (5 binary checks); v6 quality: 25+ continuous ratios
- v5.1 includes 11 GICS sectors; v6 includes 14 sectors

**Q7: Does v6 scoring match spec §2.1?**
Yes. The z-standardize → weight → CDF pipeline is correctly implemented. The normalCDF matches the spec (A&S 7.1.26). Factor weights match §2.2. Edge cases handled per spec.

### Allocation Engine

**Q8: v5.1 allocation algorithm?**
1. MAD-based modified z-score: `modZ = 0.6745 × (score - median) / MAD`
2. Quality gate: 4+ fallbacks excluded
3. Exponential curve: `k = 0.1 + (risk × 0.20)` [risk 1–9], `weight = e^(k × modZ)`
4. Capture threshold trim: `target = 65 - (risk-1) × 3` [risk=1: 65%, risk=9: 41%], rank funds, walk until cumulative hits target, cut remainder
5. Rounding to 1 decimal, error absorption into largest

**Q9: v6 allocation algorithm?**
1. MAD-based modified z-score: `modZ = 0.6745 × (score - median) / MAD` ✓ matches spec
2. Quality gate: 4+ fallbacks excluded ✓ matches spec
3. Exponential curve: k from Kelly table (0.30–1.85) with linear interpolation ✓ matches spec
4. **Capture threshold trim**: `target = 70 - (risk-1) × 5` [risk=1: 70%, risk=7: 40%] **✗ DOES NOT MATCH SPEC**
5. Rounding to whole numbers, error absorption into largest ✓ matches spec

**Q10: Where do they differ?**
- Risk scale: v5.1 uses 1–9; v6 uses 1–7 (correct per spec)
- k derivation: v5.1 uses linear formula; v6 uses Kelly table interpolation (correct per spec)
- Capture threshold: v5.1 uses 65/3; v6 uses 70/5 — BOTH use capture threshold pattern
- Rounding: v5.1 rounds to 1 decimal; v6 rounds to whole numbers (correct per spec)
- Output format: v5.1 returns allocation_pct as 0–1 decimal; v6 returns 0–100 whole percentage

**Q11: Does v6 allocation match spec §3?**
Mostly, but Step 4 is wrong. The spec §3.5 says "Drop any fund with allocation < 5%. Renormalize survivors to sum to 100%." The code implements a capture threshold, not a de minimis floor. Steps 1-3 and 5-6 are correct.

### Data Pipeline

**Q12: v5.1 data sources?**
Tiingo (prices), FRED (9 macro series), Finnhub (fundamentals primary), FMP (fundamentals fallback), OpenFIGI (CUSIP resolution), SEC/EDGAR (holdings), GDELT (news), Treasury.gov (yield curve), TwelveData (backup prices), RSS feeds, Claude (Haiku + Sonnet), Supabase.

**Q13: v6 data sources?**
Tiingo (prices primary), FRED (9 economic + 4 commodity series), Finnhub (expense ratios primary), FMP (fundamentals primary, prices fallback), OpenFIGI (CUSIP resolution), SEC/EDGAR (holdings), RSS feeds (5 feeds), Claude (Haiku + Sonnet + Opus), Supabase.

**Q14: Missing/broken v5.1 sources in v6?**
- GDELT: intentionally replaced by RSS feeds
- Treasury.gov yield curve: replaced by FRED yield series (same data)
- TwelveData: dropped (FMP/Tiingo sufficient)
- Sector ETF momentum (63-day trends passed to thesis): not ported to v6

**Q15: Does pipeline order match spec?**
Yes. Pipeline.ts implements all 16 steps from spec §5.4 in the correct order.

### Investment Brief / Thesis

**Q16: v5.1 thesis generation?**
Claude Sonnet 4 with FRED macro data (12 series), Treasury yields (5 points), gold price, sector ETF momentum (11 sectors), GDELT financial headlines (24). Output: narrative + sector scores (1–10) for 11 GICS sectors + dominant theme + macro stance + risk factors + catalysts. 3000 max tokens, temp=0.

**Q17: v6 investment brief?**
Two-stage: (1) Thesis via Claude Sonnet with FRED data (13 series: 9 economic + 4 commodity), RSS headlines (5 feeds), deterministic sector priors. Output: narrative + sector scores (1–10) for 14 sectors + dominant theme + macro stance + risk factors. (2) Brief via Claude Opus with raw fund data (NO scores, NO factor names), allocation from Kelly engine, allocation delta from history. 4-section "W" structure. Editorial policy v2.0 (advisor voice).

**Q18: Differences?**
- v5.1 "investor letter" via Sonnet; v6 "Investment Brief" via Opus
- v5.1 receives fund scores + factor details; v6 receives raw financial data (no model internals)
- v5.1: 4 sections (Macro → Thesis → Fund → Allocation); v6: 4 sections ("W" titles)
- v5.1: research analyst voice; v6: "buddy who's good at markets" voice
- v5.1: 11 sectors; v6: 14 sectors
- v6 adds: deterministic FRED priors, allocation delta tracking, "behind the curtain" rule
- v6 adds: FRED commodity series (WTI, Brent, Gold, Dollar Index) to thesis context

### UI / Client

**Q19: v5.1 pages/views?**
Portfolio (scores + allocations + donuts), Thesis (narrative + sector scorecard), Settings (risk, weights, fund list), Setup Wizard, Login. Plus: Data Quality Banner, Pipeline Overlay, Fund Detail Sidebar.

**Q20: v6 pages/views?**
Portfolio (scores + donuts), Thesis (narrative + sector scorecard), Briefs (history + generation), Settings (profile, fund list, pipeline controls), Setup Wizard, Login, Auth Callback. Plus: Pipeline Overlay, Fund Detail Sidebar, Error Boundary.

**Q21: What's in v5.1 that's missing/broken in v6?**
- Allocation display in Portfolio (HIGH impact)
- Data Quality Banner (MEDIUM impact)
- Risk slider allocation preview (v5.1 generates 9 hypothetical allocations for visualization)

**Q22: What's in v6 that's new?**
- Dedicated Briefs page with history archive
- Settings page (replaces in-nav Pipeline tab)
- Error Boundary component
- SectorScorecard as shared component
- Tier badges (Breakaway/Strong/Solid/Neutral/Weak)
- DOMPurify sanitization for Brief content
- All 4 factors visible in fund table (v5.1 shows 3)

### Database

**Q23: v5.1 storage?**
Supabase Postgres: profiles, saved_funds, run_history, tiingo_cache, finnhub_cache, fmp_cache, cusip_ticker_cache, sector_classifications. In-memory caching for API responses.

**Q24: v6 storage?**
Supabase Postgres: funds, holdings_cache, cusip_cache, pipeline_runs, user_profiles, fund_scores, investment_briefs, brief_deliveries, thesis_cache, allocation_history. Plus cache tables: fmp_cache, tiingo_price_cache, finnhub_fee_cache, sector_classifications. Supabase-based caching (not in-memory).

**Q25: Schema mismatches?**
No significant schema mismatches found between v6 code and spec. The spec's §7.7 allocation_history table schema matches the types.ts AllocationHistoryRow interface. The z-score columns in fund_scores match the persist.ts implementation.

---

## 8. RECOMMENDED PRIORITY ORDER

### Priority 1: Fix Allocation Engine (1 session, blocking)
Replace capture threshold with 5% de minimis floor per spec §3.5. Remove `CAPTURE_HIGH` and `CAPTURE_STEP` from constants. Add `DE_MINIMIS_PCT: 0.05`. Implement iterative removal (drop < 5%, renormalize, repeat until stable). This is the most critical bug — every allocation is wrong.

### Priority 2: Add Allocation to Portfolio Page (1 session, high impact)
Port the allocation engine call to Portfolio.tsx. Show allocation percentage per fund in the table. Power the Fund Allocation donut with real Kelly allocations. The risk slider should trigger allocation recomputation (not just rescore). This is the single biggest UX gap vs v5.1.

### Priority 3: End-to-End Integration Test (1 session, de-risking)
Run the full pipeline against the real 18-fund TerrAscend universe. Verify: pipeline completes without runtime errors, all cache layers function, scoring produces reasonable outputs, Brief generates with 4-section structure, allocation matches manual calculation. This is the highest-risk item — 11 sessions of changes have never been tested together.

### Priority 4: HHI Concentration Display (0.5 session)
Implement §6.6 — compute HHI per fund from sector holdings, display in FundDetail sidebar. Pure math, no API calls. Low risk.

### Priority 5: Clean Up Documentation (0.5 session)
Either delete or deprecate FUNDLENS_REBUILD_PLAN.md. Add spec §5.5 entry for fund-summaries.ts. Update spec §9 to reflect CRITICAL-1 finding (allocation capture vs de minimis).

### Priority 6: Help Section (1 session)
MISSING-9: FAQs + Claude Haiku chat scoped to FundLens questions. Deferred feature, not blocking core functionality.

### Priority 7: Fund-of-Funds Look-Through (0.5-1 session)
Wire `resolveSubFundTicker()` to FMP search. Test against real fund-of-funds in the TerrAscend menu. Currently a stub that always returns null.

---

## 9. REMAINING SESSIONS ESTIMATE

To get v6 to "works as well as v5.1":

| Session | Focus | Effort |
|---------|-------|--------|
| 12 | Fix allocation engine (de minimis) + add allocation to Portfolio | 1 full session |
| 13 | End-to-end integration testing with real data | 1 full session |
| 14 | HHI display + documentation cleanup + polish | 0.5–1 session |
| 15 | Help section | 1 session (if desired) |
| 16 | Fund-of-funds look-through (if desired) | 0.5–1 session |

**Minimum to match v5.1: 3 focused sessions** (fix allocation, add to Portfolio, integration test).
**Full spec compliance: 5 sessions** (adds HHI, help section, fund-of-funds, polish).

---

## 10. THINGS I'M NOT SURE ABOUT

1. **Does the Finnhub API actually return data for all 18 TerrAscend fund tickers?** The spec says it does, but this hasn't been verified post-Session 4.

2. **Does the Brief engine produce quality output with the new editorial policy?** The engine was rewritten in Session 8, but no sample Brief has been generated and reviewed.

3. **Are the Supabase cache tables created?** Migrations exist (`session10_cache_tables.sql`, etc.) but I can't verify they've been run without database access.

4. **Is fund-summaries.ts actually called in the pipeline?** It's imported in persist.ts but I wasn't able to verify the full call chain.

5. **Does the v6 pipeline complete in <3 minutes as claimed?** Session 10 projected this based on caching improvements, but it hasn't been measured.
