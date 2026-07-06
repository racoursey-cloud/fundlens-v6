# FundLens v8 — Regime Specification: Session Record 01

**Session:** Stage 1 Framework Survey + Data-Source Re-Survey
**Date:** July 6, 2026
**Participants:** Robert Coursey (product owner) · Fabio (chat Claude — planner/verifier)
**Builder channel:** Clyde (Claude Code) — commits this record only; **no build work is authorized by this document**
**Status:** ⚠️ **ALL DECISIONS PENDING RATIFICATION.** Nothing in this document is locked.
**Suggested repo location:** `docs/sessions/` (Clyde: adjust to repo convention; one file per commit)

Relationship to the deliverable: `REGIME_SPEC.md` (the final spec) does not exist yet. It will be assembled from ratified Stages 1–5. This file is the session record only.

---

## 1. Where this sits in the v8 arc

Previously ratified charter (unchanged by this session except as proposed in §7):

- The macro regime is computed **deterministically** by server-side code from official data series + market prices. No news, sentiment, or geopolitical inputs to classification.
- **Claude narrates the regime; it never determines it.**
- The Pulse layer (daily fund NAV returns) is a first-class instrument.
- Rules live in-repo as citable, auditable spec (same spirit as the Dossier Contract / 90-95 gate).

Stage map for the Regime Spec:

| Stage | Content | Status |
|---|---|---|
| 1 | Framework survey & recommendation | **Delivered this session — pending ratification** |
| 2 | Regime taxonomy (names, definitions, count) | Not started |
| 3 | Indicator set (verified series IDs, cadence, revisions) | Not started (candidate pool seeded, §6) |
| 4 | Classification rules (thresholds, hysteresis, tie-breaks, vintage policy) | Not started |
| 5 | Portfolio implications per regime + narration contract | Not started |

Mid-session, Robert paused Stage 1 ratification and commissioned a fresh data-source survey — the original survey dates to the v5-era sessions (March–April 2026, earlier Claude generation) and predates known platform changes. Findings in §6. A dedicated **Data-Source & Pipeline Deep Dive** session will follow before any ratification (§8).

---

## 2. The news question (charter tension, surfaced and addressed)

Robert asked that the regime "incorporate daily news trends." As written, this conflicts with the charter's input rule. Resolution framework proposed by Fabio:

1. **Market prices already embed the news, graded by money.** Credit spreads, inflation breakevens, and volatility reprice within minutes of any headline that matters to portfolios — and correctly ignore the ones that don't. Daily market-price inputs are the disciplined, charter-compliant "news channel." *Working position: adopt.*
2. **News as narration color.** The Stage 5 narration contract may (or may not) permit Claude to reference verifiable current events when explaining why an indicator moved — clearly labeled as context, never as the reason for classification. *Deferred to Stage 5 as an explicit contract clause (allow-with-bright-line vs. prohibit).*
3. **News as a classification input.** *Recommended REJECT:* non-deterministic (two same-day runs could disagree), non-replayable (headlines cannot be backtested), non-auditable. Fails "same inputs → same regime" and the Dossier Contract audit spirit.

---

## 3. Stage 1 survey — findings summary

### A. Growth × Inflation quadrant (Investment Clock / All Weather school)

Merrill Lynch's Investment Clock (Greetham, 2004 research) splits the cycle into four phases by two directions: growth relative to trend (the output gap) and inflation. Phases and canonical asset winners: **Reflation** (both falling → bonds), **Recovery** (growth up, inflation low → stocks; "goldilocks"), **Overheat** (both up → commodities), **Stagflation** (growth down, inflation up → cash). Average historical phase ≈ 20 months per the original Merrill research. Still run in production today (Royal London Asset Management, on 40+ years of data). Bridgewater's All Weather uses the same two-axis logic.

Strengths: two dimensions a non-finance reader understands; direct, literature-backed mapping to asset/sector tilts (what Positioning scoring needs); measurable from public data. Weaknesses: as commonly practiced it is **interpretive, not formulaic** — FundLens must harden it into deterministic rules; boundaries are noisy near trend; **blind to fast credit panics** (macro data still looked fine in late Feb 2020 while credit seized). Honesty note: the inventor's own fund implementation posted middling returns — this is an organizing map of "the way the world is," not a money machine, and must be built and narrated as the former.

### B. Business-cycle phases (NBER-style; early / mid / late / recession)

Fidelity's Asset Allocation Research Team runs the best-known practitioner version, with documented sector patterns (economically sensitive sectors early; defensives — staples, utilities, health care — in recession). Valuable evidence base.

Disqualifier: real-time determinism. NBER announces business-cycle **peaks an average of ~7.8 months after the fact and troughs ~15.8 months after** (the Feb 2020 peak was announced June 2020; the Apr 2020 trough not until July 2021). "Late cycle" has no deterministic definition anywhere; Fidelity's own materials note cycles skip and retrace phases. Clyde would face exactly the judgment calls the spec must eliminate.

**Harvest:** the Sahm rule — recession signal when the 3-month moving average of the U-3 unemployment rate rises ≥ 0.50 pp above its 12-month low — available on FRED in a real-time vintage (`SAHMREALTIME`) built from as-available data. Also harvest the sector-rotation evidence base for Stage 5 tilt tables.

### C. Risk-on / Risk-off (pure market stress)

Superb data cadence (daily spreads and volatility; weekly financial-conditions composites) and unmatched crisis detection — HY spreads blew out to roughly 20 pp in Dec 2008 and ~10.9 pp in Mar 2020, screaming regime change weeks ahead of official macro data.

Disqualifiers: two states falls short of the charter's 4–6 mandate, and the family has **no inflation axis**. 2022 is the proof case: stocks and bonds fell together because the downturn was inflationary; a "risk-off → rotate to bonds" rule fails at exactly the worst moment. **Harvest:** the fast-moving stress layer.

### D. Statistical regime detection (Markov switching / hidden Markov models)

Hamilton (1989), *Econometrica* 57:357–384, founded the field; hundreds of successors; the modern quant standard. **Rejected on charter grounds, not merit:**

1. Output is probabilistic ("72% recession state"), not a state — thresholding it hides determinism inside an opaque estimated model rather than citable rules.
2. **Refit instability.** Published replication work re-running Hamilton's own specification on revised/extended data found alternative parameter solutions — some fitting better — that no longer correspond to the recession/expansion split. Translation: the regime shown to coworkers in March could silently become a different regime after a July refit. A Dossier-Contract product cannot relabel its own history.
3. Unreadable to a non-quant audience.

Retained only as an optional **offline benchmark** to sanity-check the deterministic rules (same pattern as the Haiku-vs-FMP classification benchmark).

### E. Monetary-policy regimes

Real but one-dimensional; policy already shows up through the yield curve and financial conditions. **Inputs, not taxonomy.**

---

## 4. Stage 1 recommendation (PENDING)

**Hybrid: quadrant base + stress override.**

- **Base (4 states, ~monthly tempo):** growth axis (activity above/below trend, from official activity composites incl. Sahm) × inflation axis (pressure above/below anchor, from monthly CPI/PCE anchored by daily market-based expectations).
- **Override (1 state, daily/weekly tempo):** a Market Stress regime with **absolute priority**, triggered by explicit thresholds on credit spreads / volatility / financial conditions; exits with hysteresis, after which the quadrant resumes.
- **Total: 5 regimes**, mutually exclusive and collectively exhaustive by construction (axes partition all non-stress states; override priority guarantees exclusivity; Stage 4 writes the boundary math). Stage 2 may split the cooling-growth/cooling-inflation cell to reach 6 (stays within the charter's 4–6).

Rationale (condensed):

1. The parents cover each other's blind spots — 2008 and Mar-2020 are caught by the override; 2022 is caught by the quadrant.
2. Institutional precedent for the two-pillar structure: the Chicago Fed itself pairs an activity index (CFNAI) with a financial-conditions index (NFCI).
3. Fits the ratified v8 architecture: slow official-data base + daily market channel feeding the Pulse layer.
4. Every input is free, public, verifiable at workable cadence (§6).
5. Regime → tilt mappings carry decades of citable literature (Investment Clock asset map; Fidelity sector work) for Stage 5.

Plain-English framing for the audience: four kinds of economic weather, plus a storm warning that overrides the forecast.

---

## 5. Honesty flags (carry into Stages 2–5 and into the narration contract)

1. **Yield-curve humility.** The 3-month/10-year curve stayed inverted Oct 25, 2022 → Dec 13, 2024 — the longest such stretch in ~45 years — and no recession followed; 2023 real GDP grew 2.9%. By 2024 a majority of surveyed bond strategists no longer trusted inversion as a predictor; historical inversion→recession leads ranged 7–49 months (median ≈ 20). **Rule:** the curve may be an input, never a sole trigger; the engine classifies present conditions, never forecasts.
2. **Nowcast, not crystal ball.** The stagflation cell has a tiny historical sample (essentially the 1970s and 2021–22); all tilt mappings are historical tendencies. **Rule:** the regime modestly tilts Positioning inside the scoring model — it never becomes market timing — and narration must use tendency language ("has historically favored"), never predictions. This clause, more than any disclaimer, is the protection owed to the ~200 coworkers relying on the tool.
3. **Hysteresis is load-bearing.** Growth and inflation hover near trend most of the time; without entry/exit buffers and minimum dwell times the regime flaps and destroys reader trust. Stage 4 centerpiece.
4. **Vintage policy required.** Published histories revise (NFCI history shifts week to week; BLS applies annual seasonal revisions). "Same inputs → same regime" must mean: the **regime-of-record** is computed from data *as published on the classification date* and stored immutably; recomputations on revised data are labeled as such.

---

## 6. Data-source re-survey — July 6, 2026

All items verified via live sources this session unless explicitly flagged "not yet verified."

### 6.1 Platform changes since the original (v5-era) survey

- **FRED API Version 2 launched November 2025**, with strict API-key enforcement that killed legacy unauthenticated scraping paths. All ingestion must use the keyed API.
- **April 2026: FRED clamped ICE BofA index series** (including HY OAS `BAMLH0A0HYM2`) **to a rolling three-year window.** Live signal use is fine; backtesting stress thresholds through 2008/2020 from FRED is not. Mitigation identified (§6.5: OFR FSI).

### 6.2 Foundation

- **FRED** — free API key; single access tier; 800,000+ series; observed rate ceiling on the order of 120 requests/min (a non-issue at FundLens volumes); v2 supports bulk full-history pulls by release; `fred/series/vintagedates` endpoint exposes revision/first-release dates.
- **ALFRED** — archival vintages ("what did this series say *on* date X"). The mechanical basis for backtesting and the regime-of-record policy. Example: GDPNow vintages archived back to Q3 2011.

### 6.3 Growth-axis candidates (all free)

| Input | ID / Source | Cadence | Notes |
|---|---|---|---|
| GDPNow | FRED `GDPNOW` (Atlanta Fed) | ~6–7 updates/mo within quarter | 13-subcomponent nowcast; purely model-driven (no judgment adjustments); runs until BEA advance estimate |
| Weekly Economic Index | FRED `WEI` | Weekly | Composite of 10 high-frequency series (claims, rail traffic, staffing, fuel sales, electricity load, etc.); scaled to four-quarter GDP growth |
| CFNAI | FRED `CFNAI` (Chicago Fed) | Monthly | 85-indicator national activity composite |
| Sahm rule (real-time) | FRED `SAHMREALTIME` | Monthly | 0.50 pp trigger; built from as-available unemployment data |
| ADS Index (Philly Fed) | — | High-frequency | **Candidate only — NOT YET VERIFIED.** Confirm availability/format in deep-dive session |

### 6.4 Inflation-axis candidates (all free)

| Input | ID / Source | Cadence | Notes |
|---|---|---|---|
| CPI / Core CPI | FRED `CPIAUCSL` / `CPILFESL` (BLS) | Monthly | Official anchor |
| PCE / Core PCE | FRED `PCEPI` / `PCEPILFE` (BEA) | Monthly | Fed's target measure |
| 10-yr breakeven | FRED `T10YIE` | Daily (since Jan 2003) | Nominal-minus-TIPS spread; publishes via H.15 ~4:15 pm ET; **not revised once published** — gold for determinism |
| 5y5y forward breakeven | FRED `T5YIFR` | Daily | The Fed's preferred long-run market anchor |
| Cleveland Fed inflation nowcasts | clevelandfed.org | Daily, ~10:00 am ET each business day | CPI & PCE, headline + core; monthly/quarterly/YoY outputs. Resilience proof: substituted for the never-released Oct 2025 CPI |
| Cleveland Fed inflation-expectations model | clevelandfed.org / FRED `EXPINF*` | Monthly (on CPI release day) | Horizons 1–30 years; downloadable history to 1982 |

### 6.5 Stress-override candidates (all free)

| Input | ID / Source | Cadence | Notes |
|---|---|---|---|
| **OFR Financial Stress Index** | financialresearch.gov | Daily (data current through 2 business days prior) | 33 variables; five categories (credit, equity valuation, funding, safe assets, volatility); US / other-advanced / EM decomposition; positive = above-average stress; **daily history to Jan 2000** (Mar 19, 2020 peak ≈ 10.3). OFR monitor APIs are open JSON, no registration. **Neutralizes the ICE BofA window problem for backtesting** |
| STLFSI4 | FRED `STLFSI4` | Weekly | 18 series; zero = normal conditions; history to Dec 1993 |
| NFCI (+ risk/credit/leverage subindexes) | FRED `NFCI` (Chicago Fed) | Weekly — Wed 8:30 am ET, through prior Friday | 105 indicators; mean 0 / SD 1 since 1971; positive = tighter than average; **published history revises week to week** (vintage policy applies) |
| HY OAS | FRED `BAMLH0A0HYM2` | Daily | Live signal OK; 3-year window on FRED since Apr 2026; ≈20 pp Dec-2008 / ≈10.9 pp Mar-2020 peaks per full-history sources |
| VIX | FRED `VIXCLS` | Daily close since Jan 1990 | Cboe also publishes the full daily history free (1990–present, updated daily) — belt and suspenders |

### 6.6 Fallback tier (direct federal APIs, free)

- **BLS Public Data API v2** — free registration; up to 20 years of data for up to 50 series per request; 500 queries/day.
- **BEA API** — free registration; programmatic NIPA/GDP/PCE access.
- Rationale: primary-source redundancy. The Oct 2025 CPI episode proves official channels can go dark; fallbacks and nowcasts keep the axes lit.

### 6.7 Market prices (unchanged)

Tiingo (fund NAVs — the Pulse backbone) and FMP Starter remain as-is. Design principle adopted from the ICE BofA episode: **prefer government-computed series on FRED; vendor-hosted series on FRED are restriction-prone.** Equity index levels and fund prices come from our licensed providers.

### 6.8 Confirmed unavailable (no new spend proposed)

- **ISM Manufacturing & Services PMIs** — all 22 series removed from FRED in June 2016; subscription-only at source; a DBnomics mirror exists but production licensing is murky → treat as unavailable.
- **Conference Board LEI** — proprietary.
- Assessment: no real loss. The Fed's own composites (CFNAI breadth, WEI frequency, GDPNow rigor) suit a deterministic engine better and are citable forever.

---

## 7. Proposed decisions — ALL PENDING RATIFICATION

**Stage 1 set:**

1. **Paradigm:** growth × inflation quadrant base + market-stress override. Reject pure business-cycle phases (no deterministic real-time definition), pure risk-on/off (no inflation axis), and statistical regime-switching (probabilistic output; refit instability) as classification frameworks — while harvesting their inputs and evidence bases.
2. **Architecture:** 4 base states + 1 override = **5 regimes**; Stage 2 empowered to split one base cell to reach 6 (stays within the charter's 4–6).
3. **News handling:** classification inputs remain official series + market prices; daily market-price inputs are the sanctioned news channel; whether narration may cite verifiable current events as clearly labeled context is deferred to Stage 5 as an explicit contract clause.
4. **Determinism:** a regime-of-record vintage policy will be specified in Stage 4 (computed from data as published at classification time; stored immutably; recomputations labeled).

**Data-source amendment set:**

5. **Amend the charter's source rule** from the vendor list ("FRED series + market prices") to a quality bar: *published, citable, freely licensed, replayable numeric series from official statistical sources (Federal Reserve System incl. FRED/ALFRED; OFR; BLS; BEA; Treasury; Cboe public index files) plus market prices from licensed providers (Tiingo, FMP).* Same spirit — deterministic, auditable, reproducible — wider aperture.
6. **Adopt ALFRED vintages** as the official backtesting source and the mechanical basis of the regime-of-record policy.
7. **Seed the Stage 3 candidate pool** with: OFR FSI + STLFSI4 (stress); Cleveland daily inflation nowcasts (inflation); GDPNow + WEI (growth); BLS/BEA direct APIs as designated fallbacks.
8. **Design-time freedom clause:** statistical methods may be used offline to calibrate thresholds; production rules ship frozen, citable, and deterministic in `REGIME_SPEC.md`.
9. **Paid-data posture closed:** ISM and Conference Board LEI out of scope; no new subscriptions; monthly budget unchanged (every addition above is free).

---

## 8. Next session — "v8 Data-Source & Pipeline Deep Dive" (commissioned by Robert this session)

Proposed agenda:

1. **Open with ratification** (or amendment) of decisions 1–9 above. No spec text gets written until then.
2. **Exhaustive, Stage-3-grade verification** of the full candidate list: exact series IDs, publication timestamps, revision behavior, license terms, and ALFRED vintage coverage per series.
3. **Resolve flagged unknowns:** Philly Fed ADS Index availability/format; NY Fed nowcast publication status; S&P 500 index licensing/window on FRED vs. sourcing index levels from Tiingo/FMP.
4. **Pipeline re-evaluation:** ingestion scheduler design (cadence per source — NFCI Wednesdays 8:30 ET; Cleveland ~10:00 ET; H.15 ~16:15 ET); where the regime engine lives (server-side TypeScript, v5+ platform pattern); Supabase schema for regime-of-record + stored input vintages; heartbeat/liveness integration (A0 pattern) and admin alerts on ingestion failure; cost check against the $250/mo envelope (expected: unchanged).
5. **Output:** ratified source list + pipeline sketch, feeding Stage 2 (taxonomy) and Stage 3 (indicator spec).

---

## 9. Standing constraints (reaffirmed for Clyde)

- This document authorizes **no build work**. Commit this file only — one file per commit — via Clyde. Never GitHub web upload for docs.
- When the regime engine is eventually built: it is deterministic server-side code, and **the Claude API sits nowhere in the classification path** (narration only, per charter). All existing engine rules stand unchanged: sequential Claude calls with 1.2s delays wherever Claude *is* used; all Claude calls via `/api/claude`; all Supabase calls via `supaFetch()`; no localStorage in engine files.

---

## References (verified July 6, 2026)

- FRED API docs, terms, vintagedates endpoint — https://fred.stlouisfed.org/docs/api/fred/
- ALFRED (archival FRED) — https://alfred.stlouisfed.org
- GDPNow — https://www.atlantafed.org/cqer/research/gdpnow · FRED: `GDPNOW`
- Weekly Economic Index — FRED: `WEI`
- Sahm rule (real-time) — FRED: `SAHMREALTIME`
- NFCI — https://www.chicagofed.org/research/data/nfci/current-data · FRED: `NFCI`
- STLFSI4 — FRED: `STLFSI4`
- OFR Financial Stress Index — https://www.financialresearch.gov/financial-stress-index/
- Cleveland Fed inflation nowcasting — https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting
- Cleveland Fed inflation expectations — https://www.clevelandfed.org/indicators-and-data/inflation-expectations
- Breakevens — FRED: `T10YIE`, `T5YIFR`
- VIX — FRED: `VIXCLS` · https://www.cboe.com/tradable_products/vix/vix_historical_data
- HY OAS — FRED: `BAMLH0A0HYM2` (3-year rolling window since Apr 2026)
- BLS Public Data API — https://www.bls.gov/developers · BEA API — https://apps.bea.gov/api
- ISM removal from FRED (June 2016 notice) — St. Louis Fed Research news
- NBER Business Cycle Dating (procedures, announcement lags) — https://www.nber.org/research/business-cycle-dating
- Investment Clock — Royal London Asset Management (current practice); original Merrill Lynch research (Greetham, 2004)
- Hamilton, J.D. (1989), "A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle," *Econometrica* 57, 357–384
- Fidelity AART — "The Business Cycle Approach to Equity Sector Investing" (fidelity.com research library)
- Record 2022–2024 yield-curve inversion coverage — U.S. Bank market commentary; Wikipedia "Inverted yield curve"; CAIA Portfolio for the Future (2024–2026)

*— End of Session Record 01. Next action: Robert hands this file to Clyde for commit, then opens the Data-Source & Pipeline Deep Dive session.*
