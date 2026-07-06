# Session Record — v8 Second Founding (July 6, 2026)

**Session:** Fabio (design, verification, ratification support), with Clyde executing the docs-only handoff (PR #26). Same-day but separate from the morning A0/PR #23 session, recorded in `SESSION_RECORD_2026-07-06.md`.
**Operator:** Robert. All rulings his.
**Outcome:** `FUNDLENS_V8_CHARTER.md` drafted, ratified, and merged to main the same day. This record preserves the deliberation the charter's §4.2 cites, closing the paper-trail gap identified at ratification.

---

## 1. The commission

Robert issued a clean-whiteboard commission, on the record: remove all prior constraints, design from the evidence alone, and — his words — "deliver the product that you are designing." Authority unchanged by the commission: Fabio designs, Robert ratifies every decision, Clyde builds nothing without a written assignment under Evidence Gate/STOP law (charter §0).

The session began as a verification pass — "Review the FundLens version eight regime specification on the repo, and then let's come back and have a conversation" — over the July 5 founding and Regime Session Record 01. That review surfaced the amendments in §3 below; the conversation that followed became the redesign.

## 2. What was produced and ratified

`FUNDLENS_V8_CHARTER.md` — the second founding — superseding the July 5 `FUNDLENS_V8_FOUNDING.md` in full. Re-derivation, not inheritance: every carried clause was re-tested against one question — does this serve the ~200 TerrAscend plan participants who will trust these numbers?

The headline architectural change: no regime framework wins the engine room by argument. The July 5 quadrant design becomes Contender A in a four-way audition (charter §2.3) — quadrant + stress override, the trend/volatility/stress stack, the blend, and the null hypothesis (a static risk-and-horizon-appropriate mix, annually rebalanced) — under race law: as-published data only, realistic constraints priced in, disqualify-not-validate, Robert rules from published in-repo results. If the null wins, the product ships the null and says so. Whatever wins, the deterministic path is Claude-free forever: Claude narrates the weather; it never determines it.

The ratification mechanic was honored as designed: the charter shipped to Clyde marked DRAFT; Robert's "confirmed" was the ratification; Clyde stamped the status line (`RATIFIED — July 6, 2026, by Robert`) before committing.

## 3. The three July 6 rulings — deliberation preserved

The charter's §4.2 records these as law. This section records why.

### 3a. EODHD — PASSED; the buy-data decision rule (§4.2·9, §5)

Fabio initially put an EODHD subscription (~$20/month) on the table, for WEGRX NAV coverage and CEMEX history depth. Robert challenged the value. On honest re-accounting, Fabio downgraded its own recommendation:

- WEGRX is one factor on one fund, already honestly disclosed as neutral — filling it is nice, not necessary, and conditional on coverage that was never confirmed.
- CEMEX acceleration cut against Robert's own Option C ruling: "too new for us to make an evaluation" was a judgment about the fund, not a complaint about data availability. Buying older data doesn't make a young fund less young, and the gap self-heals at the ~Feb 2027 240-day milestone regardless.
- The redundancy argument was corrected on the record: the VWIGX incident lived in the identifier-resolution path, not NAV fetching, and its permanent fix — never cache transient errors — already ensures a provider outage can't do lasting damage. A second NAV rail would insure against a failure mode the project has never actually suffered.
- The real cost isn't $20. It's a third provider: new integration code, new cache rules, reconciliation logic for when two sources disagree about a NAV, another API key, another vendor whose terms can shift (the ICE BofA lesson applies to EODHD too). House history says every new data rail carries a tax — Finnhub was dropped, and the v7 bugs lived in exactly this kind of plumbing.

Robert's ruling: "Correct. We will pass on EODHD." Two zero-dollar register items stand instead: free-tier reconnaissance (two API calls, no card — WEGRX existence, CEMEX inception depth), banked and touched only on a named trigger; and a WEGRX root-cause session-slice, since a fund missing from every source we hold may be a symbol or share-class mapping quirk fixable for free. The decision rule was made charter law: **buy data when a named computation is blocked, never for insurance.**

The same cost review affirmed the two paid rails (Tiingo, FMP Starter) and produced the §5 register items: confirm no Finnhub billing remains, record both rails' renewal dates, and fix the stale `env.example` comment calling Tiingo a "backup."

### 3b. The ALFRED verifier flag (§4.2·6)

Regime Session Record 01's decision 6 named ALFRED as the backtest source. The July 6 verification pass flagged the over-claim: ALFRED's vintage archive governs FRED-hosted series only. Sources in the candidate pool that publish outside FRED — OFR, Cleveland Fed, Philly Fed, NY Fed — maintain their own revision practices (or none) on their own sites. Decision 6 was amended accordingly: ALFRED governs FRED-hosted series; every non-FRED source requires a documented per-source vintage/replay policy before it may be used in the race. This is what makes race law's "as-published data only" enforceable rather than aspirational, and it is why the §6 harness item lists per-source vintage policies as first-class plumbing.

### 3c. The candidate-pool live verification (§4.2·7)

Rather than trusting the survey's citations at face value, candidate sources were live-verified during the session — existence, cadence, and downloadability checked, not assumed. Verified additions to the Stage 3 pool: Philly Fed ADS Index; NY Fed Staff Nowcast (confirmed relaunched 2023, weekly cadence, downloadable — its earlier suspension is exactly why verification mattered); Fed Board FCI-G; Treasury daily par yield curve; Fed Board GSW zero-coupon curves; and, fund-side, the Ken French factor library (license to be read at adoption). Decision 7 STANDS, EXTENDED with these.

*(Fidelity note: §3a is reconstructed nearly verbatim from the session dialogue; §3b and §3c record the substance and basis of the rulings as ratified — the full dialogue remains in the July 6 Fabio session. Robert reviewed this record before commit.)*

## 4. The docs-only handoff — PR #26

Three one-file commits, per standing law:

1. `ead3b43` — `FUNDLENS_V8_CHARTER.md` added at repo root, status stamped RATIFIED at ratification.
2. `1826fba` — supersession banner atop `FUNDLENS_V8_FOUNDING.md`; banner only, first visible element.
3. `48598c5` — `CLAUDE.md` Authority line rewritten to name the charter as governing law.

Merged same day (`dfac23a`). The Railway deploy it triggered was a no-op — docs only.

The third commit matters beyond housekeeping: CLAUDE.md's Authority line had still named `FUNDLENS_V7_FOUNDING.md`, meaning every Clyde session since July 5 had been reading the wrong constitution. The repair is permanent — the charter governs; both foundings are historical records; every session reads the charter first and cites its principles by section number.

Verification details from the handoff: fund count confirmed at 23 (CEMEX landed as #23 on July 5; the founding's 22 is properly historical). The prior working branch had been consumed by PR #25 (Session Record 01), so PR #26 rode a fresh branch.

## 5. FOUNDING grep — findings and dispositions

Ordered by Robert pre-merge; Clyde ran a repo-wide sweep for `FUNDLENS_V7_FOUNDING` / `FUNDLENS_V8_FOUNDING` and noted results in the PR #26 description. Post-merge, the build-out session re-ran the grep on main, and Robert ruled on the stragglers:

- **Intentional (PR #26 itself):** the CLAUDE.md Authority line; the charter's own Supersedes line; the numbering-lineage line inside the superseded founding.
- **Historical narrative, no action:** `A2_STABILIZATION.md`, `A3_SCORING_INTEGRITY.md`, `A5_SESSION_PLANS.md`, `docs/sessions/SESSION_RECORD_2026-07-05.md` — each references the foundings as the authority of its own era. Dated records need no banner (Robert's July 6 ruling).
- **Session Record 01** (`docs/sessions/v8-regime-session-01.md`): clean — zero references.
- **Repaired by Robert's ruling ("both"), as companion commits to this record:**
  - `README.md` line 5 — "Product direction: `FUNDLENS_V7_FOUNDING.md`" — a live pointer at the repo's front door, two charters behind (flagged as actionable by Clyde in the PR #26 description). Repointed at the charter.
  - `A6_VWIGX_RESIDUAL_RESOLUTION.md` lines 20 and 89 — forward-pointing sentences naming `FUNDLENS_V8_FOUNDING.md` as what governs after A6 closes. True when written; false after supersession. Bracketed supersession notes appended; original sentences untouched.

## 6. Build-out session opened — Opening Evidence Gate

The build-out session's gate ran against main, firsthand: (1) charter line 4 reads `**Status:** RATIFIED — July 6, 2026, by Robert`, verbatim; (2) the founding's supersession banner is the first visible element after the title; (3) CLAUDE.md line 3 names the charter as governing. **PASS, 3/3.** HEAD at verification: `dfac23a`.

## 7. Next

Per charter §6: **A1 — the harness** (ingestion scheduler per source cadence, per-source vintage policies, regime-of-record schema, ALFRED replay plumbing, A0-pattern heartbeat and admin alerts), drafted as the first written assignment of the build-out. Then the race.

---

*— End of record. Committed by Clyde as commit 1 of the build-out docs PR; commits 2–3 execute the §5 repairs above.*
