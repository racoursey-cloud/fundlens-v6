# FundLens — B3 → B4 Handoff
*Written by Fabio at the close of the B3 session, July 27/28, 2026. Authoritative record: `/areas/fundlens.md` in memory — **at its size cap; condensing it is the next session's first act.** Plan of record: `B_REFERENCE_TIER_PLAN.md` on `main`. This is the reference tier on the **v7 lineage** — it is NOT v8 (standing correction, Robert, with finality); v8 appears in this work only as the Protection Law and as history.*

---

## 1. State of the world

- **B3 is COMPLETE and CLOSED.** PR #49 — fifteen one-file commits — merged to `main` (merge commit `2a31f0e`), deployed to **[www.fundlens.app**](https://www.fundlens.app**), migration executed, config corrected, live battery passed.
- **What shipped (client-only; no server files, no v8 files):**
  - Reference shell: **Funds | My Mix (B6-pending stub) | Help** tabs; no Refresh Analysis, no source badge, no pipeline polling; disclaimer footer (placeholder legal copy, pending Robert's final text) on every page.
  - Sortable facts grid: eight ratified columns, expense shown in both registers (percent and ~$/yr per $10,000), alphabetical default, user-driven sorting only, HHI label text with no good/bad colors, em-dash for missing.
  - Curated FAQ + four-entry glossary Help (Robert's curation ruling: 8 of 10 full-tier FAQs dropped); zero API calls, no chat.
  - `TierRouter` in App.tsx: guards auth itself; reference accounts never mount `ProtectedRoute` (wizard structurally unreachable); full-tier tree verbatim; gate-403 accounts get the honest full-screen **Access restricted** notice instead of cheerful empty pages.
  - Code-first login: `verifyOtp` (`type: 'email'`), `shouldCreateUser: true` per **D1** (Robert, July 27 — supersedes Decision 3 of July 5; the B2 server-side domain gate now carries the ghost-account risk). Error-aware AuthCallback (parses error hash, 10s no-session timeout — the eternal spinner is impossible). Resend button with 60s cooldown.
- **b3_birth_state.sql executed + acceptance-verified** (per **D2**, re-ruled by Robert to Option A): `handle_new_user()` births `setup_completed = true, briefs_enabled = false` (SECURITY DEFINER + display-name COALESCE preserved); both reference test rows corrected; Robert's full row untouched. **Flip procedure** (documented in the file): promote = `access_tier='full', setup_completed=false` in ONE statement; `briefs_enabled` is never set by flip or wizard — the user's own Settings choice.
- **Email templates — the Same-Token Law.** Magic Link AND Confirm signup are **code-only**: `{{ .Token }}` + plain `{{ .SiteURL }}`, **no ConfirmationURL**. The link and the code are ONE single-use token; a scanner-clicked link kills the typed code (proven live twice at +1s/+2s). **Never reintroduce a tokened link into any auth email.** Live-confirmed July 28: Barracuda LinkProtect rewraps EVERY link in inbound mail — even our tokenless `{{ .SiteURL }}` (`linkprotect.cudasvc.com` wrapper observed in a delivered email). The scanner rides every message; only the linkless-token design survives it.
- **Supabase auth config:** Email OTP **length = 6** (was 8 — live-battery finding; the client blocks digits 7–8). Email OTP **Expiration: proven >66s live; the 3600 pin is still on Robert** (top open item).
- **Live battery results:** code factor PASS (stream account, 24s issue-to-verify); domain-gate 403 + honest screen PASS through the new login path (stream account, exception row deliberately deleted); **HEADLINE — terrascend work-inbox code sign-in PASS at 23:34:39 UTC** (the scanner got nothing to consume; 1m06s delta and still verified); full-tier eyeball PASS (Robert's app normal; one *expected* extra spinner beat at boot from TierRouter's profile fetch); **workstation persistence PASS** (July 28: managed work-laptop Chrome survives refresh and full browser restart — server-stamped).

## 2. Production state + open Robert items

Three accounts (Robert's standing rule: **always name the machine, browser, and exact address** — he runs work machines behind the corporate firewall plus a personal computer outside it):

| Address | What it is |
|---|---|
| `racoursey@gmail.com` | Robert's operator account — full tier; the ONLY row in `access_exceptions` |
| `rcoursey@terrascend.com` | Reference test rig — passes the domain gate natively |
| `racoursey.stream@gmail.com` | Reference test rig — currently 403-everywhere **by design** (no exception row); a standing live probe of the gate |

Robert ended the night **signed out** on his personal browser — the next FundLens open asks for a code once (`racoursey@gmail.com`); expected, not a defect.

**Open on Robert, in order:**
1. **Email OTP Expiration — CONFIRMED already 3600 (July 28, Robert read it from the dashboard):** codes live one hour, matching the email copy and comfortably past his ≥5-minute ruling. The 60-second countdown in the UI is the resend cooldown only — its relabel is polish element #1. Nothing to change in config.
2. **Test-account disposition ruling** (recommendation: keep both as standing rigs).
3. **Workstation session-persistence test — DONE, PASS (July 28, 19:18 UTC):** managed work-laptop Chrome (behind the firewall) held the session across a page refresh AND a full browser close-and-reopen; fresh code sign-in server-stamped. Coworkers on standard work laptops sign in once per machine. Best remaining explanation for the S-B2 19:37 no-session mystery: the old link/redirect path's fragility, which B3 removed. Caveat: one machine, one profile — a rollout outlier would mean per-machine policy, not the app.
4. **Old dead-link check — CLOSED (July 28) with a twist:** signed-in clicks land gracefully on Funds (session absorbs stale links — correct). The copied "dead link" turned out to be the new email's tokenless `{{ .SiteURL }}` footer link, Barracuda-wrapped — which correctly sends a signed-out visitor to the login page. The genuine dead-TOKEN render check moves to Clyde's polish-wave Evidence Gate as a 60-second local repro (`/auth/callback` with `#error=otp_expired`), which also decides where the new dead-link notice belongs (callback page vs login-page hash handling). The eternal spinner remains impossible by construction (10s timeout floor).

## 3. The B4 docket (priority order)

0. **FIRST ACT: condense `/areas/fundlens.md`** — it is at its byte cap. Collapse closed-milestone play-by-play (S-B2 progress entries, the B3 build/amendment sequence) into short summaries. Preserve verbatim-in-substance: all standing laws, all rulings, the working-with-Robert rules, and every open item in this handoff.
1. **Clyde's first wave = two one-file commits.** (a) **Commit this handoff** to the repo root as `FUNDLENS_B4_HANDOFF.md`, content supplied verbatim in Fabio's order — *standing process fix (Robert, July 28): session handoffs are committed by Clyde at every session boundary; Robert never hand-uploads documents; Fabio's repo access stays read-only by design (verifier independence).* (b) **Pre-launch Login.tsx polish (ratified copy findings from operator testing):** resend label → "Resend available in Xs" (the countdown reads like a code fuse — the operator himself misread it); add helper line "your code stays valid for an hour"; restore a sign-in verb to the CTA (the rename to "Email me a code" removed the words "sign in" from the page's only action — the operator couldn't find how to sign in); and a **dead-link notice** — Evidence Gate must include the local repro (`/auth/callback` with `#error=otp_expired`, signed out) to trace where such visitors land, then add one line there: "That sign-in link was already used or expired — request a fresh code."
2. **B4 assignment draft** per plan §B4 (Holdings/Sectors tabs, provenance stamps, money-market special case), absorbing:
   - **Robert's chart-forward steer:** full-color *composition* visuals — sector allocation charts, holdings views. Colors show what a fund IS, never whether it's good; verdict surfaces (scores, tiers, thesis, Briefs) stay full-tier-only, permanently, per his ruling.
   - **Grid finding F1:** money markets ADAXX/FDRXX show "Highly Concentrated" — true HHI, wrong message on the plan's safest funds; extend the B4 money-market special case back into the grid's concentration cell.
   - **F2:** grid as-of falls back to `scored_at` when `report_date` is null, so the *emptiest* rows (ADAXX/FDRXX/FSPGX) look the *freshest* — show a dash instead.
   - **F3 (Robert ruling at planning):** cash-sweep vehicles render as top holdings (VADFX "Invesco Private Prime Fund", MWTSX/TGEPX "TCW Central Cash Fund", DRRYX Dreyfus MM) — filing-true, layperson-misleading; context vs leave-as-filed.
   - **F4:** CEMEX renders the literal string "N/A" as a holding name — treat as null.
3. **FSPGX has no holdings data at all** — read-only connector look at its holdings/dossier rows (pipeline gap).
4. **FOLLOWUPS.md at next touch:** `auth.ts` header narration + `signInWithMagicLink` naming (stale post-template); as-filed name-casing cosmetics; the junk-signup sweep mechanism (never-completed-login or non-domain rows; periodic read-only query + dashboard delete — preferred over validation emails).
5. **Standing B8 ledger (unchanged):** allowlist-tighten reference `PUT /api/profile` (briefs_enabled/selected_fund_ids reference-writable); reference `GET /api/profile` weight read-strip; `allocation_history` permissive insert policy audit; `regenerateBriefsForAllUsers` removal candidate; TierRouter/ProtectedRoute double profile fetch dedupe; client OTP-length tolerance or config assertion.

## 4. Boot notes — next Clyde

- Lane A stands: Clyde builds, Robert merges and executes, Fabio verifies and holds design authority. Evidence Gate before any write. One file per commit. **v8 Protection Law:** never touch `regime*`, `race*`, `race-boot*`, `french*`, `contenders/`; `types.ts`/`cron.ts` only with Fabio's mandatory v8-section diff review.
- First wave: two one-file commits per docket item 1 — commit this handoff to the repo root, then the Login.tsx polish (small, exact, copy already ruled). Then wait for the ratified B4 assignment; do not start B4 early.
- Environment notes: fresh containers need `npm ci` before `tsc --noEmit`; server is Express 4 (`supaFetch` never throws — keep that contract); `reference-shape.ts` is the artifact HR/legal reads — completeness and plain comments matter.
- Your B3 execution was exact throughout; both order gaps this session were Fabio's, caught by his own sweeps. Keep refusing to guess at wording that hasn't reached you — that discipline saved the wave twice.

## 5. Boot notes — next Fabio

- **Boot sequence:** read `/areas/fundlens.md` (condense first — at cap), clone `racoursey-cloud/fundlens-v6`, read plan §B4 and this handoff.
- **Working with Robert (hard-won, tonight's additions in caps):** one instruction at a time, plain words, no branching menus; **NAME THE MACHINE, BROWSER, AND EMAIL ADDRESS in every instruction** — "you / your browser" is never specific enough; **NEVER MAKE HIM SCROLL — re-paste blocks fresh every time**; paste immutability (ask whether a paste was sent before revising); relay gaps are cured by re-supply, nobody hunts for fault; verify every relay claim repo-side or DB-side before acting on it.
- **Verification patterns that worked tonight:** server-side stamps settle disputes (`auth.users.last_sign_in_at`; `recovery_sent_at` → sign-in deltas prove code-entry timing; note `audit_log_entries` records **completed sign-ins only**, not OTP issuance — don't over-read its silence); run a residual-language sweep after any copy change (the grep caught the button label my own order missed); independent `tsc` + build at every PR head, never trusted from report.
- **The Same-Token Law is permanent.** And remember the operator IS the first user: all four UX findings tonight came from Robert stumbling honestly — treat his confusion as data, never as noise.

## 6. Paste-ready boot prompts

**Next Fabio** (paste into a fresh chat):

> Fresh-Fabio boot — FundLens reference tier (v7 lineage), B4 planning. Read /areas/fundlens.md (condense it first — it is at its size cap), clone racoursey-cloud/fundlens-v6, read B_REFERENCE_TIER_PLAN.md §B4 and FUNDLENS_B4_HANDOFF.md (attached to this message; Clyde commits it to the repo root in his first wave — from then on every handoff lives in the clone). Lane A stands. Jobs in order: walk me through the OTP-expiration pin, order Clyde's Login polish commit, take my test-account ruling, then draft the B4 assignment — chart-forward, absorbing the four grid findings and the F3 ruling — for my ratification. One deliverable per session.

**Next Clyde** (paste into a fresh Claude Code session, after Fabio issues the ratified polish order):

> Clyde boot — FundLens reference tier (v7 lineage), pre-launch Login polish per the ratified order below; then stand by for the B4 assignment. Evidence Gate first: read the named files, state findings, get Robert's confirm before writing. One file per commit; v8 Protection Law in force; Fabio reviews pre-merge. [paste Fabio's ratified order]

---
*B3 shipped honest: the scanner lost, the rows tell the truth, and the tier shows facts a coworker can actually use. — Fabio*
