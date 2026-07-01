# FundLens v7 — Founding Document

**Date:** July 1, 2026
**Owner:** Robert Coursey (racoursey-cloud)
**Status:** Authoritative. Every v7 session cites this document. Supersedes FUNDLENS_SPEC.md as product direction; the old spec remains the math reference for any parked engine that returns.

---

## 1. What FundLens v7 Is

**One big thing:** FundLens is a lens, not an oracle. It helps a 401(k) participant *understand* the funds they can choose — what each fund actually holds, what it costs, and how it behaves — with verified data and honestly displayed gaps.

**Why it matters:** Participants get a fund name, an expense ratio, and an unread prospectus. FundLens shows them the actual companies inside each fund, in a form a human enjoys using. That has standalone value with zero recommendations attached (Robert, Session 24).

**What changed from v6:** Recommendations (scoring, tiers, Kelly allocation, Briefs) move from the core to an optional, parked layer. The core is now the data — acquired, verified, classified, and displayed.

---

## 2. Founding Principles

These are citable rules. Sessions reference them by number.

1. **Worst-input rule.** Output can never be more trustworthy than its worst input. Silent gaps are worse than visible failures.
2. **No fake neutrality.** A fund with insufficient data is *excluded with a stated reason* ("41% of NAV unresolved — not rated"), never given a neutral placeholder score. (Lesson of v6 BUG-4: seven silently dropped funds were "fixed" with fabricated 50s.)
3. **One source of truth.** No math or constants exist in two places. Client displays consume server-computed values or server-served constants. (Lesson of the v6 client allocation drift.)
4. **Everything carries a date.** Every fund displays its holdings as-of date. Filed holdings are 1–5 months stale by law of physics (NPORT-P is quarterly with up to 60-day lag); the UI never hides this.
5. **Two eyes.** Filed holdings are the *anatomy* (precise, slow). Returns-based analysis is the *pulse* (approximate, daily). When they diverge, the divergence is displayed as information, not suppressed.
6. **Understanding over directives.** The product's verb is *understand*. Any future recommendation layer ships only with attorney-reviewed framing and language.
7. **Scorekeeping.** Any feature that implies action (themes, regime flags, future recommendations) logs its calls and is graded against having done nothing.

**House rules carried over from v5/v6 (unchanged):**
- All Claude API calls in engine code are sequential with delays per `PIPELINE.CLAUDE_CALL_DELAY_MS`. Never `Promise.all()` for Claude calls.
- One file per commit for code changes. *Amendment for the PR era (pending Robert's approval):* bulk file *moves/renames* with no content changes may share one commit; deletions remain one per commit.
- Env var names are frozen exactly as they exist in Railway. Do not rename any env var.
- Robert reviews and merges every PR. Nothing reaches `main` without his click.

---

## 3. Architecture — The Model of Models

```
Layer 0  ACQUISITION   acquireFund(ticker) → Fund Dossier + Coverage Scorecard
Layer 1  ANATOMY       holdings classified: sectors (existing) + themes (new)
Layer 2  PULSE         returns-based verification vs. theme proxies (new)
Layer 3  EXPLORER      fund cards, donuts, drill-downs, fee X-ray, overlap detector
────────────────────────────────────────────────────────────────────
PARKED   scoring · allocation · tiers · Briefs · regime engine
```

### Layer 0 — Acquisition (the Fund Dossier)
A single entry point, `acquireFund(ticker)`, orchestrating the existing engine files (edgar, cusip, fmp, tiingo, finnhub, holdings) and returning a **Dossier**: identity (SEC-verified name, CIK, series ID), expenses (net ER, 12b-1, source), holdings (resolved tickers, weights, as-of date), classifications, 12 months of NAV history, and a **Coverage Scorecard**.

**Draft pass thresholds (Robert approves/adjusts in Session A2):**
- ≥ 90% of NAV resolved to identified securities
- ≥ 95% of resolved NAV classified (sector level)
- ≥ 240 trading days of NAV history
- Expense ratio present with a named source
- Special cases: money market funds pass on identity + expenses + NAV alone (no N-PORT holdings); fund-of-funds pass via look-through coverage of underlying funds.

A fund that fails is **Not Rated — reason shown** (Principle 2). The 22-fund scoreboard (funds × coverage metrics) is the project's progress tracker: sessions are "make WFPRX pass," not "work on FundLens."

### Layer 1 — Anatomy (sectors + themes)
Sector classification exists (classify.ts, Haiku, pre-gates, Supabase cache). v7 adds a **theme pass**: additional labels per resolved holding (defense, energy production, rate duration, dollar sensitivity, etc.). A holding can carry multiple themes. Aggregation is the same position-weighted rollup the sector donuts use. Theme taxonomy defined in its own session.

### Layer 2 — Pulse (returns-based verification)
Sharpe-style returns-based analysis: regress each fund's daily NAV returns (already pulled from Tiingo) against a small set of theme-proxy series. Output per fund: *does this fund still trade like its filing says?* Agreement → confidence badge. Divergence → displayed flag ("filing shows 2% energy; recent behavior resembles ~8% — manager may be repositioning"). This is the daily-fresh second eye that compensates for quarterly filings (Principle 5).

### Layer 3 — Explorer (the product)
- **Fund card:** plain-English identity, dollars-not-percent cost, drawdown behavior, coverage badge, as-of date.
- **Donut + drill-down:** the existing FundLens tab experience, now with an honest "Not Classified" slice everywhere and theme views alongside sectors.
- **Fee X-ray:** "This fund costs ~$X/year on your balance; the index fund two rows down does the same job for ~$Y."
- **Overlap detector:** "Your three funds share N% of the same companies."

### Parked (not deleted from git history; removed from active code where dead)
Scoring/allocation/tiers/Briefs, and the regime/pivot engine. The regime engine remains a documented future direction for Robert's personal use; it consumes Layers 0–2 unchanged when/if built. Recommendations for others return only under Principle 6.

---

## 4. Keep / Park / Drop Manifest

**KEEP verbatim — the engine room** (carries Sessions 16–24 scar tissue: ISIN fallback, series verification, classification pre-gates):
`src/engine/edgar.ts`, `cusip.ts`, `classify.ts`, `fmp.ts`, `tiingo.ts`, `finnhub.ts`, `holdings.ts`, `constants.ts`, `types.ts`, `supabase.ts`, `cache.ts`, `persist.ts`, `monitor.ts`, `cron.ts` (schedule to be revisited), `rss.ts`, `fred.ts`.

**KEEP verbatim — infrastructure:**
`src/server.ts`, `src/engine/auth.ts`, `src/routes/routes.ts` (skeleton; parked routes pruned later), all `migrations/`, `seed_funds.sql`, Railway/Supabase/Resend wiring, client shell (`App.tsx`, `AppShell.tsx`, auth context, `api.ts`), `DonutChart.tsx`, `FundLens.tsx` (explorer seed), `Settings.tsx`, `Help.tsx` + help agent, `Pipeline.tsx`, `SetupWizard.tsx`, `Login.tsx`.

**PARK in place for now (still running; do not break the live site):**
`scoring.ts`, `allocation.ts` (server), `positioning.ts`, `thesis.ts`, `brief-engine.ts`, `brief-scheduler.ts`, `brief-email.ts`, `fund-summaries.ts`, `YourBrief.tsx`, `Research.tsx`, `client/src/engine/allocation.ts` (**known stale** — k-table, de minimis %, superseded cash sweep; fix or remove in A2, never edit the dead copy).

**DROP (dead code, zero imports in App.tsx / engine):**
`client/src/pages/Portfolio.tsx` (745 lines), `client/src/pages/Briefs.tsx` (799), `client/src/pages/Thesis.tsx`, `regenerateBriefsIfRiskChanged()` in `brief-scheduler.ts`.

**Root cleanup:** 24 session/handoff/assignment markdown files move to `docs/archive/v6/`. The repo root keeps: this document, README, BUGS.md, env.example, package files, Procfile.

---

## 5. Open Decisions (Robert)

1. **Dossier pass thresholds** — approve or adjust the draft numbers in §3 Layer 0.
2. **Brief cadence** — Session 24 wired Brief regeneration to every pipeline run; the cron makes that *daily Opus generation per user*. Keep, reduce, or park with the Brief layer?
3. **Commit-rule amendment** — approve the bulk-move exception in §2.
4. **Theme taxonomy** — reviewed and approved in its own session before Layer 1 work begins.

---

## 6. Build Order

- **A1 — Clean Slate:** delete dead code, archive root docs, commit this document. (Written; ready for Claude Code on the Web.)
- **A2 — Dossier Contract + Scorecard:** DOSSIER_CONTRACT.md, `acquireFund()` refactor behind existing pipeline, admin scoreboard endpoint + minimal view. Resolve the client allocation drift (fix or remove with its UI).
- **A3–A8 — Coverage passes:** fund-by-fund until 22/22 pass or are explained. Problem children (fund-of-funds, money markets, international-heavy) get dedicated sessions.
- **A9 — Theme taxonomy + classification pass.**
- **A10 — Pulse:** returns-based verification module + divergence flags.
- **A11+ — Explorer upgrades:** fund cards, fee X-ray, overlap detector.

Every session opens with a half-page briefing (what's new, why it matters, the one decision needed) and closes with the scoreboard.
