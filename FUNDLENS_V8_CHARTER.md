# FUNDLENS v8 — CHARTER (Second Founding)

**Drafted:** July 6, 2026 (Fabio, at the operator's commission)
**Status:** RATIFIED — July 6, 2026, by Robert
**Operator:** Robert Coursey — not a developer, browser-only, plain English throughout.
**Repo:** `racoursey-cloud/fundlens-v6` (unchanged) · Railway auto-deploy · Supabase production project v6.
**Supersedes:** `FUNDLENS_V8_FOUNDING.md` (July 5, 2026) in full. That document remains in the repo as historical record under a supersession banner; no term of it governs except where this charter carries it forward by name.

**Numbering, pinned once more:** the repo is v6 (historical), the trust era closed as v7 (tag `v7.0.0`, 22/22, every holding examined), July 5's document opened v8, and this charter re-founds v8 one day into its life. Lineage in one line: **v7 made the data trustworthy; the first v8 founding chose an engine; this founding makes every engine audition.**

---

## §0 — The commission (why a second founding exists)

On July 6, 2026, the operator issued a clean-whiteboard commission, on the record: remove all prior constraints, design from the evidence alone, and — his words — "deliver the product that you are designing." Authority is unchanged by the commission: **Fabio designs, Robert ratifies every decision, Clyde builds nothing without a written assignment under Evidence Gate/STOP law.** This charter is that design.

Where it re-adopts July 5 law, it does so by re-derivation, not inheritance. The test applied to every clause was one question: *does this serve the ~200 TerrAscend plan participants who will trust these numbers?*

---

## §1 — Mission, and the evidence hierarchy that shapes it

> **FundLens gets every participant into the cheapest, healthiest expression of a mix that fits their life — then defends that position from the two forces that quietly eat retirements: fees and fear.**

The design spends its effort in the order the evidence ranks the levers on a participant's *ending balance*, strongest first:

1. **Allocation fit** — being invested at a risk level that matches the horizon of each dollar. The classic catastrophic error is not too much risk; it is decades parked in cash.
2. **Cost** — the most reliable predictor of relative fund performance in the literature, and the one guaranteed number in the building.
3. **Behavior** — the documented gap between fund returns and investor returns, opened by panic-selling bottoms and chasing tops.
4. **Momentum** — real, persistent, modest.
5. **Tactical macro** — the one lever the evidence does not bless. Admitted only as modest tilts, and only if it survives the §2.3 race.

"Maximize return" is deliberately rendered as **maximize outcome**: return sized to when each dollar is needed. That is the product's definition of serving the participant.

---

## §2 — The five pillars

### 2.1 Foundation — the mix fits the life

The first answer the product gives is a durable target mix from the risk slider **anchored by a horizon input** — the single highest-leverage question in the building, and one the July 5 design never asked.

- **Horizon informs; it never overrides.** The risk slider stays sovereign. The tool arms the human; the human decides.
- **Horizon means when-each-dollar-is-needed**, not a single age number. Retirement money is spent across decades; a 62-year-old's 2040s dollars are long-horizon dollars. Copy and math must both reflect this.
- **The catch-up participant enters the charter by name** (operator's-seat lesson, July 6): the participant near retirement who feels behind. The product owes that person the ranked levers in §2.4 — never a shame line, never a lecture, never an assumption that lower risk is automatically right for them.
- Horizon is stored as a profile preference exactly like risk (no balances, no accounts). The **positioning boundary carries forward whole:** FundLens is an informational tool; it never asks for, stores, or infers personal account data. Premium/account-connected concepts remain behind the unheld legal review; the realistic route remains B2B, not user account connections.
- Regime output enters here only as **tilts, not bets** — favored categories at roughly 1.5–2× neutral, scaled by risk — and only from whatever engine survives §2.3.

### 2.2 Vehicle — the strongest evidence picks the fund

Within each slot of the mix: the cheapest adequate, healthiest, behavior-verified expression. This is where the two unrivaled predictors — cost and momentum — do their work, alongside quality.

- The **four-factor machinery carries forward on merit:** Cost Efficiency 25, Holdings Quality 30, Positioning 25, Momentum 20 — with all v7 math (Piotroski-lineage 18-ratio rollup, bond issuerCat path, Grinold guardrail, 4-window vol-adjusted momentum, MAD statistics, §6.3 tiers, Kelly-shaped allocation curve).
- The **vehicle solver:** look-through exposure matched against the target, fee penalties, quality rewards, per-company overlap cap so no underlying name is bought three times through different wrappers.
- **Honesty clause, unchanged:** the recommendation is the best *available* expression, and the app says so when the menu can't reach the target.
- **Pulse verifies behavior:** rolling sensitivity of each fund's daily NAV to the mix's exposures; divergence between claimed composition and observed behavior is flagged before the solver trusts the map. Holdings tell you what a fund IS; only prices tell you what it is DOING.

### 2.3 Weather — the engine auditions for its seat

No framework — not the July 5 quadrant, not Fabio's alternative — gets the engine room by argument. **The first build item is the point-in-time replay harness; the second is the race.**

**The contenders, all deterministic, all on free data:**
- **A — Quadrant + stress override**, exactly as specified by Regime Session Record 01 (Stage 1). Its Stages 2–4 are written as part of race preparation.
- **B — Trend / volatility / stress stack:** time-series trend per asset class (above/below long moving average), volatility-managed exposure scaling (the Barroso–Santa-Clara logic already in our momentum math, applied at the mix level), stress override on top.
- **C — The blend:** quadrant narrates the weather; trend/vol computes the tilts; stress overrides both.
- **D — The null hypothesis:** a static risk-and-horizon-appropriate mix, annually rebalanced, cheapest adequate vehicles, no tilting. **The null runs in the race or the race is dishonest.**

**Race law:**
- As-published data only (§2.5 vintage policy); no contender ever sees a revision before its publication date.
- Realistic constraints priced in: monthly-ish tempo, 401(k) trading restrictions, whipsaw costs stated per contender.
- **Disqualify-not-validate** (operator's amendment, July 5, carried): the replay can prove a rule bad; it can never prove a rule good. Survivors earn shadow mode; shadow mode earns voice.
- Robert rules on the winner from published in-repo results.
- **If the null wins, the product ships the null and says so proudly** — static mix + cost optimization + weather narration is still a product that beats what most participants do today, on levers 1–3 alone.
- Whatever ships, the deterministic path is **Claude-free forever.** Claude narrates the weather in tendency language; it never determines it. The weather report ships regardless of which engine wins, because the narration is the reason 200 people open the app.

### 2.4 Human — behavior is a pillar, not a doctrine

Promoted from the July 5 register to first-class product, because the evidence says this is where the most participant dollars are won, at nearly zero build cost:

- **Drawdown coaching:** when markets fall, the app's job is to talk a scared person *out* of selling the bottom — calmly, with numbers, in Main Street register. The moment this product earns its existence is the Tuesday someone opens it to sell everything and it says: *you don't have to do anything today.*
- **Performance-chasing caution:** the momentum breakout flag lives here — a statistical event ("2.3σ from the pack"), never an endorsement, always with the chasing caution.
- **The match line:** permanent education that an employer match is an instant, guaranteed return no fund on the menu can touch.
- **The catch-up levers page:** for the §2.1 participant, the ranked levers — contribution catch-up provisions (including the ages-60–63 enhanced window where the plan has adopted it), full match capture, fee reduction, claiming-age education for Social Security — presented as education, never advice, **all dollar figures verified at build time against the tax year in force**, zero-shame tone law.
- **Notification doctrine carried whole** (July 5 design): notify on output change, not calendar; four dials (dead band, dwell, Pulse two-key confirmation, cooldown that silences repeats but never escalations); calibrated by point-in-time replay; disqualify-not-validate; shadow mode before voice mode; high-evidence alerts (fees, divergence, menu changes) ship first and earn the channel.

### 2.5 Trust — the law, re-derived

Every clause below was re-tested against the 200-coworker question and survived on its own strength. Good law survives a clean whiteboard.

- **Determinism:** same inputs → same outputs, production rules frozen, citable, in-repo.
- **Regime-of-record vintage policy:** each day's classification computed from data *as published that day*, stored immutably; recomputations on revised data are labeled. The app never relabels its own history.
- **All v7 trust law:** Dossier Contract, 90/95 gate, confidence ladder, resolvable-NAV grading, "estimated" vocabulary, Examined column with the >100% reconciliation (Path 2 as shipped; Path 3 stays banked).
- **Tendency language, never prediction:** the engine classifies present conditions and maps them to what has *historically* tended to work. This clause, more than any disclaimer, is the protection owed to the audience.
- **Main Street register** on every surface; ambient trust lines carried through.

---

## §3 — Carried law (re-endorsed on merit, not inheritance)

- **Cadence law:** company fundamentals move at earnings (30-day FMP cache matches reality); fund structure moves at filings; fund behavior moves daily via NAV — the market performing the weighted rollup exactly, for free. Daily per-holding price fetching for scoring stays rejected; per-holding prices only on-demand for attribution narrative.
- **Classification accuracy program carries whole** (July 5 §5): menu enforcement with the MTNOF trace, canonical vocabulary + synonym map, territory takeover, **benchmark v2 NAV-weighted as the governing metric**, context enrichment if warranted. No ensemble SIC voting — that voter was bad; layering as a class is not (see model policy below).
- **Model policy:** `PROSE_MODEL: 'claude-sonnet-5'` (shipped; thinking on; ceilings 12,000; no temperature-style params). `CLASSIFICATION_MODEL` moves to Sonnet 5 **benchmark-gated** (ship only if industry agreement materially beats Haiku's 53.5–56.0% band; revert is one constant). Frozen Haiku constant stays in `constants.ts`, unreferenced, house style. Intro pricing ends Aug 31, 2026; all cost math assumes standard pricing.
- **LLM layering policy (new):** permitted only *outside* the deterministic path, each behind its own gate — (a) two-pass classification with disagreement-escalation, benchmark-gated; (b) a red-team pass over specs before ratification; (c) a narration judge that grades prose against the Stage 5 contract before it ships. Claude sits nowhere in classification-of-regime or scoring math, ever — replayability is physics, not a capability gap any model version closes.
- **Operating law by reference, all standing:** Evidence Gate (read → state findings → STOP → build), written assignments only, one file per commit, migrations before merges, sequential Claude calls with 1.2s delays (never `Promise.all`), frozen constants including the `TINNGO_KEY` typo, $250/month ceiling, browser-only operator, docs reach the repo only through Clyde commits, session naming Fabio/Clyde.
- **Session law:** half-page opening briefing, plain English, one decision surfaced at a time, close with the scoreboard.

---

## §4 — Disposition of prior instruments (nothing orphaned)

### 4.1 The July 5 founding, section by section
- §1 mission → superseded by this §1.
- §2.1 regime inversion → absorbed into §2.3; "data decides, Claude narrates" survives; *which* data-rule decides is now settled by the race, not by ratification.
- §2.2 Pulse promotion → carried; lives in §2.2/§2.3.
- §2.3 two-decision split → carried whole as the spine of §2.1/§2.2.
- §3 carried-forward list → carried whole into this §2.2/§3.
- §4 model policy → carried into this §3, extended by the layering policy.
- §5 classification program → carried whole into this §3.
- §6 product register → carried and re-homed: Hypothetical Portfolio (§6.1, all terms intact including the $10,000 fixed scenario, session-only adjustment, positioning boundary) → build order; breakout flag → §2.4; per-holding card and attribution-on-demand → build order; industry-level positioning (159-industry menu with before/after acceptance) → carried.
- §7 resolution record → stands permanently as history (v7 close, CEMEX, wrappers, expiry check, consolidations).
- §8 build order → superseded by this §6.
- §9 measurement law → absorbed and extended by this §7.

### 4.2 Regime Session Record 01 (July 6), decisions 1–9
- **1–2 (paradigm, 4+1 architecture): AMENDED.** The paradigm question is decided by the race. The quadrant+override becomes Contender A; its 4–6 state taxonomy governs Contender A's spec and the narration vocabulary for whichever engine wins.
- **3 (news handling): STANDS.** Official series + market prices only; market prices are the sanctioned news channel; narration's use of current events deferred to the Stage 5 contract clause.
- **4 (determinism / regime-of-record): STANDS**, elevated into §2.5.
- **5 (source quality bar): RATIFIED HERE as charter law.** *Published, citable, freely licensed, replayable numeric series from official statistical sources (Federal Reserve System incl. FRED/ALFRED; OFR; BLS; BEA; Treasury; Cboe public index files) plus market prices from licensed providers (Tiingo, FMP).*
- **6 (ALFRED as backtest source): AMENDED** per the July 6 verifier flag — ALFRED governs FRED-hosted series; non-FRED sources (OFR, Cleveland Fed, Philly Fed, NY Fed) each require a documented per-source vintage/replay policy before race use.
- **7 (Stage 3 candidate pool): STANDS, EXTENDED** with the July 6 live-verified additions — Philly Fed ADS Index, NY Fed Staff Nowcast (relaunched 2023, weekly, downloadable), Fed Board FCI-G, Treasury daily par yield curve, Fed Board GSW zero-coupon curves — plus, fund-side, the Ken French factor library (license read at adoption).
- **8 (design-time freedom): STANDS.** Offline statistical methods calibrate; production ships frozen and citable.
- **9 (paid-data posture): STANDS, EXTENDED** by the July 6 EODHD ruling: **PASSED.** Decision rule now charter law: *buy data when a named computation is blocked, never for insurance.* Zero-dollar register items: EODHD free-tier reconnaissance (two calls: WEGRX existence, CEMEX depth) banked and touched only on a named trigger; a WEGRX root-cause session-slice, since a fund missing from every source we hold may be a mapping quirk fixable for free.

---

## §5 — Data law: two houses

- **The regime house is free forever.** Load-bearing: OFR FSI, Core PCE/CPI, CFNAI, ALFRED vintages. Timeliness: Sahm (real-time series), breakevens (never revised — gold for determinism), GDPNow, Cleveland daily nowcasts. Confirmation: HY OAS (live duty only; 3-year FRED window), VIX (Cboe full history as backstop), NFCI (vintage-handled), WEI, yield curves (an input, never a sole trigger). Insurance: ADS, NY Fed Nowcast, STLFSI4, FCI-G, Cleveland expectations, BLS/BEA direct APIs. Design principle from the ICE BofA episode: prefer government-computed series; vendor-hosted series on FRED are restriction-prone.
- **The fund house is two paid rails, both affirmed July 6:** **Tiingo** (the NAV backbone — momentum, Pulse, CEMEX rides it alone) and **FMP Starter** (fundamentals behind Holdings Quality, the classification reference, part of the fee path). Free: EDGAR (NPORT-P, N-MFP), OpenFIGI, FRED.
- **Register items from the July 6 cost review:** confirm no Finnhub billing remains (code runs on its free tier with a static-map fallback); record both paid rails' renewal dates; fix the stale `env.example` comment calling Tiingo a "backup."

---

## §6 — Proposed build order (skeleton only — the assignment build-out session details, numbers, and sequences it)

1. **The harness** — ingestion scheduler per source cadence, per-source vintage policies, regime-of-record schema, ALFRED replay plumbing, A0-pattern heartbeat and admin alerts.
2. **The race** — write Contender A's Stages 2–4 plus B/C/D specs deterministically; run 30+ years as-published; publish results in-repo; Robert rules.
3. **The mix** — horizon input, category taxonomy over the 23 funds, risk scaling, winner's tilts (MM funds join here: Cash & Equivalents from the mix, N-MFP yield contest, per July 5 register).
4. **Classification, solver-grade** — rungs 1–3, Sonnet 5 gate, benchmark v2.
5. **The vehicle solver** — look-through matching, penalties, overlap cap, honesty output.
6. **Pulse** — sensitivity betas against the winner's exposures, divergence flags, breakout flag.
7. **The two-answer UI** — mix and vehicle as two answers, trust lines throughout.
8. **The human layer** — coaching, cautions, catch-up page, notifications in shadow. *The education pages are cheap static content and may ride any earlier assignment.*
9. **Hypothetical Portfolio** (all July 5 terms intact).
10. **Per-holding card + attribution on demand.**

Sequencing after the race may be re-ordered by what wins. July 12 expiry check and the ~Feb 2027 CEMEX 240-day milestone ride whichever sessions those dates hit.

---

## §7 — Measurement law

Every accuracy or improvement claim carries a gate: the race under §2.3 race law for the engine; benchmark harness (name-weighted) and benchmark v2 (NAV-weighted) for classification; before/after for industry-level positioning; divergence-flag precision on real cases for Pulse; replay calibration then shadow mode for notifications; the ear test for all prose. **Fix, re-measure, fix, re-measure.** If a rung underdelivers, the harness says so and escalation happens with evidence, not optimism. The replay proves rules bad, never good — trust is earned forward.

---

*Session law reminder for every future session: half-page opening briefing, plain English, one decision surfaced at a time, close with the scoreboard.*

*— End of charter. v7 proved the process ships. This document is the process pointed at the best product the evidence can defend.*
