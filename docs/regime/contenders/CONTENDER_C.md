# CONTENDER C — The Blend (Quadrant Narrates, Trend/Vol Computes, Stress Overrides Both)

**Authority:** `A2_THE_RACE.md` Task 3; charter §2.3 ("quadrant narrates the weather; trend/vol computes the tilts; stress overrides both"). Obeys `RACE_RULES.md` **as frozen at blob `ea44a7dc0cdcf473035528849234b39258c39f4a`** (commit `e546da7`). Composes Contender A **as frozen at blob `08bbdc363aabb5a14c6a49e24a1b9db045c55268`** (commit `6f2574a`) and Contender B as ratified at S4 (B's blob anchor is pinned into this file by the S4 freeze amendment — it cannot be cited before it exists).
**Status:** DRAFTED for STOP S4 (ratified together with B and D; Fabio rules under the Delegation ruling, Robert's veto standing). Upon ratification this file is frozen and its SHA-256 content hash becomes `rules_version` on every row Contender C writes. C's completeness inherits B's: it is not complete until B's §4.4 verification table reads VERIFIED throughout.
**Plain-English shape:** A tells the story, B moves the money, and the shared storm warning silences both. Every rule below is a citation into A or B; the only original text in this file is the composition law itself.

---

## §1 — The composition law (all the machinery there is)

**Written strictly as a composition of A's and B's ratified pieces — no new machinery** (Task 3 order). C introduces **zero** new inputs, thresholds, numbers, dwell rules, or readers.

1. **The label (quadrant narrates):** C's `regime_label` on every date is Contender A's label, computed by A §§3.0–3.2 and 3.4–3.7 verbatim — the same five values (`recovery` / `overheat` / `stagflation` / `slowdown` / `stress`), which keeps C inside the ratified narration vocabulary (charter §4.2·2) with no mapping question.
2. **The tilt (trend/vol computes):** C's race-scoped equity weight on every date is Contender B's — B's base-state machine (B §§3.0–3.2, 3.4–3.5) resolving through B's tilt ladder (B §3.8).
3. **The storm (stress overrides both):** A and B share one override definition by construction (B §3.3 adopts A §3.3 by anchor). When it is active, C's label is `stress` and C's weight is the ladder floor (30%) — one detector, one behavior, no reconciliation to invent.

## §2 — Inputs, honest start, coverage (derived, not chosen)

- **Inputs:** the union of A's §2 and B's §2 — nothing added, nothing removed. F3 is inherited and stated: `BAMLH0A0HYM2` appears nowhere in Leg 1 (RACE_RULES §5).
- **Honest start: 2011-05-31, expected first classifiable grid date 2011-05-31** — the later of A's 2011-05-31 (CFNAI, the binding constraint) and B's 1990-01-02, per RACE_RULES §1; conditional on B's §4.4 print, as B is. Deeper history appears in Leg 2 only, labeled.
- **Coverage:** a grid date is classifiable for C **only when both parents classify it**. If either parent is unclassifiable, C is unclassifiable and the date counts against C's coverage (RACE_RULES §6 metric 4) — C's coverage is the intersection and can never exceed either parent's. *Alternative — a partial blend (label without tilt, or a neutral fallback weight) — stated and declined: it invents machinery, and half a blend is a different contender.*

## §3 — Empty as-of reads (stated per the Task 3 order)

Inherited whole: an empty or insufficient read that makes A's date unclassifiable (A §3.6–3.7) or B's date unclassifiable (B §3.6–3.7) makes C's date unclassifiable — never defaulted, never carried silently. Confirmatory-input emptiness and the VIX-holiday rule behave exactly as in the parent specs. No new cases exist because C reads nothing its parents don't.

## §4 — Accounting under the constraint model (RACE_RULES §3, §6)

- **Switch costs follow dollars:** costs are charged on changes in C's executed *weight* (B-driven, and storm entries/exits), per RACE_RULES §3. A label change with no weight change (A's quadrant turns while B's ladder rung holds) moves no dollars and costs nothing — it is narration.
- **Stability (metric 2) is reported on both faces:** label dwell/flap under A's dwell law, weight dwell/flap under B's dwell law. C inherits both parents' flap suppression by construction and adds none of its own.
- **One honest asymmetry, stated:** C can change its story without moving money and move money without changing its story. That is the blend's design (charter §2.3), not a defect; RACE_RESULTS narrates both series so the S6 ruling sees it plainly.

## §5 — Determinism notes

- C is a pure function of its parents' evaluations on the same date: same as-of reads → same label, same weight. No wall-clock reads; `inputs` jsonb cites every value used by either parent, each with its vintage date ≤ the classification date in Leg 1 (RACE_RULES §8).
- Any post-S4 change to A's or B's frozen text is a new `rules_version` for C as well — C's hash binds the composition, and the composition cites its parents by anchor.

## §6 — RACE_RULES conflict check (recorded per the Task 3 order)

**No conflict.** C adds no inputs, so the envelope analysis (RACE_RULES §4), the F3 exclusion (§5), the grid and tempo (§2 as amended), and the constraint model (§3) are satisfied exactly as its parents satisfy them; C's only original clause — the intersection coverage rule — is RACE_RULES §1's empty-read law applied to a two-parent contender, and its channel dependence on B's §4.3 registry proposal rides the ruling S4 makes there.

---

*Drafted July 10, 2026 by Clyde for STOP S4. Frozen only upon Fabio's ruling, Robert's veto standing — B's blob anchor to be pinned here at the freeze.*
