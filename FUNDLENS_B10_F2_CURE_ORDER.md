# B10-F2 — Micro-Cure: Generate-Route Cooldown
## Status: RATIFIED — August 1, 2026, by Robert · planned by Fabio · to be built by Clyde

Base: `main` at the PR #62 merge (`1136c52`).

**Ruling of record (Robert, August 1, 2026):** the five-minute shared
cooldown on the admin Generate buttons is friction in practice —
"let's get rid of this." This amends ruling 6's letter (generate routes
carried `pipelineRateLimit`). F2's lesson keeps its substance: every
Claude-invoking route still carries a limiter; this order replaces the
five-minute one, it doesn't remove protection.

## Build order (one file, one commit)

- **g0** this order, committed verbatim (rides with g1 as the wave's docs).
- **g1** `src/routes/routes.ts` — new `generateRateLimit`: 30-second
  window, max 1, per user, same shape as the others. Applied to exactly
  three routes, replacing `pipelineRateLimit` there:
  `POST /api/reference-summaries/generate`,
  `POST /api/reference-translations/generate`,
  `POST /api/help-entries/generate`.
  Thirty seconds still swallows an accidental double-click and overlapping
  runs; a deliberate re-click after reading the counts sails through.
  `POST /api/pipeline/run` and `/api/pipeline/retry` keep the five-minute
  `pipelineRateLimit` untouched — the nightly pipeline is the expensive
  machine the original guard was built for.

## Out of scope

Everything else. No client change needed — the panel's cooldown message
just stops appearing in practice.

## Verification (Fabio, post-merge)

Two clicks of a generate button ~40 seconds apart both run; two clicks
inside 30 seconds — second answers the cooldown message. Route pins
re-checked (401 JSON unauthenticated, admin-gated).

*— Drafted by Fabio, August 1, 2026, recording Robert's ruling of the
same date. Fabio, for the record.*
