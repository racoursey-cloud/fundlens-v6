# CB-S — The Classifier Seat Swap: Opus Takes the Chair
## Status: RATIFIED — August 1, 2026, by Robert (rulings 1–5, decision rule and evidence of record attached) · planned by Fabio · to be built by Clyde

Base: `main` at the PR #64 merge (post-CB).

## 1. Rulings of record (Robert, August 1, 2026)

1. **The seat: Opus** (`claude-opus-5`), per the ratified CB decision rule
   and the compiled evidence (`FUNDLENS_CB_COMPARISON.md`): industry
   agreement +18.2 points over Haiku, sector +5.5, zero parser artifacts
   in 400. Ruled on the numbers, rule set before any number was seen.
2. **One-time reclassification: approved** (~$10 ceiling). Cached
   model-sourced tags are cleared and rebuilt on the Opus seat so all AI
   provenance is uniform and Haiku's cached howlers (Sankyo→Apparel,
   Discovery Ltd→Broadcasting, DCC→Food Distribution) are purged.
   FMP-sourced tags are never touched.
3. **The constant split: confirmed.** Classification gets its own seat
   constant. `CLASSIFICATION_MODEL` itself stays defined and unchanged —
   after this wave it remains the benchmark's Haiku control.
4. **The Help chats move to Opus (Robert, August 1, same session):**
   both the reference Help chat (B10, currently Sonnet) and the legacy
   full-tier Help chat (Session 12, currently Haiku) take the Opus 5
   seat, via one shared new constant. This supersedes the B10 ruling 9
   model-seat note (the eval stands as evidence of record; the operator
   rules Opus) and this order's earlier stays-on-Haiku posture for the
   legacy chat. The eval's one caution on Opus — answer length — is
   cured proactively rather than monitored reactively: ruling 5.
   NOT moved by this ruling:
   `PROSE_MODEL` and its consumers — the B9 translation engine and the
   B10 corpus drafting stay on Sonnet; re-pointing PROSE_MODEL itself
   would have re-seated them silently, the same side effect ruling 3's
   split exists to prevent.
5. **Smart Brevity in the Help prompts (Robert, August 1):** as part of
   the move to Opus, both Help chat prompts instruct the model in Smart
   Brevity — answer first, tight length targets, no preamble or
   postamble — as the standing cure for Opus's one eval weakness,
   length inflation. Where Smart Brevity's structured form conflicts
   with the app's voice law (bullets in chat replies), the voice law
   wins: brevity is delivered in prose.

## 2. Standing laws (restated)

- This order IS the explicit assignment the frozen-constants law
  requires; s1 is authorized precisely and nothing else in constants.ts
  moves. Call patterns — batching, sequential, 1.2s delays — untouched.
- One file per commit; Evidence Gate first: Clyde reads every consumer
  of `CLAUDE.CLASSIFICATION_MODEL` and states findings before writing,
  confirming the split touches classification and benchmark only.
- The reclassification is a data operation, run with Database-law
  ceremony even though it is not DDL: exact SQL presented in-session,
  Robert types approval, executed for him, verified read-only, counts
  on the record.

## 3. Build order (one file per commit, dependency order)

- **s0** `FUNDLENS_CB_S_SWAP_ORDER.md` — this order, committed verbatim
  (with `FUNDLENS_CB_COMPARISON.md` as **s0b**, the evidence of record).
- **s1** `src/engine/constants.ts` — exactly two additions, both
  authorized by this order and nothing else moves:
  `export const CLASSIFIER_MODEL = 'claude-opus-5';` (ruling 1; comment
  cites the CB evidence) and
  `export const HELP_CHAT_MODEL = 'claude-opus-5';` (ruling 4; comment
  cites the operator ruling and notes PROSE_MODEL deliberately not
  moved). `CLASSIFICATION_MODEL` remains defined as the benchmark's
  Haiku control.
- **s2** `src/engine/classify.ts` — the two classification functions
  default their `modelOverride` to `CLAUDE.CLASSIFIER_MODEL`; a log line
  at batch start names the model in use (so every pipeline run's seat is
  evident in the logs forever). Production callers still pass nothing.
- **s3** `src/engine/benchmark.ts` + the route default — the model
  menu's `opus` entry points at `CLAUDE.CLASSIFIER_MODEL` (single source
  of truth), and **the benchmark's default model becomes `opus`** — an
  unpicked benchmark click measures the model actually in production
  (Robert's correction at ratification, August 1). `haiku` stays in the
  menu as the historical control for future head-to-heads; it is an
  option, never a standard. (The one-line route-default change rides in
  the same commit's routes.ts counterpart if needed — Clyde sequences,
  one file per commit.)
- **s4** `FOLLOWUPS.md` — two lines: (a) dossier column
  `industry_haiku_pct` (and its siblings) now names a model no longer in
  the seat — cosmetic rename at a housekeeping boundary; (b) the sector
  parser coerces unrecognized replies to "Other" (CB finding, Sonnet
  runs) — raw-reply logging or synonym tolerance, future wave.
- **s5** `src/engine/help-agent.ts` — the legacy full-tier Help chat's
  call moves from `CLASSIFICATION_MODEL` to `CLAUDE.HELP_CHAT_MODEL`;
  a startup log line names the seat. Nothing else in the module moves —
  history window and failure alerting untouched.
- **s6** `src/engine/reference-help.ts` — the reference Help agent's
  call moves from `PROSE_MODEL` to `CLAUDE.HELP_CHAT_MODEL`; the
  existing per-exchange logging gains the seat name in its console line.
  Fence, retry, grounding, and `help_questions` logging untouched.
- **s7** `src/prompts/reference-help.md` — a **Smart Brevity** section
  (ruling 5), reconciled with the standing voice law: the direct answer
  is the FIRST sentence, everything after it is support the member can
  stop reading at any point; one idea per sentence, real numbers, plain
  verbs; simple questions answered in one or two sentences, typical
  answers under ~120 words, and past ~150 the reply must be genuinely
  complex or cut; no preamble, no restating the question, no summarizing
  what was just said. The existing rules it composes with stay intact:
  prose only (the voice law's no-bullets rule wins over any structured
  form), no closing offers (stop at the answer — the member asks if they
  want more), dollar figures beside percents, and brevity never cuts a
  correctness caveat or the number the member actually needs.
- **s8** `src/prompts/help-agent.md` — the same Smart Brevity section,
  adapted to the full-tier chat's existing prompt (its response-style
  section is superseded by answer-first and the length targets; its
  scope and never-do rules are untouched).

## 4. The reclassification (after merge and deploy — operational, no commit)

1. Clyde's Evidence Gate documents where AI-vs-FMP provenance lives at
   the row level in `holdings_cache`; Fabio then presents the exact
   clearing SQL — model-sourced sector/industry tags nulled, FMP-sourced
   tags untouched — with expected row counts.
2. Robert types approval naming the operation; Fabio runs it and posts
   the counts.
3. The next pipeline run (the 02:00Z nightly, or Robert clicking
   Refresh Analysis once if he wants it same-day) rebuilds every cleared
   tag on the Opus seat, sequentially, at the standing delays.
4. Fabio verifies read-only: cleared count vs rebuilt count; the three
   named howlers spot-checked corrected; provenance percentages sane;
   reference-tier payloads untouched (no industry-provenance fields in
   the allowlist — re-pinned anyway).

## 5. STOP S-CB-S — verification (Fabio, post-merge, at [www.fundlens.app](https://www.fundlens.app))

1. Deploy pins: health 200; route pins re-checked.
2. The seats, live: the first post-deploy classification batch logs
   `claude-opus-5`; both Help chats log the `HELP_CHAT_MODEL` seat —
   proven by one reference Help question (Robert asks, Fabio reads the
   log line and the served answer) and, if Robert lends a full-tier
   click, one legacy-chat exchange.
3. Brevity proven live: the verification probes' answers land
   answer-first and inside the length targets (a simple question in a
   couple of sentences, a complex one under ~150 words); the first days
   of `help_questions` confirm it holds under real member questions.
4. Benchmark defaults: an unpicked benchmark click runs and stamps the
   Opus seat; a deliberate `haiku` selection still runs Haiku as the
   historical control (report stamp proves both).
5. Reclassification checks per §4.4.

## 6. Out of scope

`PROSE_MODEL` and its consumers — B9 translations and B10 corpus
drafting stay on Sonnet (extendable by a later one-line ruling if
Robert wants one voice everywhere); the sector-parser robustness cure
(FOLLOWUPS, future wave); any Sonnet re-measure (moot unless Robert
reopens it); constants.ts beyond s1's two lines.

*— Drafted by Fabio, August 1, 2026, for Robert's ratification. The
tripwire the frozen-constants law set caught the one side effect that
would have re-seated a chat nobody asked to re-seat. Fabio, for the
record.*
