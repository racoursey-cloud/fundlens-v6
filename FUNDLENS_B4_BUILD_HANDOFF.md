# FundLens — B4 Planning → B4 Build Handoff
*Written by Fabio at the close of the B4-planning session, July 28, 2026. Authoritative record: /areas/fundlens.md in memory (condensed this session — headroom restored). Plan of record: B_REFERENCE_TIER_PLAN.md on main. This is the reference tier on the v7 lineage — it is NOT v8; v8 appears in this work only as the Protection Law and as history.*

## 1. What this session closed
- Memory condensed as the session's first act; every standing law, ruling, and open item preserved.
- Email OTP expiration: CLOSED — config was already 3600 (Robert read it from the dashboard). Codes live one hour; the 60-second countdown was only the resend cooldown.
- Pre-launch Login polish wave: PR #50, three one-file commits, merged at cb9a099, deployed. Login now reads "Email me a sign-in code"; cooldown reads "Resend available in Xs"; helper line "Your code stays valid for an hour." sits under the code input.
- Dead-link notice: CLOSED BY EVIDENCE — AuthCallback's B3 expired-link screen renders on the otp_expired hash (live Chromium repro, held past the 10-second timeout, no redirect). No new code was needed.
- New standing relay law: pastes into Claude Code auto-convert bare web addresses into broken markdown links (proven twice this session). Any order carrying a web address must give a structural description plus a grep acceptance proving the committed file contains no markdown-link syntax. Committed session handoffs contain no links at all, by design.
- Test accounts RULED: KEEP both as standing rigs — rcoursey@terrascend.com (native domain-gate passer, real coworker path including the corporate mail scanner) and racoursey.stream@gmail.com (permanent 403-everywhere probe of the gate). Both are exempt from any future junk-signup sweep.
- Robert's grid-density ruling: the dollars-per-$10,000 register leaves the grid; a native browser tooltip on the % cell plus both registers in the fund-detail identity strip replace it.
- F3 RULED: cash-sweep holdings get a muted "cash reserves" tag; the filing data itself is untouched.
- B4 assignment RATIFIED July 28 — it travels in the same paste as this handoff; Clyde executes it as the next wave.

## 2. Evidence gathered this session (database, read-only)
- Sweep vehicles sit in 11 of the 23 funds, not the 4 first spotted; thirteen exact vehicle names enumerated (they live in the assignment's c1). Pattern-matching is forbidden: FirstCash Holdings Inc, Metcash Ltd, and Lancashire Holdings Ltd are real portfolio companies whose names contain the letters c-a-s-h.
- Literal 'N/A' holding names sit on 7 funds (CEMEX 6.52% is the big visible one; OIBIX carries a −5.41% N/A short row) — em-dash rendering applies globally.
- ADAXX/FDRXX confirmed: dossier money-market flag true, report_date null, zero holdings rows — the money-market special case fits exactly.
- FSPGX INCIDENT (open, server-side, queued after B4): healthy through July 24 — passed the data-quality gate daily with 392 holdings from its April 30, 2026 filing. The July 24 run rewrote its holdings cache to 391 rows stamped with the fetch day (2026-07-24) as report_date — not a filing month-end — and the April 30 rows are GONE from cache. Every nightly run since July 25 fails with "Holdings unavailable — EDGAR fetch failed for this run" (alerts throttle to one email per day; latest failing run cf82736d). The full-tier score is correctly flagged as incomplete-data; the reference tier serves the fund holdings-empty and B4 renders that honestly. Repair is its own server/pipeline mini-wave: read-only diagnosis of the EDGAR fetch and cache-write path FIRST (the v7 VWIGX cache-poisoning incident, fixed in cusip.ts, is precedent). DO NOT hand-edit cache rows — the July 24 batch is the only in-cache holdings copy for this fund.

## 3. Production state
- main at cb9a099; production deploys automatically via Railway.
- Accounts: racoursey@gmail.com — Robert's operator account, full tier, the only access-exceptions row. rcoursey@terrascend.com and racoursey.stream@gmail.com — the two standing test rigs described above.

## 4. The docket after the B4 wave ships (priority order)
1. Fabio pre-merge review of the B4 PR: independent tsc plus npm run build from the repo root (root install alone doesn't cover client deps — client/ has its own package.json), residual greps, the assignment's acceptance list. Then Robert merges and runs the live battery.
2. FSPGX pipeline repair mini-wave (read-only diagnosis first) — jumps the queue only on Robert's word.
3. FOLLOWUPS.md at next touch: auth.ts header narration and the stale signInWithMagicLink name; as-filed name-casing cosmetics; the junk-signup sweep mechanism (rigs exempt); NEW — a server-side cash-sweep flag in reference-shape at the next server touch (EDGAR's STIV category OR the curated list), so the client constant can retire.
4. Standing B8 ledger unchanged: tighten the reference profile-update route's allowlist; strip weight fields from the reference profile read; audit the allocation_history permissive insert policy; regenerateBriefsForAllUsers removal candidate; TierRouter/ProtectedRoute double profile fetch dedupe; client OTP-length tolerance or a config assertion.
5. Disclaimer footer: placeholder legal copy is live; Robert's final text is still owed before launch.
6. Then B5 planning per the plan (example-mix endpoints and pure composite math).

## 5. Boot notes — next Fabio
- Boot: read /areas/fundlens.md, clone racoursey-cloud/fundlens-v6, read this handoff at the repo root, the ratified B4 assignment, and plan §B4.
- Working with Robert, hard-won: one instruction at a time; plain words — NO project shorthand without a plain-language gloss (shorthand lost the operator once this session; say it like a person); NAME the machine, browser, and email address in every instruction; never make him scroll — re-paste blocks fresh; ask whether a paste was sent before revising it; relay gaps are cured by re-supply, nobody hunts for fault; verify every relay claim repo-side or database-side; server-side stamps settle disputes; the operator IS the first user — his confusion is data, never noise.
- The Same-Token Law is permanent. The v8 Protection Law is in force. The reference tier is the v7 lineage — never call it a v8 build.

## 6. Paste-ready boot — next Fabio (paste into a fresh chat)

> Fresh-Fabio boot — FundLens reference tier (v7 lineage), B4 verification. Read /areas/fundlens.md, clone racoursey-cloud/fundlens-v6, read FUNDLENS_B4_BUILD_HANDOFF.md at the repo root, the ratified B4 assignment, and plan §B4. Lane A stands. Jobs in order: pre-merge review of Clyde's B4 PR (independent tsc and root build, residual greps, the acceptance list), hand me the merge instruction, walk my live battery, then plan the FSPGX pipeline-repair mini-wave. One deliverable per session.

*B4 planned honest: the tags tell the truth, the grid got quieter, and the one broken fund says so out loud. — Fabio, July 28, 2026*
