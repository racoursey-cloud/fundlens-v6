# FUNDLENS v8 — FOUNDING DOCUMENT

> **⚠️ SUPERSEDED — July 6, 2026, by `FUNDLENS_V8_CHARTER.md` (the second founding), by Robert's ratification. Retained as historical record; no term below governs except where the new charter carries it forward by name.**

**Drafted:** July 5, 2026 (Fable, from the July 5 strategy session)
**Status:** RATIFIED — July 5, 2026, by Robert. Amended same day, pre-commit, to reconcile §1 and §7 with the v7 close (A6 completed, 22/22, tag `v7.0.0`, branch `v7-stable`). No ratified term was changed; the amendment is factual reconciliation only.
**Operator:** Robert Coursey — not a developer, browser-only, plain English throughout.
**Repo:** `racoursey-cloud/fundlens-v6` (unchanged) · Railway auto-deploy · Supabase production project v6.

**Numbering, pinned once:** the repo is named v6 (historical), the trust-era charter is `FUNDLENS_V7_FOUNDING.md`, and this document opens **v8**. Three names, one product, lineage recorded here so no future session wonders.

---

## §1 — Mission

> **Every day, FundLens reads what the moment favors and what your funds are doing, and shows you the best expression of that moment your plan's menu allows — cheapest and healthiest vehicles first, honest about what it can't reach.**

v7's mission was to make the data trustworthy and complete. It is accomplished and discharged: as of the July 5, 2026 3:52 PM run, every holding of every fund is examined (10,135 across 22 funds), **22/22 funds pass the 90/95 gate** (A6 closed the VWIGX residual — PRs #14/#15), and every number carries a confidence disclosure. The v7 endpoint is permanently marked: tag `v7.0.0`, branch `v7-stable`, commit `c7cae34`. v8's mission is different: **change who decides and what question gets answered.**

---

## §2 — The three structural changes

### 2.1 The regime inversion: data decides, Claude narrates
Today the thesis is LLM-generated: Claude reads news and emits sector scores. v8 inverts this. The **regime** is computed from observable series — growth and inflation direction from FRED, risk appetite and rate trend from market prices (Tiingo/FMP, already paid for) — using the standard four-quadrant growth × inflation framework. Claude's role becomes translation: turning the computed regime into Main Street prose. Every score gets a data pedigree; the regime is reproducible run to run; it updates daily instead of when a thesis regenerates.

*Rationale:* tactical macro is the one factor the evidence does not bless. If it exists at all, it must be transparent, reproducible, and cheap to audit — an opinion-grade LLM thesis is none of those; a computed regime with an LLM narrator is all three.

### 2.2 Pulse is promoted: returns-based analysis becomes a first-class instrument
NPORT-P holdings are quarterly with up to 60-day lag — **holdings tell you what a fund IS; only prices tell you what it is DOING.** The Pulse layer (planned as verification-only in v7's A11) is promoted to a headline instrument: vol-adjusted momentum, plus rolling sensitivity of each fund's daily NAV to the regime's favored exposures. Divergence between claimed composition and observed behavior is flagged before the solver trusts the map — Pulse is a continuously running misclassification alarm as well as the system's only truly current signal.

### 2.3 The two-decision split: allocation, then selection
One ranked list across 22 funds quietly answers two questions at once. v8 separates them:
- **The mix:** given the regime and the user's risk setting, how much belongs in each category (US equity, international, bonds, real assets, cash). Regime targets are expressed as **tilts, not bets** — favored exposures at roughly 1.5–2× neutral weight, scaled by risk.
- **The vehicle:** within each slot, which fund is the best expression — decided by fees, holdings quality, and Pulse-verified behavior. A small solver picks the fund combination whose **look-through exposure** best matches the target, penalizing fees, rewarding quality, and capping per-company overlap so no underlying name is bought three times through different wrappers.
- **Honesty clause:** the recommendation is the best *available* expression. When the menu cannot reach the target, the app says so ("the moment favors semiconductors; your plan's best expression reaches 8.5%").

*Stability requirement:* the regime framework is deliberately coarse so the recommendation evolves over weeks, punctuated by rare clear turns — a lighthouse, not a day-trader. Most days, today's mix equals yesterday's.

---

## §3 — What carries forward unchanged

The July 5 clean-slate review validated most of the machine. These carry into v8 untouched and are not to be re-litigated:
- **Cost Efficiency** (fund-level, strongest evidence in the literature).
- **Momentum math** (4-window blend, Barroso & Santa-Clara vol adjustment, cross-sectional z + CDF). Fund-level NAV is the right altitude — per-holding look-through momentum is rejected.
- **Holdings Quality** (Piotroski-lineage 18-ratio rollup, bond issuerCat path, Grinold coverage scaling retained as guardrail for the residual).
- **Kelly-shaped continuous risk allocation** (1–7, e^(k·z) weighting, de minimis sweep) — reused by the vehicle solver.
- **MAD-based robust statistics** and the §6.3 tier thresholds.
- **All v7 trust law:** the Dossier contract, 90/95 gate, confidence ladder, resolvable-NAV grading, "estimated" vocabulary (Decision 2, ratified July 5 from measured 87.8% sector / 56.0% industry agreement), Examined column, Main Street register.
- **All operating law by reference:** Evidence Gate, STOP tasks, one file per commit, migrations before merges, sequential Claude calls with mandated delays (never `Promise.all`), frozen constants including the `TINNGO_KEY` typo, budget ceiling $250/month, browser-only operator.

**Cadence law (name it once, cite it forever):** company fundamentals move at earnings (~quarterly) — the 30-day FMP cache matches reality, not laziness. Fund structure moves at filings (quarterly + lag). Fund behavior moves daily via NAV, which is the market performing the weighted per-holding rollup exactly, for free. Daily per-holding price fetching for scoring is rejected; per-holding prices are permitted only on-demand for attribution narrative (§6.4).

---

## §4 — Model policy (ratified July 5, 2026)

- **`PROSE_MODEL: 'claude-sonnet-5'`** — all user-facing prose (thesis→regime narration, fund summaries, Investment Brief). Shipped in A5. Thinking on; ceilings 12,000; no temperature-style params (Sonnet 5 rejects them).
- **`CLASSIFICATION_MODEL` moves Haiku → Sonnet 5** (Robert, July 5: "replace Haiku with Sonnet 5"). Cost verified affordable: a complete ~4,000-name universe pass ≈ 160 batched calls ≈ **$2–3**, trivial at cache cadence. Same batching, same 1.2 s sequential delays, same prompts initially.
  - **Acceptance gate:** re-run the Task 7 benchmark harness (same 400-name out-of-sample method) with Sonnet 5. Ship if industry-level agreement materially beats Haiku's 53.5–56.0% band; revert is one constant if it doesn't. The measured number is recorded here when known.
  - The frozen Haiku constant remains in `constants.ts`, merely unreferenced (house style, as with `THESIS_MODEL`/`BRIEF_MODEL`).
- Intro pricing ends Aug 31, 2026 ($2/$10 → $3/$15 per MTok); all cost figures above assume standard pricing to avoid September surprises.

---

## §5 — The classification accuracy program

Classification is promoted from "one factor's input" to **the instrument the vehicle solver runs on.** The July 5 benchmark (two stable samples: 87.8/86.0% sector, 56.0/53.5% industry vs FMP reference) decomposed the disagreement into four slices, each with its own remedy — **no ensemble voting; SIC third-voter is rejected** (US-only coverage, 1980s taxonomy; it recuses itself from the international names where the disputes live).

1. **Menu enforcement (bug fix, v7-A6):** 14 of 56 sector disagreements were off-menu emissions stored anyway ("Precious Metals" ×10, "Other" ×3, "Fixed Income" ×1). Enforce the 11-sector menu at validation with retry-then-map. Free ~3–4 points of sector agreement. The lone "Fixed Income" on a telecom (MTNOF) must be traced — it matches the A3 cache-poisoning signature; rule out a regression.
2. **Canonical vocabulary + synonym map (v7-A6):** near-synonym labels ("Banks" family, "Entertainment" vs "Media & Entertainment") counted as disagreements. One canonical menu, alias table applied at storage. **Principle: for scoring, consistency matters as much as correctness** — genuine ontological disputes (Weyerhaeuser: Materials vs Real Estate) are settled by ruling, recorded, applied everywhere, disclosed.
3. **Territory takeover (v7-A6):** every residual holding FMP resolves is an **accuracy** upgrade, not provenance — at ~56% industry agreement, roughly four in ten model tags are wrong at fine grain (anchored in A5_SESSION_PLANS.md, Task 6).
4. **Benchmark v2 — NAV-weighted (v8):** measure disagreement in portfolio weight, not name count. Disputes concentrate in small foreign tail positions; the weight-weighted number governs how much further to invest. **This is the program's governing metric.**
5. **Model upgrade (§4):** Sonnet 5 on classification, benchmark-gated.
6. **Context enrichment (v8, if the weighted number still warrants):** classify with country, fund mandate, and resolved identifiers in the prompt, not the bare name.

FMP is the reference, not gospel — the benchmark email proves it errs (global banks tagged "Regional"; Shopify in Technology). Trust-surface vocabulary stays conservative ("estimated") regardless of measured gains.

---

## §6 — Ratified product decisions carried into the v8 register

1. **Hypothetical Portfolio + blended cost comparison** (ratified July 5): allocation percentages only, from the plan menu. Costs illustrated against a **$10,000 fixed scenario amount on both sides** (hypothetical mix vs recommendation). User may adjust the scenario amount **for the session only** — client-side, never persisted or transmitted, never an input to scoring (recommendations identical for all users). No balance inputs anywhere; no account connections; hypothetical/conditional language on every surface; nullable expense ratios disclosed per Principle 1. Positioning boundary (HR posture): FundLens is an informational tool; it never asks for, stores, or infers personal account data. Premium/account-connected concepts live behind a legal review that has not happened; the realistic route is B2B partnership, not user account connections (PCS has no public API; recordkeeper APIs are partner-gated).
2. **Breakout flag** (momentum-specific): the §6.3 tier machinery grades the composite, so a PRPFX-style asset-class run can be diluted invisible. Add a momentum-only modified-z outlier flag at the existing research-grade thresholds, worded as a **statistical event** ("this fund's recent run is a statistical outlier — 2.3σ from the pack"), never an endorsement, with a performance-chasing caution. (Ledger note: "Breakaway" was renamed "Top Pick" in Session 21 — statistical language returns for this flag.)
3. **Per-holding card:** drill-down shows each company's quality score and regime alignment side by side — the "onion" made visible — while the composite math stays separable (fused per-holding quality×positioning is rejected: it breaks user weight sliders and Main Street explainability).
4. **Attribution on demand:** "your fund rose 2% this week; NVIDIA drove 1.4 points" — narrative for the drill-down, never scoring input. Top-movers prices fetched on card open only.
5. **Industry-level positioning:** regime fit computed against the 159-industry menu, not 11 sectors, with before/after comparison as acceptance.

---

## §7 — Bridge from v7: resolution record (amended at v7 close, July 5, 2026)

This section originally listed work owed under the v7 charter. History resolved it the same day; the record below supersedes the original list so the charter never contradicts the repo.

- **Task 6 residual report + Task 7 write-up — DELIBERATELY RETIRED** by Robert's decision, July 5 (record: `A6_VWIGX_RESIDUAL_RESOLUTION.md`, on main). The benchmark numbers they would have memorialized are preserved there and in §4/§5 here. Do not go looking for these reports.
- **VWIGX residual — RESOLVED** (v7 A6, PRs #14/#15): eleven identifier-bearing rows were frozen by a 40-second API outage cached as permanent verdicts; all resolved on first fresh attempt after the cache purge. Permanent fix merged: transient lookup errors are never cached; negatives expire after 7 days. Final state 22/22. VFWAX improved to 96.7% as a side effect.
- **Carried into v8 (orphaned by the narrow A6; formally re-homed here):**
  - Classification rungs 1–3 (§5: menu enforcement incl. the MTNOF trace, canonical vocabulary + synonym map, territory takeover) → fold into **v8 A3**.
  - The July 5 stabilization pile → its own early v8 assignment (may precede or ride alongside A1): email deliverability check inside `/api/monitor/health`; benchmark success log gated on actual send (`sendAdminAlert` returns a boolean); failed alerts log their subject; benchmark completion visible in the UI; heartbeat-based staleness replacing the 120-minute wall-clock test.
- **Alert email infrastructure — DONE** (July 5): Resend domain `updates.fundlens.app` verified; sender `alerts@updates.fundlens.app`; first successful delivery 2:45 PM July 5 — the first email FundLens ever delivered.
- **Register additions banked at the v7 close (July 5 evening), for placement in the A-series:**
  - **CEMEX onboarding (Fund #23):** Cullen Emerging Markets High Dividend R6, Nasdaq, ER 0.90%, Cullen Funds Trust filer. One registry row + one run — the standing scalability test. Gotchas on record: ticker collision with the cement company (CX ADR) — verify FMP/Tiingo map to the mutual fund; R6 class launched 2025, short NAV history — confirm honest `momentum_eligible` handling.
  - **Wrapper look-through (the five GGA/Alta Trust CITs, QIO*Q):** excluded from the universe today; banked as a v8 feature with evidence appendix `WRAPPER_LOOKTHROUGH_EVIDENCE.md` (template parsed, underlying census mapped, open questions listed). Fact-sheet-sourced fund type, lower confidence rung, "estimated" vocabulary.
  - **Admin trigger-button consolidation:** three buttons → two (header + Pipeline tab), one label ("Refresh Analysis"), retire the Settings duplicate; overlay/status asymmetry between trigger points noted July 5. UI-only.
  - **A6 expiry-mechanism check:** first run after July 12, confirm the three private-company negatives (Flipkart ×2, Brandtech) carry fresh `cusip_cache` dates — the 7-day TTL visibly working. One line in that session's evidence.

## §8 — Proposed v8 build order (A-numbering restarts per charter precedent; every task under Evidence Gate/STOP law)

- **A1 — Regime engine:** FRED + market-price quadrant computation, regime record persisted with inputs and date, Claude narration layer. Acceptance: identical inputs → identical regime; narration passes the ear test.
- **A2 — Pulse:** rolling regime-sensitivity betas per fund from daily NAVs; divergence flags (claimed composition vs observed behavior); momentum breakout flag (§6.2) rides here.
- **A3 — Classification, solver-grade:** Sonnet 5 swap + benchmark gate (§4); benchmark v2 NAV-weighted (§5.4); context enrichment if warranted.
- **A4 — The mix:** category taxonomy over the 22 funds, regime-tilted target profile, risk-slider scaling. Scores remain universal; the mix is personal.
- **A5 — The vehicle solver:** look-through matching against the target, fee/quality penalties, per-company overlap cap (this is the A12 overlap detector's real job), honesty clause output.
- **A6 — The two-decision UI:** mix and vehicle presented as two answers; ambient trust lines carried through; Main Street register throughout.
- **A7 — Hypothetical Portfolio** (§6.1, one to two sessions).
- **A8 — Per-holding card + attribution** (§6.3–6.4).
- **A9+ — Explorer upgrades** inherited from v7's A12+ as the register dictates.

## §9 — Measurement law

Every accuracy or improvement claim in this charter carries a gate: the Task 7 harness (name-weighted) and benchmark v2 (NAV-weighted) for classification; before/after comparison for industry-level positioning; reproducibility for the regime; divergence-flag precision for Pulse (reviewed on real cases); the ear test for all prose. **Fix, re-measure, fix, re-measure.** If a rung underdelivers, the harness says so and escalation happens with evidence, not optimism.

---

*Session law reminder for every future session: half-page opening briefing, plain English, one decision surfaced at a time, close with the scoreboard.*
