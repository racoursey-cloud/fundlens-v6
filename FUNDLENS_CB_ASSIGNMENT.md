# CB — Classifier Seat: Measure Haiku vs. Sonnet vs. Opus
## Status: RATIFIED — August 1, 2026, by Robert (decision rule ratified as drafted) · planned by Fabio · to be built by Clyde

Base: `main` at the current head (post-B10-F1; F2 may land before or after
— no file overlap except routes.ts, which Clyde sequences).

**What this wave is:** evidence-gathering plus one label cure. It does NOT
change the production classifier. The seat itself is ruled in a later
order, on the numbers this wave produces — the same measure-then-rule path
the Help chat seat followed, and the path v8 A3 already anticipated when
it kept the benchmark harness alive for a "Sonnet 5 acceptance gate."

## 1. Rulings of record (Robert, August 1, 2026)

1. The classifier seat (currently Haiku, `CLAUDE.CLASSIFICATION_MODEL`)
   is open for evaluation against Sonnet 5 and Opus 5, decided by
   measured out-of-sample agreement, not by price — at cached-classifier
   volumes even Opus is immaterial cost.
2. Voice law application: the admin data-quality provenance label
   "Haiku n%" becomes "AI-classified n%" (ruling 9 reaches admin
   surfaces; the operator himself had to ask what it meant).

## 2. Standing laws (restated)

- The hard rule stands: production model constants and Claude call
  patterns are untouched. cb1's optional parameter is explicitly
  authorized by this order, defaults to the frozen constant, and changes
  no production call path — sequential batching and delays inherited
  unchanged.
- One file per commit; commit messages cite task numbers; Evidence Gate
  first.
- Benchmark runs are admin-triggered, one at a time (the existing
  `benchmarkRunning` guard), reports emailed to Robert per the
  admin-alert path.

## 3. Build order (one file per commit, dependency order)

- **cb0** `FUNDLENS_CB_ASSIGNMENT.md` — this order, committed verbatim.
- **cb1** `src/engine/classify.ts` — `classifyHoldingSectors` and
  `classifyHoldingIndustries` gain an optional `modelOverride` parameter,
  default `CLAUDE.CLASSIFICATION_MODEL`. Every production caller passes
  nothing and is byte-equivalent in behavior. Batching, sequencing, and
  delays untouched.
- **cb2** `src/engine/benchmark.ts` — accepts a model choice, threads it
  to cb1, and stamps the model into the report subject, body, and the
  status record, so three emailed reports are unambiguous side by side.
  The model menu is a local map in this file (constants.ts is frozen):
  `haiku → CLAUDE.CLASSIFICATION_MODEL` · `sonnet → CLAUDE.PROSE_MODEL`
  · `opus → 'claude-opus-5'`.
- **cb3** `src/routes/routes.ts` — `POST /api/benchmark/classification`
  accepts `?model=haiku|sonnet|opus` (allowlist only; anything else is a
  400), default haiku. Admin gating and one-run guard unchanged.
- **cb4** `client/src/pages/Pipeline.tsx` —
  (a) the benchmark control gains a three-way model picker
  (Haiku · Sonnet · Opus) feeding the query param, with the running/last
  status showing which model ran;
  (b) ruling 2's label cure: the data-quality provenance line renders
  "AI-classified n%" in place of "Haiku n%".

## 4. The evaluation protocol (after merge — Robert clicks, Fabio reads)

1. Robert runs the benchmark three times from the Pipeline page — Haiku,
   Sonnet, Opus — same sample size (default 400), one at a time. Three
   reports land in his inbox; the harness samples FMP-labeled equities
   the production classifier never touched, so all three models face the
   same out-of-sample test against the same ground truth.
2. Fabio compiles the three reports into one comparison: sector-level
   agreement, industry-level (159-menu) agreement, disagreement lists,
   and cost-per-thousand-holdings at current prices.
3. **Pre-agreed decision rule (ratify or edit):** a challenger takes the
   seat only if it beats Haiku's industry-level agreement by at least
   3 percentage points without regressing sector-level agreement. Ties
   or near-ties keep Haiku — doing nothing is always on the ballot. If a
   swap wins, a separate one-commit order changes
   `CLAUDE.CLASSIFICATION_MODEL` (the explicit assignment the hard rule
   requires), with Robert's separate call on a one-time cache
   reclassification so all tags share one provenance.

## 5. Out of scope

The production classifier seat (this wave only measures); constants.ts;
any reference-tier surface (the provenance line is admin-only and the
reference allowlist carries no industry-provenance fields); the Help
chat seat (ruled in B10, unchanged).

## 6. Cost ceiling

Three benchmark runs ≈ 1,200 batched classifications total: well under
$5 across all three models at current prices.

*— Drafted by Fabio, August 1, 2026, for Robert's ratification.
Measure, don't assume — the harness was kept for exactly this.
Fabio, for the record.*
