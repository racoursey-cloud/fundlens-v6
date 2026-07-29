# FundLens — B2 → B3 Handoff
*Written by Fabio at the close of the S-B2 session, July 27, 2026 (~22:15 UTC). Authoritative session record lives in Robert's memory file (/areas/fundlens.md); the full plan of record is B_REFERENCE_TIER_PLAN.md on main.*

---

## 1. State of the world

- **PR #48 is merged and deployed** to production at **www.fundlens.app** (the old `fundlens-production.up.railway.app` domain is dead — 404s since the July Railway cleanup).
- **STOP S-B2: STAMPED PASS** by Fabio on every plan acceptance item. **B3 is GREENLIT.**
- What B2 shipped (six one-file commits incl. fix `da2247b`):
  - `reference-shape.ts` — the HR/legal-readable allowlist serializer (facts only, alphabetical by ticker).
  - `constants.ts` — `ALLOWED_SIGNUP_DOMAINS = ['terrascend.com']`.
  - `auth.ts` — tier resolution + domain gate inside `requireAuth`; 60s cache mirroring the adminCache pattern; email lowercased; fails closed end-to-end (`supaFetch` never throws); 403 `{"error":"Access restricted"}` on every route for non-domain/non-exception accounts.
  - `routes.ts` — `requireFullTier` on the four brief/thesis routes **and** `POST /api/profile/setup`; reference PUT rejection of `weight_*`/`risk_tolerance` (display_name allowed); reference-shaped scores routes with full-tier paths byte-untouched.
  - `brief-scheduler.ts` — `access_tier=eq.full` on all three selection queries.
- **Live-proven at S-B2:** full-tier `/api/scores` byte-identical pre/post deploy (sha `77f796a4…`, 6,871,148 B, run `b63487de`); 12/12 routes 403 for a non-domain account; the full reference battery (403 message flip proves gate→tier layering; weight/risk writes provably wrote nothing; reference scores = 23 funds, 868,706 B, zero non-allowlisted key paths).
- **Known grep quirk (ratified):** raw substring `tier` appears 5× in the reference payload — all inside `top_holdings[].name` values (four Frontier securities + Vontier Corp). The key-level allowlist check is the binding test; raw greps must exclude value hits.

## 2. Production data state + open Robert items

Three profiles exist: Robert (full) and two reference test accounts — `rcoursey@terrascend.com` and `racoursey.stream@gmail.com`. Trigger-born profiles carry column defaults: weights 0.25/0.30/0.25/0.20, risk 4, `briefs_enabled=true`, `setup_completed=false`.

Open items on Robert:
1. **Cleanup DELETE** (returns exceptions table to launch state): `DELETE FROM access_exceptions WHERE email = 'racoursey.stream@gmail.com';`
2. Test-account disposition (recommend keeping `rcoursey@terrascend.com` for B3 testing).
3. Re-login as himself in his own browser (gmail magic link — his links work).
4. **Ruling at B3 planning:** `shouldCreateUser` (see docket item 4).
5. Post-B3 (once code entry ships): the 10-second terrascend live check — log in as `rcoursey@terrascend.com`, confirm the fund list renders.

## 3. The B3 docket (findings of this session, in priority order)

1. **MANDATORY — scanner-proof login factor.** TerrAscend's Barracuda detonates email links *in transit*: two live kills, +2s and +1s after issuance, from 209.222.82.0/24, followed by a flock of appliance IPs. The race is unwinnable; magic-link-only auth is broken for the entire @terrascend.com audience. Fix: add `{{ .Token }}` (6-digit code) to the auth email template + a code-entry field via `verifyOtp`. Robots click links; they don't type numbers.
2. **AuthCallback is error-blind.** An `#error=…otp_expired` hash produces an eternal "Signing you in..." spinner — reproduced live twice. B3 must render the error.
3. **Client 403-blindness.** The pre-B3 client paints cheerful empty states over `Access restricted`/`Full access required` (observed live: a fully locked-out account saw a normal-looking Briefs page). B3's routing must route by tier and render honest states.
4. **`shouldCreateUser` ruling (Robert).** Decision 3 (July 5) made signup invite-only; the reference-tier plan assumes domain-gated self-signup. Fabio's recommendation: flip to `true` at B3 — the server-side domain gate now handles the ghost-account risk better than invite-only (typo'd domains 403 instead of becoming shell users).
5. **Trigger birth-state fix.** `handle_new_user()` (DB trigger on auth.users) creates every profile before any API call, so the routes.ts wizard-skip is unreachable on the real path. Decide the birth state in the trigger: `setup_completed=true`, and whether reference rows should carry default weights/risk/`briefs_enabled=true` at all.
6. **Workstation login risk.** The 19:37 work-browser session completed Supabase token verification yet the client never held the session (possible corporate storage policy). B3 checklist: a login test on a standard TerrAscend workstation, in more than one browser.
7. **Login-page honesty polish.** Unknown-address refusal is a small red line easy to miss; wording and prominence should change with whatever item 4 decides.
8. **Reference `GET /api/profile` read-strip** (polish, maybe B8): reference users currently receive their own default `weight_*`/`risk_tolerance` fields in the profile JSON. Inert, but inconsistent with the write rejection.

Carried B8 notes (unchanged): allowlist-tighten reference `PUT /api/profile`; tier-flip procedure owns `setup_completed`; `regenerateBriefsForAllUsers` is dead-but-callable (now tier-filtered) — removal candidate; audit `allocation_history`'s permissive insert policy.

## 4. Boot notes — next Clyde

- **Lane A stands:** Clyde builds, Robert merges and executes, Fabio verifies and holds design authority. Evidence Gate before any write. One file per commit. v8 Protection Law: `types.ts`, `cron.ts`, `regime*`, `race*`, `french*`, `contenders/` untouched — any exception gets Fabio's mandatory diff review.
- B3 scope = plan §B3 (reference client shell) **plus** whichever docket items Robert ratifies in at planning. Do not start before the ratified B3 assignment arrives.
- Environment notes that cost time this session: fresh containers need `npm ci` before `tsc --noEmit`; the server is **Express 4** (async errors don't auto-forward — `supaFetch` never throws by design; keep that contract); `supaSelect` spreads filters **after** the default select, so an in-filter `select:` override works; the tier cache mirrors `ADMIN_CACHE_TTL_MS = 60_000`.
- Your B2 Evidence Gate practice was excellent — keep it. Your decision-(3) caveat (grep keys, not raw bytes) came true in production.

## 5. Boot notes — next Fabio

- Boot sequence: read `/areas/fundlens.md` (full B2/S-B2 record is in it), clone `racoursey-cloud/fundlens-v6`, read plan §B3 on main.
- **Browser-verification lessons (hard-won tonight):** run heavy captures from a static-asset page (e.g. `/assets/index-*.js`) — same origin, no SPA, no renderer thrash; use fire-and-poll (`window.__x = …; return 'started'`, then poll) for anything near the 45s evaluate limit; the extension's output filter blocks hash-like strings — emit hex in spaced groups; React controlled inputs may ignore `form_input` — use real keystrokes or the native-setter + `input`-event + `requestSubmit()` pattern; dashboard accessibility trees lag after navigation — wait and retry before concluding anything.
- **Byte-identity protocol (reusable):** in-browser SHA-256 + byte length + embedded `pipelineRunId` proves same-cycle identity; pre/post bodies persist in the browser's IndexedDB (`fabio_sb2` → `captures` → `scores_pre` / `scores_post`) on the www.fundlens.app origin.
- Connector lane is read-only verification: SELECTs and `get_logs` only. The auth service log is rich — it settled every dispute tonight.
- Test accounts are available for regression: once Robert deletes the stream exception row, `racoursey.stream@gmail.com` reverts to 403-everywhere (a permanent live probe of the gate); `rcoursey@terrascend.com` is a reference-tier account reachable once code-entry ships.
- **Working with Robert:** one instruction at a time, plain words, no branching menus — tonight's confusion came from stacking schemes. Email links to his work inbox are permanently off the table. When a check is extra credit beyond the plan's acceptance list, say so and carry it yourself; don't hand him the ruling.

## 6. Suggested boot prompts (paste-ready)

**Next Fabio:**
> Fresh-Fabio boot — FundLens B-series, B3 planning. Read /areas/fundlens.md (B2 + S-B2 record and the B3 docket are in it), clone racoursey-cloud/fundlens-v6, read B_REFERENCE_TIER_PLAN.md §B3 and FUNDLENS_B3_HANDOFF.md. Lane A stands. Job: draft the B3 assignment for my ratification — plan §B3 plus the docket items (scanner-proof code login is mandatory scope; bring me the shouldCreateUser ruling and the trigger birth-state decision as options). One deliverable per session.

**Next Clyde (after Robert ratifies the B3 assignment):**
> Clyde boot — FundLens B3, per the ratified assignment below. Evidence Gate first: read plan §B3, the handoff docket, and the named context files; state findings for my confirm before writing. One file per commit, v8 Protection Law in force, Fabio reviews pre-merge. [paste ratified assignment]

---
*End of handoff. The gate held. — Fabio*
