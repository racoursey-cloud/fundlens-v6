# FUNDLENS B7 CLOSING HANDOFF

Authored by Fabio at the session boundary, July 31, 2026. Permanent close of the B7 milestone; rides as commit c0 of the B8 wave per the standing handoff law. Provenance: this is a re-supplied copy. The original was lost in transit before it reached the builder; it has been rebuilt from the session record and carries a new canonical checksum, which supersedes the earlier declaration. Nobody hunts for fault.

## 1. What B7 was

Neutral reference summaries, flag OFF: a describe-never-evaluate draft per fund, batch-generated only on Robert's explicit click, stored in a locked table, reviewed by Robert, and served to reference accounts only if REFERENCE_SUMMARIES_ENABLED (constants) is ever deliberately flipped after HR sign-off. It ships false; zero AI-generated text reaches any reference payload today.

## 2. Rulings that shaped the wave (Robert, July 30; verbatim in the ledger)

R1: storage is the new reference_summaries table — one row per fund, unique fund_id, row level security enabled with ZERO policies; service-role access only; invisible to the database's direct read path; untouched by every pipeline path by construction. R2 as amended: seven commits, one PR — the plan's four-commit list superseded by gate evidence (the flag required a constants commit; the held B6 handoff rode as c0; a review-driven correction added c6).

## 3. Build record

PR #56, titled exactly "B7 — Reference summaries (flag OFF)", branch claude/fabio-b7-build-xq29gj off pinned main 90d72740. Seven commits, one file each: c0 the held B6 closing handoff; c1 the migration; c2 the flag, shipped false; c3 neutral summary generation with the banned-vocabulary check enforced both in the prompt and in code; c4 the flag-gated emission, key absent when the flag is false; c5 the admin-only generate route plus flag-gated serving; c6 a review-driven correction. One blocking finding was caught at pre-merge review and cured before merge: c3 rescaled a sector value that is already stored on a 0-to-100 scale, which would have printed absurd percentages; c6 emits the stored value directly. Final reviewed head 95815f74. Merge: main 79d7039e, a true merge of 90d72740 and 95815f7, tree byte-identical to the reviewed head.

## 4. Live close

Robert executed the migration in the SQL editor; the table verified read-only as row level security enabled, zero policies, zero rows. His generate click at 01:09:46Z returned twenty-three generated, none rejected, twenty-three total. Database-side acceptance passed: twenty-three rows across twenty-three distinct funds, no active fund missing, one uniform stamp, an independent banned-stem sweep returning zero hits. The nightly then proved the isolation claim live: cron 3f47638c completed at 02:05:55Z, twenty-three of twenty-three, error list truthfully empty, and reference_summaries came through byte-still at its original stamp. Build, merge, migration, generation, acceptance and nightly-untouched are all proven.

## 5. What is still open

Robert owes two things before launch, neither blocking a build: his verdict on the twenty-three drafts, and final disclaimer copy. Two reviewer flags sit in the draft file for his call — one draft reports a fixed-income share above one hundred percent, which is the stored value faithfully reported since offsetting positions can exceed the total but reads like a typo; and both money-market drafts describe holdings as entirely cash and cash equivalents, which is true of the category but reaches past the sparse data behind those two funds. The flag stays false until HR signs off.

## 6. Pins for the next wave

Main 79d7039e. Health responds 200 at version 6.0.0. Both fingerprint routes answer 401 as JSON when unauthenticated: the example-allocation route and the reference-summaries generate route. The served client bundle is unchanged from B6, since B7 was server-only. The summaries table holds twenty-three rows at a single generation stamp with the flag off, so nothing is served.

Fabio, for the record, July 31, 2026.
