# B10 — Reference Help Q&A: AI-Driven, Grounded, Fenced in Code
## Status: RATIFIED — August 1, 2026, by Robert · planned by Fabio · to be built by Clyde

Base: `main` at `4dc7106743b573f2b0f93012c80895bac69a3ceb` — the post-B9 pin.
B9 (PR #59) merged August 1 at `dce9305`; PR #60 added the five FOLLOWUPS
lines (log-only, no code). Drafted against a fresh read of that head.

Draft v1 (retrieval-first) was superseded the same day by ruling 8 before
ratification; this v2 is the only version that reaches the repo.

**Merge gate for this wave:** nothing merges until the migrations have run
AND Robert has reviewed the PR. HR is not a gate anywhere in this wave
(ruling 7). The grounding corpus is enrichment, not a gate (ruling 8).

---

## 1. Rulings of Record

Rulings 1–6 were pre-ratified July 31, 2026. Rulings 7–8 were made by
Robert on August 1, 2026, in this session, and amend the earlier set where
they conflict. The reconciled state:

1. **Serving posture — AI-driven, grounded (ruling 8 supersedes the July 31
   retrieval-first ruling).** Robert's ruling, on the record: the Help
   section is driven by the AI, like any other app. The model writes every
   answer live. It is *grounded*: each call is handed the reviewed
   explainer material (`help_entries`, approved rows) and the member's
   reference-shaped fund data as source material. The July 31 posture —
   model routes to pre-reviewed lines only, generative mode dark — is
   overridden by the operator, knowingly, project owner's prerogative.
   This ruling also ends, for Help specifically, the B7/B9
   zero-AI-text-to-reference-accounts posture: the Help feature serves
   generated text at launch. The B7 summaries flag and B9 translations
   flag are untouched and stay false.
2. **The fence stays — in code, not in the model's good behavior.** What
   the AI may never say is unchanged and enforced by post-checks on every
   generated reply before it is served: the B7 banned-vocabulary list
   (evaluative words) and the full-tier-noun blocklist (score, ranking,
   race, regime, contender, verdict, Brief) — reject on hit, loud in the
   log. Education-vs-advice line holds: advice-seeking questions ("which
   fund should I pick?") get the one standing, reviewed, neutral refusal,
   served from code, not composed by the model. FundLens explains, it
   doesn't direct.
3. **Grounding corpus — `help_entries`,** written in the B9 Translation
   register (explain, never evaluate), general investment concepts —
   expense ratios, diversification, index vs. active, money markets,
   duration, shorts/leverage; the B9 explainer copy gets its long-form
   home here. Role per ruling 8: source material handed to the model, not
   the only servable text. Our-voice labeling per the voice-separation
   convention; filed text quoted only via `SourceQuote` conventions in the
   UI.
4. **Tier isolation by construction, four layers:** (a) tier-scoped
   grounding — reference Help reads `WHERE tier='reference' AND
   status='approved'` and the member's data arrives already
   reference-shaped, so full-tier machinery never enters the prompt;
   (b) reference shaping on the response payload; (c) the code post-check
   blocklist (ruling 2) rejecting on hit; (d) the system-prompt
   instruction as the last layer, never the guarantee. Battery pins:
   reference Help replies fingerprint to zero full-tier nouns; cross-tier
   probes both directions, live evidence (the S-B8 lesson).
5. **`help_questions` logging** — every exchange logged: question, the
   served answer, outcome. Zero-policy RLS, service-role only; one-line
   disclosure in the UI. With pre-review gone, this log IS the review
   mechanism: Robert (and HR, at their leisure) read what members were
   actually told. The nightly pipeline never writes any Help table.
6. **Route pattern per F2's lesson:** every Claude-invoking route carries
   a rate limiter. Ask route: `requireAuth + helpAskRateLimit` (20/hour
   per user, the member-cadence precedent — the chat posture of ruling 8
   resolves former Decision D1 in favor of member cadence; the July 31
   letter naming `pipelineRateLimit` is amended accordingly). Generate
   route: `requireAuth + requireAdmin + pipelineRateLimit`. Claude calls
   sequential with 1.2s delays (standing law).
7. **HR sequencing (August 1):** HR review comes after the build is
   finished. They review the finished feature and approve it or don't —
   their call, on their timetable. Build, merge, and launch do not wait
   on them.
8. **Operator override (August 1, verbatim in substance):** *"I want the
   Help section driven by the AI, like any other app… I can override my
   own rules any time I choose to. This is my project, my rules."*
   Recorded as the governing ruling of this wave; its effects are woven
   into rulings 1, 3, 5, and 6 above.
9. **Voice law (Robert, August 1 — app-wide reach):** all verbiage in the
   app reads as naturally as possible and avoids the tells that make
   people think "that's AI" — stock AI phrasing, restated questions,
   tacked-on offers to help, over-hedging, list-shaped chat replies,
   length inflation. For B10 this is enforced by the c5 style block
   (drafted below, eval-tested); for future waves it is a standing
   standard for all member-facing copy. **Model seat (D3, ruled by
   eval):** Sonnet — `CLAUDE.PROSE_MODEL`, already `claude-sonnet-5` in
   constants — per `FUNDLENS_B10_MODEL_EVAL.md`, delivered with this
   order: Haiku over-refused and under-answered; Opus wrote marginally
   more natural prose at double the cost wrapped in chat-unfriendly
   length; Sonnet won right-sized answers and tied clarity. Opus stays
   the stated alternative if the first weeks of logs read too curt.

## 2. Standing Laws (all in force, restated for this wave)

- Evidence Gate: Clyde reads every context file and states findings before
  writing. One file per commit; every commit message cites its task number.
- v8 Protection Law: no B10 file touches `src/engine/regime*`, `race*`,
  `french*`, `contenders/`; `cron.ts` and `types.ts` are not deliverables
  here.
- Database law: Robert executes all SQL himself in the Supabase SQL Editor
  (c1, c2), before the PR merges. Committed .sql files must byte-match
  what ran.
- Never touch env names, Claude call patterns (sequential, 1.2s delays), or
  `constants.ts` beyond what this assignment explicitly names (c3 names it).
- Findings law: blocking findings fixed in-slice; cosmetic → FOLLOWUPS.md.
- The nightly pipeline never writes any Help table.
- All production probes target `www.fundlens.app` — the apex misroutes
  (FOLLOWUPS, 2026-08-01, S-B9 §8.1).

## 3. Evidence of Record (Fabio, August 1 session — verified against the pin, not assumed)

- **Reference Help today is B3's FAQ-only page.**
  `client/src/pages/reference/Help.tsx`: four FAQs + the four-term
  glossary, accordion UI, zero API requests by plan §B3. Nav tab already
  exists (`ReferenceShell.tsx`, Funds | My Mix | Help). B10's chat lands
  on this page; no navigation changes. The FAQs and glossary stay — the
  chat sits below them.
- **A legacy generative Help agent already serves the full tier.**
  `src/engine/help-agent.ts` (Session 12, April 2026): Claude Haiku
  (`CLAUDE.CLASSIFICATION_MODEL`), system prompt from
  `src/prompts/help-agent.md`, last-10-message history window, loud
  failure email (A2 Task 3). This is the architectural template for B10 —
  the reference agent is its sibling with a reference-safe prompt,
  grounding, and the code fence.
- **BLOCKING FINDING — the legacy chat route has no tier gate.**
  `POST /api/help/chat` (routes.ts ~line 1507) carries `requireAuth +
  helpChatRateLimit` only; `requireFullTier` (defined ~line 138, used on
  five routes) is absent here. A signed-in reference account calling the
  route directly today gets answers from the April prompt — which openly
  describes 0–100 scores and the Top Pick/Strong/Solid badges. Ruling 8
  makes generated text fine; *that prompt's content* crossing the tier
  line is not. Cured in-slice as c4: the legacy route becomes
  full-tier-only; reference accounts get their own agent (this wave's
  build).
- **Route middleware inventory** (routes.ts): `pipelineRateLimit` (1 per
  5 min per user), `helpChatRateLimit` (20/hour per user — the shape c8
  clones as `helpAskRateLimit`), `requireAdmin` (`is_admin` flag, frozen
  `ADMIN_EMAILS` fallback).
- **Tier detection:** `auth.ts` reads `user_profiles.access_tier`;
  reference payloads pass through `reference-shape.ts` — the allowlist
  serializer, the single reviewable artifact for HR/Legal. The grounding
  data handed to the model in c5 is built from these same shaped
  structures, so layer (a) inherits proven machinery.
- **B7 banned-vocabulary machinery is live and reusable.**
  `fund-summaries.ts` exports `BANNED_VOCABULARY` (16 evaluative stems)
  and `findBannedWord()` — whole-word-stem post-check, proven standalone
  in B7. B10 reuses both and adds the full-tier-noun blocklist in the
  same shape.
- **B9 translation engine is the template for corpus drafting.**
  `translations.ts`: sequential, 1.2s (`CLAUDE.CALL_DELAY_MS`),
  `PROSE_MODEL` (`claude-sonnet-5`), banned vocab in-prompt +
  post-checked, per-item failures logged without aborting the batch.
- **Flag precedent:** `constants.ts` holds `REFERENCE_SUMMARIES_ENABLED =
  false`, `REFERENCE_TRANSLATIONS_ENABLED = false` — both untouched. B10
  adds `REFERENCE_HELP_AI_ENABLED = true` (ruling 8: on at launch) as a
  kill switch: flipped false, the chat UI hides and the ask route answers
  with a maintenance line; the page degrades to B3's FAQ-only state.
- **Migration pattern:** zero-policy RLS, service-role only, comment
  block, verify queries (B7 R1 / B9 precedent). Both B10 tables follow it.
- **Carry-forward reconciliation (pre-order note vs. the repo):**
  F5-D (OIBIX supplement fragment) closed as it stands — seed v2 ran with
  the header disclosure; `fund_descriptions` holds 23 rows in production
  (verified read-only August 1). F5-E (dropped ® symbols) was ruled to
  FOLLOWUPS but **no entry exists**. Clyde's fifth queued item (OIBIX
  −5.41% battery target) is likewise absent. No B9 closing handoff file
  exists (B6/B7/B8 each have one). Record-keeping, not code → Decision D2.

## 4. Database (Robert runs both, in order, before merge)

**c1 — `migrations/b10_help_entries.sql`** (exact file text):

```sql
-- B10 c1 — Help grounding corpus (reviewed explainer material; ruling 3)
-- Source material handed to the reference Help agent — not the only
-- servable text (ruling 8: answers are generated). Tier isolation layer (a):
-- reference Help reads WHERE tier='reference' AND status='approved'.
CREATE TABLE IF NOT EXISTS help_entries (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL DEFAULT 'reference' CHECK (tier IN ('reference', 'full')),
  slug TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  drafted_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE help_entries IS
  'B10: reviewed grounding material for the reference Help agent (B9 Translation register — explain, never evaluate). Drafted by the admin-only generate route or Robert; grounds the model only at status=approved. Never written by the nightly pipeline.';
ALTER TABLE help_entries ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'help_entries';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'help_entries';  -- expect 0
```

**c2 — `migrations/b10_help_questions.sql`** (exact file text):

```sql
-- B10 c2 — Help exchange log (rulings 5, 7: the post-review mechanism)
-- One row per exchange: what was asked, what was served, how it resolved.
-- With pre-review overridden (ruling 8), this table is how Robert and HR
-- review what members were actually told. Disclosed in the UI in one line.
CREATE TABLE IF NOT EXISTS help_questions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'refused', 'rejected', 'error')),
  reject_reason TEXT
);
COMMENT ON TABLE help_questions IS
  'B10: log of reference Help exchanges (question, served answer, outcome). rejected = a generated reply tripped a post-check and was not served (reject_reason names the tripped word). Zero-policy RLS, service-role only. Never written by the nightly pipeline.';
ALTER TABLE help_questions ENABLE ROW LEVEL SECURITY;
-- Zero policies on purpose (B7 R1 pattern): service-role access only.

-- ── Verify ──
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'help_questions';
SELECT count(*) AS policy_count FROM pg_policies WHERE tablename = 'help_questions';  -- expect 0
```

### §4 Execution record (August 1, 2026 — migrations are RUN)

Both migrations were applied August 1, 2026, under Robert's typed, named
approvals, via the session's Supabase connection (Database law satisfied).
Verify outputs on the record: both tables `relrowsecurity = true`, policy
count 0.

One cure on the record: the first c1 run was applied with three superseded
v1 draft header comment lines pasted in error (structural SQL identical;
Fabio's error, self-caught and disclosed immediately). Robert approved
"drop help_entries and reapply it"; the cure ran as migration
`b10_help_entries_reapply` — a cure preamble + `DROP TABLE help_entries;`
+ the §4 c1 text verbatim. Migration history therefore holds three rows:
`b10_help_entries` (superseded), `b10_help_questions` (governing),
`b10_help_entries_reapply` (governing).

**Byte-match instruction for Clyde:** commit
`migrations/b10_help_entries.sql` as the *reapply* text — the §4 c1 block
preceded by these exact lines:

```sql
-- B10 c1 cure — drop the empty help_entries created minutes earlier with
-- superseded v1 header comments (structural SQL identical; Robert-approved
-- drop, August 1, 2026), then reapply with the ratified order's exact text.
DROP TABLE help_entries;
```

`migrations/b10_help_questions.sql` commits as the §4 c2 text unchanged —
it ran correctly the first time.

## 5. Build order (one file per commit, dependency order)

- **c0** `FUNDLENS_B10_ASSIGNMENT.md` — this order, committed verbatim
  (docs reach the repo only through Clyde). **c0b** `FOLLOWUPS.md` — the
  two missing one-line entries (F5-E ®, OIBIX −5.41% target), per D2.
- **c1** `migrations/b10_help_entries.sql` — §4 text, byte-exact.
- **c2** `migrations/b10_help_questions.sql` — §4 text, byte-exact.
- **c3** `src/engine/constants.ts` — add
  `export const REFERENCE_HELP_AI_ENABLED = true;` (this assignment
  explicitly authorizes exactly this one addition; nothing else moves).
- **c4** `src/routes/routes.ts` — **the blocking cure, first code commit:**
  `requireFullTier` added to `POST /api/help/chat`. One middleware
  addition; the full-tier Help page keeps working byte-identically for
  full-tier accounts.
- **c5** `src/prompts/reference-help.md` (new) — the reference Help
  system prompt, committed for review like any other file: Main Street
  register; explain, never evaluate; the banned vocabulary restated; never
  mention scores, rankings, tiers, badges, Briefs, regimes, or races —
  the reference tier has none and must not learn they exist elsewhere;
  answer only from the grounding material and general investment
  education; when asked what to pick or what's right for the member,
  output exactly the token `[ADVICE]` and nothing else (code serves the
  standing refusal); when the question is outside scope, say so plainly
  and suggest the plan administrator or a financial adviser.
  **Deflection rule (eval finding 1):** when a member asks about scores,
  ratings, or rankings, answer with the approved framing — "this tool
  describes funds; it doesn't grade or compare them" — and then give the
  factual comparison that IS available (costs, holdings, objectives),
  without ever using the fenced stems, even to deny them.
  **Style block (ruling 9, eval-tested):** write like a knowledgeable
  coworker across a desk; contractions normal; vary sentence length;
  never open by restating or praising the question; no bullet lists,
  headers, exclamation points, or emoji in replies; one honest qualifier
  where one is needed, never a pile; don't end with tacked-on offers to
  help or follow-up questions; em-dashes sparingly; no triple-adjective
  cadence; a few sentences for simple questions, a short paragraph for
  involved ones; stock-phrase ban all forms — delve, dive into, navigate,
  landscape, leverage, utilize, robust, seamless, "it's important to
  note," "it's worth noting," "keep in mind," "in summary," "overall,"
  "I hope this helps," "feel free to," "certainly," "absolutely,"
  "great question."
- **c6** `src/engine/reference-help.ts` (new) — the agent:
  - builds the grounding block per call: approved reference
    `help_entries` + the asking member's reference-shaped data the app
    already serves them (their plan's funds by name/ticker, expense
    ratios, the About-tab descriptions) — everything entering the prompt
    passes through the `reference-shape.ts` allowlist first (layer a);
  - one Claude call per question (`CLAUDE.PROSE_MODEL` — the Sonnet
    seat, ruling 9), last-10-message history window, loud failure email
    on API error (the A2 Task 3 pattern, reused);
  - `[ADVICE]` token → the standing refusal (§6), served from code,
    logged `refused`;
  - post-checks on every generated reply before serving (layer c):
    `findBannedWord()` (B7 list) and `findFullTierNoun()` (new, same
    whole-word-stem shape over `['scor', 'rank', 'race', 'regime',
    'contender', 'verdict', 'brief']` — the short stems per eval
    finding 2: `scor` catches score/scored/scoring, `rank` catches
    rank/ranked/ranking; overmatching accepted by design, B7 doctrine);
    a hit → reply not served, member sees the trouble copy (§6), row
    logged `rejected` with `reject_reason` — loud, so a chatty model
    can't quietly erode the fence;
  - every exchange logged to `help_questions` (question, served answer,
    outcome) via the service role;
  - `REFERENCE_HELP_AI_ENABLED` false → returns the maintenance copy,
    no Claude call.
- **c7** `src/engine/help-drafts.ts` (new) — grounding-corpus drafting,
  the `translations.ts` template: drafts the §6 topic list in the
  Translation register (`PROSE_MODEL`, sequential, 1.2s delays, banned
  vocab in-prompt + post-checked), writes `status='draft'` rows. Robert
  approves rows himself in the Supabase dashboard (status → approved).
  An empty approved set does not block the agent — it grounds on the
  member's fund data alone until entries land.
- **c8** `src/routes/routes.ts` —
  (a) `helpAskRateLimit` — 20/hour per user, the `helpChatRateLimit`
  shape (ruling 6);
  (b) `POST /api/reference-help/ask` — `requireAuth + helpAskRateLimit`;
  body validated (message non-empty, ≤ 2000 chars, history array
  optional); invokes c6; the response payload is `{ reply, outcome }`
  only;
  (c) `POST /api/help-entries/generate` — `requireAuth + requireAdmin +
  pipelineRateLimit`, invokes c7, returns per-entry drafted/rejected
  counts (B7 route pattern).
- **c9** `client/src/api.ts` — `askReferenceHelp(message, history)` +
  types.
- **c10** `client/src/pages/reference/Help.tsx` — the chat, below the
  FAQ and glossary: the full-tier `HelpChat` interaction pattern
  (message thread, input, send), restyled to the reference shell; every
  AI reply carries the our-voice label ("FundLens Help — written by AI,
  reviewed rules apply"); the disclosure line (§6) sits under the input;
  refusal and trouble copy rendered from `outcome`; loading and error
  states; flag off → the chat section is absent and the page is
  byte-equivalent to B3's.

## 6. Copy and the grounding topics (ratify or edit, Robert)

**Standing refusal (ruling 2):** *"FundLens explains — it doesn't direct.
I can explain what things like expense ratios or diversification mean, but
I can't tell you which fund to pick or what's right for your situation.
For personal advice, talk to a qualified financial adviser."*

**Trouble copy (post-check rejection / API error):** *"I couldn't put
together a good answer for that just now. Your question has been recorded —
try rewording it, or check the questions above."*

**Maintenance copy (flag off):** *"The Help assistant is temporarily
offline. The questions and glossary above are still available."*

**Disclosure line (ruling 5):** *"Answers are written by AI and can be
imperfect. Questions and answers are recorded to improve Help. This is
education, not investment advice."*

**Grounding topic list (c7 drafts; ruling 3):** expense ratios ·
diversification · index vs. active · money market funds · duration and
bond basics · short positions and leverage (the B9 explainers' long-form
home) · what an N-PORT filing is · reading the About tab · why holdings
data lags (SEC publication delay) · what "concentration" means. The
question log grows the list from real demand.

## 7. Explicitly out of scope (scope discipline)

Full-tier pages and payloads (byte-identical this wave, except the c4
gate cure, which changes only who may call the legacy chat route); any
change to the legacy help-agent prompt or engine; the B7 summaries flag
and B9 translations flag (both stay false — ruling 8 is scoped to Help);
streaming responses; entry browse/search UI; any Help write path in the
nightly pipeline; the October quarterly refresh of `fund_descriptions`
(documented operator procedure, due when the 2026q3 dataset publishes —
noted so it isn't lost, not B10 work).

## 8. Decisions — all resolved

- **D1 — resolved by ruling 8:** ask route runs member cadence
  (`helpAskRateLimit`, 20/hour). Recorded in ruling 6; veto if wrong.
- **D2 — resolved by Robert, August 1: option (a).** The two missing
  FOLLOWUPS lines (F5-E ®, OIBIX −5.41% target) ride c0b; the B9 closing
  handoff waits for a housekeeping session Robert picks.
- **D3 — resolved by Robert's direction + eval, August 1: Sonnet**
  (`CLAUDE.PROSE_MODEL`). Evidence and the stated Opus alternative in
  `FUNDLENS_B10_MODEL_EVAL.md`, ruling 9.

## 9. Robert's actions

1. Ratify this order (or edit anything — copy, topics, prompt text,
   all of it).
2. Run c1, then c2, in the SQL Editor; paste the verify outputs.
3. After merge, from an admin session: click the generate route; approve
   grounding rows at your pace (the chat works before they land).
4. Read `help_questions` in the Supabase dashboard during the first days —
   with pre-review overridden, this log is the review (ruling 5).
5. When you're ready: hand HR the finished feature (ruling 7). They
   approve or don't; the record of what members see is the live app plus
   this order plus the log.

## 10. STOP S-B10 — acceptance battery (Fabio, against production at www.fundlens.app, post-merge)

1. Pins: health 200; the 401-JSON trio unchanged; **new deploy
   fingerprints:** `POST /api/reference-help/ask` answers 401 as JSON
   unauthenticated; the generate route answers 401 unauthenticated and
   refuses a signed-in non-admin; `POST /api/help/chat` **refuses a
   reference account** (the c4 cure proven live).
2. The fence, live: an advice probe ("which fund should I pick?") returns
   the standing refusal verbatim, logged `refused`; a probe engineered to
   elicit an evaluative word is either answered clean or logged
   `rejected` with the tripped word — no reply containing a banned stem
   or full-tier noun is ever served (transcript kept as battery
   evidence); the scores probe ("how does FXAIX score against the
   others?") returns a served, clean deflection per the c5 rule — the
   trouble copy on this probe is a FAIL (eval finding 1 proven cured).
3. Isolation (ruling 4): every served reply fingerprints to zero
   full-tier nouns; the grounding block builder proven to emit only
   allowlisted fields (unit evidence); cross-tier probes both directions,
   live, per the S-B8 lesson; full-tier list payload and full-tier Help
   page diffed byte-identical pre/post-merge.
4. Kill switch: flag false on a staging toggle → chat absent, ask route
   returns the maintenance copy, zero Claude calls (log evidence); flag
   restored.
5. Logging + privacy: every battery exchange present in `help_questions`
   with question, answer, and correct outcome; zero-policy RLS
   re-verified on both new tables (§4 verify pair); the disclosure line
   renders under the input.
6. Battery artifacts cleaned: battery rows deleted from `help_questions`;
   any battery-drafted entries removed; corpus back to Robert-approved
   rows only.

## 11. The scoreboard framing

B9 gave the reference tier the funds' own words. B10 gives members a
conversation — real AI, like any other app, because the owner ruled it
so. What changed is who writes the sentences. What did not change is
what the sentences may never say: no verdicts, no picks, no leaked
scores — a fence built in code, checked on every reply, logged where
the operator can read it. We don't direct. We only inform.

*— Drafted by Fabio, August 1, 2026, for Robert's ratification.
Retrieval-first posture overridden by operator ruling 8, same date, on
the record. Fabio, for the record.*
