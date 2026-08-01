# B10-F1 — Cure Wave: First-Contact Findings
## Status: RATIFIED — August 1, 2026, by Robert (copy ratified as drafted) · planned by Fabio · to be built by Clyde

Base: `main` at `1c65ae9` (the PR #61 merge — post-B10 pin). All five items
arise from Robert's first live contact with the deployed feature, August 1:
three from the acceptance probes, one from the translations question, one
operator direction. Findings-law classification: none is production risk —
the fence held on every probe — but all five are member-visible or
operator-blocking, so they cure now as a wave rather than waiting for
housekeeping.

## Findings of record

- **F1-a (Fabio's own):** the ratified trouble copy contains the banned
  stem "good" — a member fenced on "good" then reads "good" in the
  apology. Code-served lines are rightly exempt from the post-check, but
  the copy should hold itself to the same standard.
- **F1-b:** production Sonnet echoed "good" from the member's question
  ("Is PRPFX a good fund?") in its draft and was fenced — correct
  behavior, avoidable trip. The prompt never explicitly forbade echoing
  the member's evaluative word. The eval saw all three models dodge this;
  live, on the first try, one didn't.
- **F1-c:** a single fence trip goes straight to the trouble copy. One
  silent retry would serve most members a clean answer instead.
- **F1-d:** no client code calls any of the three admin generate routes
  (B7 summaries, B9 translations, B10 help entries). The orders say
  "click the route"; a browser-only operator has nothing to click.
- **F1-e (operator direction):** the Ask section renders below the FAQ
  and glossary; Robert wants it first.
- *(Observed, riding f2):* probe 2's answer ended with a tacked-on "If
  you want, I can lay out…" offer — a style-block violation served clean.

## Copy for ratification (F1-a cure)

Replacement trouble copy, served from code:
*"I couldn't finish a clean answer to that one just now. Your question
has been recorded — try rewording it, or check the questions below."*
("below" replaces "above" — after f5 the FAQ sits under the chat.)

## Build order (one file per commit, dependency order)

- **f0** `FUNDLENS_B10_F1_CURE_ORDER.md` — this order, committed verbatim.
- **f1** `src/prompts/reference-help.md` —
  (a) the echo rule: never repeat or negate an evaluative word from the
  member's question, even to disclaim it — describe instead ("What I can
  tell you is what the fund does");
  (b) reinforce the closing rule: end when the answer is done — no
  tacked-on offers to lay out more, compare more, or help further.
- **f2** `src/engine/reference-help.ts` —
  (a) trouble copy replaced with the ratified text above;
  (b) one silent retry on a fence trip: the retry call names the tripped
  word and instructs a rewrite without it; a clean retry serves and logs
  `answered`; a second trip serves the trouble copy and logs `rejected`
  with both tripped words in `reject_reason` (e.g., `good; best`).
  Sequential, 1.2s delay before the retry (standing law), one extra call
  worst-case.
- **f3** `client/src/pages/reference/Help.tsx` — the Ask section moves
  above the FAQ and glossary (F1-e); the FAQ heading gains one line of
  furniture text ("Common questions, answered the same way every time")
  so the seam reads deliberately; flag-off still renders B3's page.
- **f4** `client/src/api.ts` — three admin methods:
  `generateReferenceSummaries()`, `generateReferenceTranslations()`,
  `generateHelpEntries()` — thin wrappers over the existing routes,
  returning the per-item counts each route already reports.
- **f5** `client/src/pages/Pipeline.tsx` — an admin-only "Generate"
  panel: three buttons (B7 summaries · B9 translations · B10 help
  entries), each showing the returned generated/rejected/skipped counts
  and a plain one-line description of what it writes and that nothing
  serves without review-and-flag (summaries, translations) or approval
  (help entries). Buttons disable while a run is in flight;
  `pipelineRateLimit` already guards the server side.

## Explicitly out of scope

The serving flags (`REFERENCE_SUMMARIES_ENABLED`,
`REFERENCE_TRANSLATIONS_ENABLED` stay false; `REFERENCE_HELP_AI_ENABLED`
stays true); any fence-list change; the HR posture on B9 translations
(Robert's open call, not assumed); the kill-switch exercise and
reference-token legacy-route probe (deferred battery legs, unchanged).

## Robert's actions

1. Ratify this order (edit the trouble copy or anything else).
2. Review and merge the PR (no migrations this wave — code only).
3. Post-deploy: use the new Generate panel at your pace — help entries
   for the Help corpus, translations when you're ready to review the 23;
   both store dark until you approve/flip.

## STOP S-B10-F1 — verification (Fabio, post-merge, at www.fundlens.app)

1. Re-probe "Is PRPFX a good fund?" — expect a served, clean,
   descriptive answer (retry proving), logged `answered`; the log shows
   no straight-to-trouble-copy path taken.
2. A probe designed to trip twice still serves the new trouble copy —
   verbatim match to the ratified text — and logs both tripped words.
3. Layout: Ask renders first; FAQ and glossary intact below; disclosure
   line still under the input; bundle fingerprints re-pinned.
4. Generate panel: help-entries button produces draft rows
   (status='draft', nothing approved, nothing served); counts render.
5. The §10.6 cleanup executes: battery rows (the three August 1 probes
   plus F1 verification rows) deleted from `help_questions` on Robert's
   confirmation; corpus back to operator rows only.

*— Drafted by Fabio, August 1, 2026, for Robert's ratification. The
fence held on every first-contact probe; these cures are about the
member never needing to know it's there. Fabio, for the record.*
