# FundLens Rebuild Plan
## Master Reference — Updated April 5, 2026 (through Session 9)

This document is the single source of truth for the FundLens rebuild. Every session should begin by reading this file. Do not deviate from decisions documented here without explicit approval from Robert.

---

## 1. WHAT FUNDLENS IS

FundLens is a 401(k) fund scoring and allocation platform for ~200 coworkers at TerrAscend. It evaluates the funds available in their retirement plan, scores them across multiple factors using financial data and AI-driven macro analysis, and recommends personalized allocations based on each user's risk tolerance and factor preferences.

**Target user:** The active 401(k) participant who wants to make informed allocation decisions — not a day trader, not a set-it-and-forget-it investor. Someone who reviews their portfolio quarterly and wants to understand why their funds are performing the way they are.

**Product positioning:** FundLens is the advisor that shows up. It proactively delivers a personalized Investment Brief every 30 days, even if the user forgets the platform exists. It democratizes the kind of analysis that institutional investors pay thousands for.

---

## 2. OWNER

Robert Coursey (racoursey-cloud), 61, Digital Support Specialist at TerrAscend. BBA from Georgia State. Not a developer — builds FundLens using Claude as engineering partner. Manages all code via GitHub web UI and Claude Code on the Web. No local development environment.

- GitHub: github.com/racoursey-cloud/fundlens
- Domain: fundlens.app (purchased, not yet connected)
- LinkedIn: https://www.linkedin.com/in/racoursey/

---

## 3. INFRASTRUCTURE

### Hosting & Database
| Service | Tier | Cost | Purpose |
|---------|------|------|---------|
| Railway | Hobby (upgrade to Pro if usage exceeds $15/mo) | $5/mo | Express server, serves React app, cron jobs |
| Supabase | Free now → Pro at rebuild deploy | $0 → $25/mo | Postgres database, PostgREST API (via supaFetch()), magic-link auth via Resend SMTP |
| GitHub | Free | $0 | Code repository |

### Development Workflow
Claude Code on the Web (included in Robert's Max plan at $100/mo):
1. Robert opens claude.ai/code
2. Selects racoursey-cloud/fundlens repo
3. Describes the task in plain English
4. Claude clones repo, makes changes, creates a Pull Request (PR)
5. Robert reviews the PR on GitHub
6. Robert merges → Railway auto-deploys

Fallback workflow (for planning sessions or complex architecture discussions):
1. Claude writes file in claude.ai chat session
2. Robert downloads via present_files
3. Robert uploads to GitHub via web UI
4. Railway auto-deploys

### Domain & SSL
Railway handles SSL certificates and custom domain configuration. Robert points DNS records from fundlens.app registrar to Railway's provided addresses.

---

## 4. SCORING MODEL

### Four Factors

| Factor | Weight | Data Source | What It Measures |
|--------|--------|-------------|-----------------|
| Cost Efficiency | 25% | SEC EDGAR (expense ratios) | How much the fund charges. Lower is better. The single strongest predictor of long-term fund performance per Morningstar/Vanguard research. |
| Holdings Quality | 30% | FMP Starter (company fundamentals) | Financial health of the companies inside the fund. Profitability, balance sheet strength, cash flow, earnings quality. 25+ financial ratios per company. |
| Positioning | 25% | RSS news feeds + FRED macro data + Claude AI thesis | Whether the fund's sector exposure aligns with current macro conditions. Forward-looking, thesis-driven. FundLens's unique differentiator. |
| Momentum | 20% | FMP or Tiingo (historical daily prices) | Recent price performance trends (3-12 month). Well-documented academic factor. Backward-looking confirmation signal. |

### Holdings Coverage
Dynamic threshold per fund:
- Walk down holdings by weight (largest first)
- Stop when cumulative weight reaches **65%** OR **50 holdings**, whichever comes first
- Concentrated active funds may hit 65% with ~20 holdings
- Broad index funds will cap at 50 holdings (~55-60% coverage)

### Weights Are Defaults, Not Fixed
Users can adjust factor weights via sliders in their profile. Defaults are 25/30/25/20. Changing weights triggers an instant client-side rescore (pure math, no API calls). Raw scores are the same for everyone.

### Risk Tolerance
Risk tolerance (set by user in profile) affects **allocation sizing only**, not scoring. Same scores, same rankings, different position sizes. The allocation engine uses **z-score thresholds** based on the Fundamental Law of Active Management (Grinold & Kahn):

| Risk Level | Z-Score Threshold | Effect |
|------------|-------------------|--------|
| Conservative | 0.0σ | Above-average funds only — bottom half excluded |
| Moderate | +0.5σ | Clearly above average — separating from the pack |
| Aggressive | +1.0σ | Statistical outliers — genuinely breaking away |

Funds scoring below the threshold are excluded entirely. Position sizes are proportional to (z - threshold) — the more statistically exceptional a fund, the larger its share of the 100% allocation. No artificial caps or floors.

---

## 5. DATA STACK

### Paid
| Source | Cost | Provides |
|--------|------|----------|
| FMP Starter | $19/mo | Company financials (income statements, balance sheets, cash flow, ratios), historical daily prices, financial news with sentiment |

### Free
| Source | Provides |
|--------|----------|
| SEC EDGAR (NPORT-P filings) | Complete fund holdings, expense ratios, fund metadata. The authoritative source — actual regulatory filings. |
| FRED | Macro economic indicators (GDP, unemployment, inflation, interest rates, yield curves) |
| OpenFIGI | CUSIP-to-ticker resolution for mapping EDGAR holdings to FMP company data |
| Claude API (Haiku) | Sector classification of holdings |
| Claude API (Sonnet) | Macro thesis generation |
| Claude API (Opus) | Investment Brief writing (upgraded from Sonnet in Session 3) |
| RSS News Feeds | Geopolitical and economic headlines for thesis context (see Section 6) |

### Dropped
| Source | Reason |
|--------|--------|
| GDELT | Unreliable — repeated connectivity failures. Replaced by RSS feeds. |
| Finnhub | Free tier rate limiting degraded data quality. FMP covers the same data. |
| Tiingo | **Test FMP first.** If FMP Starter returns clean daily NAV history for mutual fund tickers, drop Tiingo entirely and consolidate on FMP. Test in first rebuild session. |

---

## 6. NEWS SOURCES (RSS Feeds)

Five feeds, zero cost. Cached every 120 minutes. Pipeline pulls 15-20 most recent headlines from each feed (75-100 headlines total per run).

| Feed | URL Pattern | Purpose |
|------|-------------|---------|
| Reuters Business/Markets | reuters.com RSS | Global wire service. First to report market-moving events worldwide. |
| CNBC Economy | cnbc.com/id/20910258/device/rss/rss.html | US economic conditions, Fed coverage, labor market, inflation. Most-consumed US financial news source. |
| CNBC World | cnbc.com/id/100727362/device/rss/rss.html | Geopolitical events, trade policy, international markets. Would have caught the Iran/gold story early. |
| AP News | ap.org RSS | Breaking non-financial events that move markets — wars, disasters, political crises, elections. |
| Federal Reserve Press Releases | federalreserve.gov RSS | Direct from the source on monetary policy. No interpretation — Claude reads the actual Fed statements. |

### How News Feeds into the Model
1. Pipeline fetches cached headlines (refreshed every 120 min)
2. Headlines are passed to Claude alongside FRED macro data
3. Claude generates the macro thesis: "Here's the state of the world and what it means for sector positioning"
4. Thesis drives the Positioning factor (25% of score)
5. Same headlines + thesis feed into the Investment Brief narrative

---

## 7. THE INVESTMENT BRIEF

### What It Is
A personalized, monthly research document delivered to each user. Modeled after what a high-end institutional advisor would produce for a client. Not a sales pitch — a research analyst's report.

### Naming
"Investment Brief" — not "letter," not "report." Professional, concise, implies actionable analysis.

### Delivery
- **Automatic:** Sent via email (Resend SMTP, already configured) every 30 days after user signup
- **On-demand:** User can generate a new Brief anytime from the app
- **History:** All past Briefs are archived and viewable in the app, creating a record of how recommendations evolved over time

### Content Structure
1. **Macro Environment Summary** — What's happening in the economy and markets right now (driven by RSS headlines + FRED data)
2. **Thesis & Sector Views** — What sectors are favorable, which are not, and why (Claude's macro thesis)
3. **Fund-by-Fund Highlights** — Top scorers, biggest movers, specific holdings driving scores
4. **Allocation Recommendation** — Personalized to user's risk tolerance and factor weights

### Personalization Architecture (Two Layers)

**Layer 1 — Data Packet (what Claude receives as input):**
Before Claude writes a word, the system assembles a structured factual dossier for each user:
- Fund raw scores on all four factors
- Top holdings and their financial metrics
- Which sectors the fund is heavy in
- User's risk tolerance and factor weights
- **Pre-computed relevance tags:** For each fund in the recommended allocation, the engine identifies which specific data points align with this user's investment posture

Example: Fund XYZ holds 15% precious metals and 20% healthcare.
- Conservative user's data packet tags: healthcare (defensive positioning), low expense ratio
- Aggressive user's data packet tags: precious metals (geopolitical thesis alignment), positive momentum

Both sets of tags are factually true. The system selects which truths are most relevant to each user.

**Layer 2 — System Prompt (editorial policy):**
A versioned, reviewed file in the codebase (like a CLAUDE.md for the Brief). The editorial policy of FundLens:
- Every claim must trace to a specific data point in the input packet
- Never characterize a fund positively without citing the metric
- Never omit a material negative — if a fund scores poorly on a factor, say so regardless of user profile
- Personalization means selecting which truths to emphasize, not altering the truth
- If no data points align with the user's profile for a given fund, state merits neutrally without manufacturing relevance
- Never use language that implies certainty about future performance
- Tone is research analyst, not sales
- The Brief answers: "Given who you are and what you care about, here's why this fund matters to you — or doesn't"

### What the Brief Never Does
- Invents a reason to own a fund
- Hides a negative to make a fund look better
- Changes tone to match risk tolerance (conservative users don't get cautious language, aggressive users don't get hype)
- Implies certainty about future performance
- "Sells" the user's own preferences back to them

---

## 8. PIPELINE

### Trigger Modes
- **Scheduled:** Runs automatically (frequency TBD — nightly or weekly) to keep scores fresh
- **On-demand:** User can trigger a fresh run from the app
- **Brief generation:** Separate scheduled job checks daily for users whose 30-day window is up

### Pipeline Steps (Rebuild)
1. Fetch fund list from Supabase (user's 401k menu)
2. Fetch NPORT-P holdings from EDGAR for each fund
3. Resolve CUSIPs to tickers via OpenFIGI
4. Fetch company fundamentals from FMP for each holding (sequential, with delays)
5. Classify holdings into sectors via Claude Haiku (sequential, 1.2s delays, cached in Supabase)
6. Score Holdings Quality factor (25+ ratios, weighted by holding position size)
7. Score Cost Efficiency factor (expense ratio relative to category peers)
8. Fetch momentum data (FMP or Tiingo) for each fund
9. Score Momentum factor (cross-sectional ranking)
10. Fetch cached RSS headlines + FRED macro data
11. Generate macro thesis via Claude Sonnet (determines sector preferences)
12. Score Positioning factor (fund sector exposure vs. thesis preferences)
13. Compute composite scores (raw, before user weighting)
14. Persist all scores and metadata to Supabase
15. (If Brief triggered) Generate personalized Investment Brief per user via Claude Opus

### Mandatory Rules (Carried Forward)
- **TINNGO_KEY** typo is intentional — never correct or mention it
- **Claude model constants:** Haiku `claude-haiku-4-5-20251001` (CLAUDE_MODEL for classification), Sonnet (THESIS_MODEL for macro thesis), Opus `claude-opus-4-20250514` (BRIEF_MODEL for Investment Briefs)
- **All Claude API calls:** Sequential with 1.2s delays. **NEVER Promise.all()** — has crashed production 5+ times
- **All Claude calls** route through /api/claude proxy
- **All Supabase calls** route through /api/supabase via supaFetch()
- **No localStorage** in engine files

---

## 9. UI

### What Carries Forward From v5.1
- Dark theme: bg #0e0f11, surface #16181c, borders #25282e, accent blue #3b82f6
- Inter + JetBrains Mono fonts
- SVG-only charts (no canvas, no third-party chart libraries)
- Setup wizard flow (onboarding)
- Two-donut Portfolio view (sector exposure + fund allocation)
- Fund detail sidebar (420px slide-in)
- Factor weight sliders with proportional redistribution
- Risk tolerance slider
- Magic link auth via Resend

### New in Rebuild
- Investment Brief tab (current + historical Briefs)
- Brief history archive
- Pipeline status indicator (when scores were last updated)
- Proper component library (instead of inline styles)

---

## 10. TECHNOLOGY

### Rebuild Stack
- **Server:** Express (Node.js) on Railway — TypeScript
- **Client:** React SPA built with Vite — TypeScript
- **Database:** Supabase Postgres via PostgREST (supaFetch pattern)
- **Auth:** Supabase magic link (only part using Supabase JS client directly)
- **Email:** Resend SMTP (auth links + Investment Brief delivery)
- **AI:** Claude API (Haiku for sector classification, Sonnet for macro thesis, Opus for Investment Briefs)

### Architecture Principle
Server-side scoring engine. The pipeline runs on the server, not in the browser. The React client is a display layer that reads scores from Supabase and applies user-specific weighting client-side.

This means a mobile app (React Native, later) can consume the same API without rebuilding the engine.

---

## 11. BUDGET

| Item | Monthly Cost |
|------|-------------|
| Claude Max subscription | $100 |
| Claude API (Haiku + Sonnet for engine) | ~$5-15 |
| FMP Starter | $19 |
| Railway | $5-20 |
| Supabase Pro (at rebuild deploy) | $25 |
| Domain (fundlens.app) | ~$1 |
| **Total** | **~$155-180** |
| **Budget cap** | **$250** |
| **Headroom** | **$70-95/mo** for college football portal and future projects |

---

## 12. SESSION PLAN

### Phase 1 — Server Engine (Sessions 1-4)

**Session 1: Foundation + Data Validation**
- Set up TypeScript project structure
- Test FMP Starter with mutual fund tickers (determines if Tiingo is needed)
- Test all 5 RSS feed URLs, verify parsing
- Build constants file with all v5.1 thresholds, factor weights, API endpoints
- Build the Editorial Policy prompt file for Investment Brief generation

**Session 2: Holdings Pipeline**
- EDGAR NPORT-P parser (all holdings, not just top 15)
- OpenFIGI CUSIP resolver
- Dynamic 65%/50-holding cutoff logic
- Fund-of-funds look-through (carry forward A15 Phase 2 work)
- Supabase schema for holdings cache

**Session 3: Scoring Engine**
- Cost Efficiency factor (expense ratio scoring curve, relative to category)
- Holdings Quality factor (FMP fundamentals, 25+ ratios, weighted by position size)
- Momentum factor (historical price data, cross-sectional ranking)
- Composite scoring with configurable weights

**Session 4: Thesis + Positioning**
- RSS feed fetcher with 120-minute cache
- FRED macro data integration
- Claude Sonnet macro thesis generation (with news context)
- Positioning factor (sector alignment scoring)
- Full pipeline orchestration (steps 1-14 from Section 8)

### Phase 2 — Data Layer + Brief (Sessions 5-7)

**Session 5: Database Schema + API**
- Clean Supabase schema (no v4 legacy columns)
- Express API routes for scores, funds, user preferences
- User profile (risk tolerance, factor weights, signup date for Brief scheduling)
- Supabase Row Level Security policies

**Session 6: Investment Brief Engine**
- Per-user data packet assembly (relevance tagging)
- Claude Sonnet Brief generation with Editorial Policy prompt
- Brief storage in Supabase (history archive)
- Email delivery via Resend (30-day scheduling logic)

**Session 7: Pipeline Scheduling + Monitoring**
- Cron job configuration on Railway
- Pipeline status tracking (last run, success/failure, data quality metrics)
- Brief delivery scheduler (check daily for users at 30-day mark)
- Error handling and retry logic

### Phase 3 — Web UI (Sessions 8-11)

**Session 8: Auth + Shell + Wizard**
- Magic link auth flow (carry forward working pattern)
- AppShell with navigation
- Setup wizard (fund selection, risk tolerance, factor weights)

**Session 9: Portfolio + Fund Detail**
- Portfolio view (two SVG donuts, ranked fund table)
- Factor weight sliders with client-side rescore
- Risk tolerance slider
- Fund detail sidebar (sector donut, AI reasoning, holdings breakdown)

**Session 10: Investment Brief UI**
- Current Brief display
- Brief history archive (list of past Briefs, click to view)
- On-demand Brief generation trigger
- "Run Pipeline Now" button with status indicator

**Session 11: Polish + Deploy**
- Component cleanup, consistent styling
- Responsive layout
- Error states, loading states, empty states
- Connect fundlens.app domain
- Upgrade Supabase to Pro
- Production deployment and validation

### Phase 4 — Refinement (Sessions 12-15)

**Session 12: Validation + Tuning**
- Run pipeline against real fund menu
- Validate scores make intuitive sense
- Tune factor scoring curves if needed
- Test Investment Brief quality across risk tolerance levels

**Sessions 13-15: Buffer**
- Bug fixes from real-world usage
- UI tweaks based on Robert's feedback
- Performance optimization
- Mobile-readiness preparation
- Documentation

---

## 13. WHAT'S DEFERRED

| Item | Notes |
|------|-------|
| College football portal | Build FundLens standalone first. Extract shared platform patterns later. |
| Mobile app (React Native) | Server-side engine architecture makes this a UI-only exercise later. |
| SIC code integration | Could replace Claude Haiku sector classification with ~1000 granular industry codes from EDGAR. Revisit if classification API costs become a concern. |
| Additional data sources | FMP Starter is sufficient. No need for Premium/Ultimate or additional providers. |

---

## 14. FILES TO UPLOAD / DELETE

### Awaiting Upload (Session 11)
- `AppShell.tsx` → client/src/components/ (updated — responsive layout)
- `ErrorBoundary.tsx` → client/src/components/ (new)
- `App.tsx` → client/src/ (updated — ErrorBoundary wrapper)
- `main.tsx` → client/src/ (updated — pulse animation, error toast)

### Previously Uploaded (Sessions 1-9) — All on GitHub
- Session 1: package.json, tsconfig.json, Procfile, env.example, src/server.ts, src/engine/constants.ts, src/prompts/editorial-policy.md
- Session 2: src/engine/types.ts, edgar.ts, cusip.ts, holdings.ts
- Session 3: src/engine/fmp.ts, cost-efficiency.ts, quality.ts, momentum.ts, scoring.ts
- Session 4: src/engine/rss.ts, fred.ts, thesis.ts, positioning.ts, classify.ts, pipeline.ts
- Session 5: src/services/supabase.ts, src/middleware/auth.ts, src/routes/routes.ts, src/engine/persist.ts, types.ts (updated), server.ts (updated), env.example (updated)
- Session 6: src/engine/brief-engine.ts, brief-email.ts, brief-scheduler.ts, src/routes/routes.ts (updated)
- Session 7: src/engine/monitor.ts, src/server.ts (updated with cron jobs), package.json (updated)
- Session 8: client/package.json, client/tsconfig.json, client/vite.config.ts, client/index.html, client/src/vite-env.d.ts, client/src/auth.ts, client/src/api.ts, client/src/theme.ts, client/src/main.tsx, client/src/App.tsx, client/src/context/AuthContext.tsx, client/src/components/AppShell.tsx, client/src/components/ProtectedRoute.tsx, client/src/pages/Login.tsx, client/src/pages/SetupWizard.tsx, client/src/pages/AuthCallback.tsx, client/src/pages/Portfolio.tsx (placeholder), client/src/pages/BriefsPlaceholder.tsx, client/src/pages/PipelinePlaceholder.tsx, src/server.ts (updated — static file serving), package.json (updated — build script), src/engine/cusip.ts (rewritten — FMP replaces OpenFIGI), src/engine/constants.ts (updated — removed OPENFIGI), src/engine/holdings.ts (updated), src/engine/pipeline.ts (updated), src/engine/types.ts (updated — removed FigiMappingJob/FigiResult), env.example (updated — removed OPENFIGI_API_KEY)
- Session 9: client/src/pages/Portfolio.tsx (full implementation), client/src/components/FundDetail.tsx (new)
- Session 10: client/src/pages/Briefs.tsx (new, replaces BriefsPlaceholder.tsx), client/src/pages/Pipeline.tsx (new, replaces PipelinePlaceholder.tsx), client/src/App.tsx (updated imports)
- Session 11: client/src/components/AppShell.tsx (updated — responsive), client/src/components/ErrorBoundary.tsx (new), client/src/App.tsx (updated — ErrorBoundary), client/src/main.tsx (updated — pulse animation, error toast)

### Files to Delete
- src/engine/mandate.js (dead — zero imports, legacy v5.1)
- src/engine/manager.js (dead — zero imports, legacy v5.1)
- v6_holdings_schema.sql (superseded by v6_full_schema.sql — already run)
- v6_full_schema.sql (already run in Supabase SQL Editor — delete from repo)
- client/src/pages/BriefsPlaceholder.tsx (replaced by Briefs.tsx in Session 10)
- client/src/pages/PipelinePlaceholder.tsx (replaced by Pipeline.tsx in Session 10)

### SQL Already Executed in Supabase
- v6_full_schema.sql (9 tables, RLS policies, timestamp triggers)
- on_auth_user_created trigger (separate execution, auth schema)

---

## 15. SESSION COMPLETION LOG

### Session 1: Foundation + Data Validation — COMPLETED April 4, 2026

**Files committed to GitHub (racoursey-cloud/fundlens-v6):**
- `package.json` (root) — build script: `"build": "tsc"`, separate `"build:client": "vite build"` for later
- `tsconfig.json` (root) — ES2022, ESNext modules, bundler resolution, path aliases
- `Procfile` (root) — `web: node dist/server.js`
- `env.example` (root) — template for all env vars (named without dot so it's visible in Finder)
- `src/server.ts` — minimal Express server with /health endpoint
- `src/engine/constants.ts` — master constants with all thresholds, factor weights, API endpoints
- `src/prompts/editorial-policy.md` — versioned editorial policy for Investment Brief generation

**Railway:** Project "lucky-enjoyment" connected to fundlens-v6 repo. Deployment successful.

**Key decisions made:**

1. **Tiingo → DROPPED.** FMP Starter (`/stable/historical-price-eod/full?symbol=VFIAX`) returns clean daily price history for mutual funds back to 2021. Sufficient for Momentum factor. No need for Tiingo.

2. **FMP API migrated to /stable/ base URL.** All `/api/v3/` endpoints return "Legacy Endpoint" errors after August 31, 2025. New endpoints confirmed working on Starter plan:
   - `/stable/profile?symbol=VFIAX` ✅ (fund info, CIK, CUSIP, description, isFund flag)
   - `/stable/quote?symbol=VFIAX` ✅ (price, 50/200 day moving averages, year high/low)
   - `/stable/historical-price-eod/full?symbol=VFIAX` ✅ (daily prices since 2021)
   - `/stable/search-name?query=vanguard` ✅ (fund search)
   - `/stable/etf/holdings` ❌ REQUIRES PROFESSIONAL PLAN — not available on Starter ($19/mo)

3. **SEC EDGAR confirmed as sole holdings source.** FMP cannot provide underlying stock holdings for mutual funds on the Starter plan. NPORT-P filings from EDGAR remain the authoritative (and free) source for holdings with weight percentages. OpenFIGI remains needed for CUSIP-to-ticker resolution.

4. **RSS feed replacements:** Reuters Business (dead) → Google News Business. AP News (dead) → Google News World. Both confirmed working. All 5 feeds validated.

5. **FMP API key:** Robert's key is `D6VMng26tmpAPBvzLERt3nWVx6VGCwp6` (FMP Starter, $19/mo)

6. **GitHub upload workflow:** Use `https://github.com/racoursey-cloud/fundlens-v6/upload/main/{path}` — drag and drop files from Desktop FundLens v6 folder. Directories must exist in repo first.

7. **Cowork-only workflow:** Robert does NOT use Claude Code on the Web for this project. Everything goes through Cowork. Files saved to Desktop "FundLens v6" folder, uploaded to GitHub manually.

**Data architecture confirmed for rebuild:**
- SEC EDGAR → fund holdings + expense ratios (free)
- OpenFIGI → CUSIP-to-ticker mapping (free)
- FMP Starter → company fundamentals, prices, news ($19/mo)
- FRED → macro economic indicators (free)
- RSS feeds → news headlines for thesis (free)
- Claude API → sector classification (Haiku), thesis (Sonnet), Briefs (Opus)

---

### Session 2: Holdings Pipeline — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload to src/engine/):**
- `types.ts` — shared TypeScript interfaces for entire engine (EDGAR, OpenFIGI, pipeline, Supabase row shapes)
- `edgar.ts` — EDGAR NPORT-P parser: ticker→CIK (via company_tickers_mf.json) → latest filing (via data.sec.gov submissions) → XML parse → holdings array
- `cusip.ts` — OpenFIGI v3 CUSIP-to-ticker resolver: batch API (100/request), rate limit retry, Supabase cache hooks
- `holdings.ts` — Holdings pipeline orchestrator: 65%/50-holding cutoff, fund-of-funds look-through (depth-limited to 2), deduplication
- `v6_holdings_schema.sql` — Supabase schema: `funds`, `holdings_cache`, `cusip_cache`, `pipeline_runs` tables with indexes and RLS enabled

**Also delivered:**
- `package.json` (updated) — added `@types/xml2js` to devDependencies

**Key decisions made:**

1. **Fund-of-funds look-through: built fresh.** No v5.1 code carried forward. Recursive design: detect investment company holdings → fetch sub-fund's NPORT-P → scale weights proportionally → merge and deduplicate. Sub-fund ticker resolution is stubbed — will wire into FMP search in Session 3.

2. **Supabase schema: clean v6, no legacy.** Four tables designed from scratch. `holdings_cache` uses composite unique index (fund_id, accession_number, cusip) to prevent duplicates. `cusip_cache` persists OpenFIGI results so we don't re-query the same CUSIP.

3. **Railway build fix:** devDependencies weren't installed during build. Fixed by setting Custom Build Command on Railway to `npm install --include=dev && npm run build`. Also changed build script from `tsc && vite build` to just `tsc` (no React client yet).

**Railway:** Build passing, deployment successful after build command fix.

---

### Session 3: Scoring Engine — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload to src/engine/):**
- `fmp.ts` — FMP API client: profiles, quotes, income statements, balance sheets, cash flow, ratios, key metrics, historical prices. All via /stable/ endpoints.
- `cost-efficiency.ts` — Cost Efficiency factor (25% weight): category detection (passive/active/bond/target-date/money-market), percentile-based scoring curve per category
- `quality.ts` — Holdings Quality factor (30% weight): 26 financial ratios across 5 dimensions (profitability, balance sheet, cash flow, earnings quality, valuation), weighted by position size
- `momentum.ts` — Momentum factor (20% weight): 3/6/9/12-month returns from FMP prices, blended signal, cross-sectional ranking across fund menu
- `scoring.ts` — Composite scoring engine: `computeComposite()` (pure math for client-side rescore), `scoreAndRankFunds()`, `rescoreWithNewWeights()`, `redistributeWeights()` (proportional slider redistribution)

**Also updated:**
- `types.ts` — added `FundScoresRow` for Supabase scores table

**Key decisions made:**

1. **Investment Brief model: upgraded to Opus.** `BRIEF_MODEL` constant added as `claude-opus-4-20250514`. Sonnet still used for macro thesis (`THESIS_MODEL`). Robert's rationale: Opus writes more naturally and makes better arguments — worth the extra ~$20-30/mo for something coworkers read monthly.

2. **Cost Efficiency uses category-relative scoring.** A 0.04% index fund and a 0.65% active fund can both score well — they're compared against their own category's percentile benchmarks, not against each other.

3. **Momentum is cross-sectional.** Best fund in the 401(k) menu gets ~95, worst gets ~5, regardless of absolute market conditions. This ensures the factor always differentiates, even in a bear market.

4. **Client-side rescore is pure math.** `computeComposite()` multiplies raw scores by weights and sums — no API calls. When the user drags a weight slider, `redistributeWeights()` proportionally adjusts the others to keep them summing to 1.0.

---

### Session 4: Thesis + Positioning + Pipeline — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload to src/engine/):**
- `rss.ts` — RSS feed fetcher: 120-minute in-memory cache, fetches 5 feeds sequentially, up to 20 headlines each, `formatHeadlinesForPrompt()` for Claude
- `fred.ts` — FRED macro data: 9 indicators (GDP, unemployment, CPI, fed funds, yields, spread, sentiment, industrial production), derived signals (fed stance, inflation trend, employment health, consumer confidence)
- `thesis.ts` — Claude Sonnet macro thesis generator: structured prompt → narrative + sector preference scores (-2 to +2) for 14 sectors + key themes
- `positioning.ts` — Positioning factor (25% weight): maps fund sector exposure against thesis preferences, normalized scoring
- `classify.ts` — Claude Haiku sector classifier: batches 15 holdings per call, 1.2s delays, fuzzy sector matching, 14 standard sectors
- `pipeline.ts` — Full pipeline orchestrator: all 14 steps wired together (holdings → fundamentals → classification → 4 factor scores → thesis → composite → rank). Step 14 (Supabase persistence) stubbed for Session 5.

**Also updated:**
- `constants.ts` — added `BRIEF_MODEL: 'claude-opus-4-20250514'` for Investment Brief writing

**Key architectural decisions:**

1. **Thesis generates structured sector preferences.** Output is JSON with 14 sectors scored -2 to +2, not free-form text. This makes the Positioning factor purely mathematical — preference × fund weight per sector.

2. **14 standard sectors.** Shared between classify.ts and thesis.ts: Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples, Energy, Industrials, Materials, Real Estate, Utilities, Communication Services, Precious Metals, Fixed Income, Cash & Equivalents.

3. **Pipeline is sequential, never parallel for external APIs.** Every Claude call has 1.2s delays. Every FMP/EDGAR call has 500ms delays. Fundamentals are fetched once per unique ticker (deduped across all funds).

4. **Phase 1 (Server Engine) is now complete.** All 16 engine files type-check clean with zero errors. The scoring engine is fully functional in memory — it takes a list of funds and returns scored, ranked results with full per-factor detail.

**Complete file inventory (src/engine/):**
types.ts, constants.ts, edgar.ts, cusip.ts, holdings.ts, fmp.ts, cost-efficiency.ts, quality.ts, momentum.ts, scoring.ts, rss.ts, fred.ts, thesis.ts, positioning.ts, classify.ts, pipeline.ts

**Next up:** Session 5 — Database Schema + API (Supabase schema finalization, Express API routes, supaFetch() pattern, user profiles, RLS policies). This is the session that connects the engine to the database and exposes it to the React client.

---

### Session 5: Database Schema + API — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (uploaded to GitHub):**
- `supabase.ts` → `src/services/supabase.ts` — supaFetch() core function with PostgREST query params, convenience helpers (supaSelect, supaInsert, supaUpdate, supaDelete), service_role key, supports upsert/single-row/returning
- `auth.ts` → `src/middleware/auth.ts` — JWT decode + HMAC-SHA256 signature verification, requireAuth and optionalAuth middleware, AuthenticatedRequest extends Express Request with userId/userEmail
- `routes.ts` → `src/routes/routes.ts` — 14 API endpoints (funds, scores, profile, pipeline, briefs, thesis), POST /api/pipeline/run triggers async pipeline with persistence
- `persist.ts` → `src/engine/persist.ts` — Pipeline Step 14 wired to Supabase: writes fund_scores, thesis_cache, updates holdings sectors, updates pipeline_runs
- `types.ts` (updated) — added UserProfileRow, InvestmentBriefRow, BriefDeliveryRow, ThesisCacheRow, updated PipelineRunRow (removed fund_id, added stats columns), updated FundScoresRow (added composite_default)
- `server.ts` (updated) — Express entry point with CORS, routes, env validation
- `v6_full_schema.sql` — Complete Supabase schema (run in SQL Editor, then delete). Supersedes v6_holdings_schema.sql from Session 2.
- `env.example` (updated) — added SUPABASE_JWT_SECRET

**SQL executed in Supabase:**
- v6_full_schema.sql creating 9 tables: funds, holdings_cache, cusip_cache, pipeline_runs, user_profiles, fund_scores, investment_briefs, brief_deliveries, thesis_cache
- RLS enabled on all tables with policies
- `on_auth_user_created` trigger on auth.users — auto-creates a user_profiles row when a new user signs up via magic link (requires separate execution targeting auth schema)
- `set_funds_updated_at` and `set_profiles_updated_at` trigger functions for automatic timestamp management

**Key decisions made:**

1. **supaFetch() is the universal data access pattern.** All Supabase queries route through Express server using the service_role key (bypasses RLS). React client never talks to Supabase directly except for magic link auth. Pattern: React → Express route → supaFetch() → Supabase PostgREST.

2. **JWT validation uses HMAC-SHA256.** The auth middleware decodes Supabase JWTs using the SUPABASE_JWT_SECRET, verifies the signature, and attaches userId/userEmail to the request. No external JWT library — uses Node.js built-in crypto.

3. **RLS is defense-in-depth, not primary security.** Express is the primary access control layer. RLS policies exist as a safety net in case of server misconfiguration. service_role key bypasses RLS intentionally.

4. **on_auth_user_created trigger requires separate execution.** Triggers on auth.users (managed by Supabase) can't be created in the same script as public schema tables. Runs as a separate SQL statement in the SQL Editor.

5. **v6_full_schema.sql supersedes v6_holdings_schema.sql.** Session 2's schema covered 4 tables; Session 5's schema covers all 9 tables. The old SQL file should be deleted from GitHub after running the new one.

**Railway:** Build passing, deployment successful. All Session 5 files uploaded and merged.

---

### Session 6: Investment Brief Engine — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload):**
- `brief-engine.ts` → `src/engine/brief-engine.ts` — Core Brief generator with z-score allocation model, two-layer personalization (data packet + editorial policy), assembleDataPacket(), computeRelevanceTags(), computeAllocation(), generateBrief() via Claude Opus
- `brief-email.ts` → `src/engine/brief-email.ts` — Converts Brief Markdown to dark-themed HTML email, sends via Resend API, tracks delivery in brief_deliveries table, updates user_profiles.last_brief_sent_at
- `brief-scheduler.ts` → `src/engine/brief-scheduler.ts` — checkAndSendBriefs() daily cron entry point (finds eligible users past 30-day window), generateBriefForUser() for both scheduler and on-demand API, loads editorial-policy.md from filesystem with in-memory cache
- `routes.ts` (updated) → `src/routes/routes.ts` — POST /api/briefs/generate wired to real Brief engine (replaced placeholder)

**Key decisions made:**

1. **Z-score threshold-based allocation model.** Risk tolerance controls a z-score THRESHOLD that determines which funds qualify for inclusion. Funds scoring below the threshold are excluded entirely. Position sizes are proportional to (z - threshold), so the more statistically exceptional a fund, the larger its allocation share. No artificial caps or floors — the math handles concentration naturally.

2. **Final z-score thresholds after three iterations:**
   - Conservative: 0.0σ — above-average funds only (bottom half excluded)
   - Moderate: +0.5σ — clearly above average, separating from the pack
   - Aggressive: +1.0σ — statistical outliers, genuinely breaking away

   These thresholds were derived from Robert's insight that mutual funds are already diversified by nature, so spreading money across 8+ funds defeats the purpose. The model rewards statistical exceptionalism.

3. **Three iterations to reach final model:**
   - v1 (hard caps): Robert rejected artificial limits on fund count
   - v2 (exponent/gain factor): Not the intended z-score model; totals didn't sum to 100%
   - v3 (z-score threshold): Correct approach — threshold controls inclusion, proportional sizing handles the rest

4. **Two-layer Brief personalization implemented:**
   - Layer 1: assembleDataPacket() builds per-user data with computeRelevanceTags() — selects which truths are most relevant based on user's risk tolerance and factor weights
   - Layer 2: editorial-policy.md loaded from filesystem, governs how Claude writes the Brief

5. **Claude Opus for Brief writing.** BRIEF_MODEL constant set to `claude-opus-4-20250514`. Claude Sonnet still used for macro thesis (THESIS_MODEL). Opus writes more naturally for something coworkers read monthly.

6. **Test data was hypothetical.** Verification examples used a made-up 10-fund set (Fund A through Fund J, scores 42-82) to validate math. Real TerrAscend 401(k) funds will be scored when the pipeline runs against the Supabase fund list.

**Pending uploads to GitHub:**
- brief-engine.ts → https://github.com/racoursey-cloud/fundlens-v6/upload/main/src/engine
- brief-email.ts → same path
- brief-scheduler.ts → same path
- routes.ts → https://github.com/racoursey-cloud/fundlens-v6/upload/main/src/routes (replace existing)

**Next up:** Session 7 — Pipeline Scheduling + Monitoring.

---

### Session 7: Pipeline Scheduling + Monitoring — COMPLETED April 4, 2026

**Files delivered to FundLens v6 folder (uploaded to GitHub):**
- `monitor.ts` → `src/engine/monitor.ts` — System health checks: API key validation, Supabase connectivity, stale data detection, pipeline failure tracking, data quality metrics (coverage gaps, score distribution outliers)
- `server.ts` (updated) → `src/server.ts` — Added cron scheduling via node-cron: daily pipeline run at 2 AM ET, daily brief check at 6 AM ET, hourly health monitor. Cron only runs when `IS_PRODUCTION=true`
- `package.json` (updated) — Added node-cron dependency

**Key decisions made:**
1. All cron jobs run in-process on Railway (no separate worker). Railway's always-on Hobby plan keeps the Express process running.
2. Pipeline runs daily at 2 AM ET to catch overnight EDGAR filings and market close data.
3. Brief eligibility check at 6 AM ET — users get Briefs in their morning inbox.
4. Health monitor runs hourly, logs warnings but doesn't alert externally (no PagerDuty/Slack integration yet).

---

### Session 8: Auth + Shell + Wizard — COMPLETED April 5, 2026

**Files delivered and deployed to GitHub:**
- `client/package.json` — React 19, react-router-dom 7, @supabase/supabase-js, Vite 6, TypeScript 5.8
- `client/tsconfig.json` — ES2022, ESNext modules, bundler resolution, react-jsx, strict mode
- `client/vite.config.ts` — React plugin, /api proxy to localhost:3000 in dev
- `client/index.html` — Entry point with Inter + JetBrains Mono font links
- `client/src/vite-env.d.ts` — Vite/ImportMeta type reference (required for import.meta.env)
- `client/src/auth.ts` — Supabase client (anon key), magic link sign-in, sign-out, getAccessToken()
- `client/src/api.ts` — Typed fetch wrapper with JWT auth header, all API methods (funds, scores, profile, pipeline, briefs, thesis, health)
- `client/src/theme.ts` — Dark theme constants (bg #0e0f11, surface #16181c, border #25282e, accent #3b82f6), CSS custom properties
- `client/src/main.tsx` — React 19 createRoot, BrowserRouter, AuthProvider, CSS variables injection
- `client/src/App.tsx` — Route definitions: /login, /auth/callback, /setup, / (portfolio), /briefs, /pipeline
- `client/src/context/AuthContext.tsx` — Auth state management, onAuthStateChange listener, loading spinner
- `client/src/components/AppShell.tsx` — Sidebar navigation (Portfolio, Briefs, Pipeline), sign-out button, dark theme
- `client/src/components/ProtectedRoute.tsx` — Redirects to /login if unauthenticated, to /setup if setup incomplete
- `client/src/pages/Login.tsx` — Email input, magic link trigger, confirmation message
- `client/src/pages/SetupWizard.tsx` — 3-step wizard: fund selection, factor weights with sliders, risk tolerance toggle
- `client/src/pages/AuthCallback.tsx` — Handles Supabase redirect, extracts tokens from URL hash
- `client/src/pages/Portfolio.tsx` — Initial placeholder (replaced in Session 9)
- `client/src/pages/BriefsPlaceholder.tsx` — Placeholder for Session 10
- `client/src/pages/PipelinePlaceholder.tsx` — Placeholder for Session 10
- `src/server.ts` (updated) — Added static file serving in production (express.static for client/dist, SPA fallback)
- `package.json` (updated) — Build script: `tsc && cd client && npm install && npm run build`

**Also completed in Session 8 — OpenFIGI → FMP migration:**
- `src/engine/cusip.ts` (rewritten) — Replaced OpenFIGI batch POST with FMP per-CUSIP GET (`/api/v3/cusip/{CUSIP}`), sequential calls with delays
- `src/engine/constants.ts` (updated) — Removed OPENFIGI constant block
- `src/engine/holdings.ts` (updated) — Parameter renamed from openFigiApiKey to fmpApiKey
- `src/engine/pipeline.ts` (updated) — Uses FMP_API_KEY env var instead of OPENFIGI_API_KEY
- `src/engine/types.ts` (updated) — Removed FigiMappingJob and FigiResult interfaces
- `env.example` (updated) — Removed OPENFIGI_API_KEY section

**Key decisions made:**
1. **OpenFIGI eliminated entirely.** OpenFIGI requires corporate email signup, which Robert couldn't complete. FMP already has a CUSIP endpoint that returns the same ticker/name resolution. One fewer API dependency.
2. **Client served by Express in production.** Vite builds to client/dist, Express serves it as static files with SPA fallback. No separate static hosting needed.
3. **Staging folders for GitHub upload.** Because GitHub web upload can't have filename collisions in one batch, files with duplicate names (package.json, tsconfig.json) were placed in `client-upload/` and `client-src-upload/` staging folders. Robert uploads from these, renaming isn't needed — the files inside are already correctly named for their destination.
4. **11 environment variables required in Railway:** SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, FMP_API_KEY, TINNGO_KEY, FRED_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, PORT (auto-set by Railway), IS_PRODUCTION=true

**Errors encountered and fixed:**
- Wrong GitHub upload URLs (404s) — Robert's org is `racoursey-cloud`, not `racoursey`
- Server import path changes that broke the build — reverted; repo already had correct directory structure
- Missing `vite-env.d.ts` — TypeScript couldn't resolve `import.meta.env` without Vite type reference

---

### Session 9: Portfolio + Fund Detail — COMPLETED April 5, 2026

**Files delivered and deployed to GitHub:**
- `client/src/pages/Portfolio.tsx` (full implementation, replacing placeholder) — Two SVG donuts (sector exposure aggregated from factor_details, fund allocation by composite score), ranked fund table with color-coded factor scores (green ≥75, blue ≥50, amber ≥25, red <25), factor weight sliders with proportional redistribution, risk tolerance toggle (conservative/moderate/aggressive), Save Weights button persists to API, clicking a fund row opens FundDetail sidebar
- `client/src/components/FundDetail.tsx` (new) — Fund detail sidebar: factor score bars with color coding, AI reasoning extraction from factor_details (costEfficiency, holdingsQuality, positioning, momentum), sector exposure mini donut built from holdings data, top 15 holdings table with ticker/name/weight, expense ratio display, close button

**Key decisions made:**
1. **Client-side rescore.** When users adjust factor weight sliders, the composite score recalculates instantly in the browser: `composite = cost * w_cost + quality * w_quality + positioning * w_positioning + momentum * w_momentum`. No server round-trip needed.
2. **No new API methods needed.** Session 8's api.ts already included `fetchFundScore(ticker)` returning `{ fund, score, holdings }` — exactly what FundDetail requires.
3. **Proportional weight redistribution.** When one slider moves, the other three redistribute proportionally to maintain a total of 100%. Minimum 5% per factor prevents any factor from being zeroed out.

**Build issues fixed:**
- `noUnusedLocals` flagged unused `profile` state variable — prefixed with underscore (`_profile`)
- Array index access on `DONUT_COLORS` and `SECTOR_COLORS` Record returned `string | undefined` — added `?? '#71717a'` fallback for strict TypeScript

**Next up:** Session 10 — Investment Brief UI.

---

### Session 10: Investment Brief UI + Pipeline Page — COMPLETED April 5, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload):**
- `client/src/pages/Briefs.tsx` (new, replaces BriefsPlaceholder.tsx) — Full Investment Brief page: latest Brief rendered as styled HTML via in-component markdown parser (headings, bold, italic, lists, horizontal rules), Brief history sidebar with date/title/status, click-to-view any past Brief, "Generate Brief" and "Generate & Email" buttons with loading states, empty state with guidance, status badges (generated/sent/failed)
- `client/src/pages/Pipeline.tsx` (new, replaces PipelinePlaceholder.tsx) — Full pipeline monitoring page: stat cards (status, funds scored, holdings, duration, failed count), run history table with status dots/duration/fund counts/retry buttons, auto-refresh every 10 seconds while pipeline is running, "Retry Failed" button for failed runs, system health section via fetchSystemHealth(), error detail display for failed runs
- `client/src/App.tsx` (updated) — Replaced `BriefsPlaceholder` import with `Briefs` from `./pages/Briefs`, replaced `PipelinePlaceholder` import with `Pipeline` from `./pages/Pipeline`

**Key decisions made:**
1. **No external markdown library.** Brief content uses simple formatting (headings, bold, italic, lists). The in-component `renderMarkdown()` function converts markdown to styled HTML inline, keeping the bundle size lean.
2. **10-second polling for running pipelines.** Pipeline page detects `isRunning` state and sets a 10-second interval to re-fetch status. Polling stops automatically when the pipeline completes or fails.
3. **Brief history as sidebar.** Left sidebar (240px) shows all past Briefs with date, title, and status badge. Clicking a Brief fetches its full content and displays it in the main content area.
4. **Status color coding consistent.** Green (#22c55e) = completed/generated, Yellow (#f59e0b) = running, Red (#ef4444) = failed/error, Blue (#3b82f6) = sent/accent — consistent with Portfolio.tsx patterns.

**Build verified:** TypeScript `tsc --noEmit` and `vite build` both pass with zero errors. Strict mode, noUnusedLocals, noUnusedParameters, noUncheckedIndexedAccess all satisfied.

**GitHub upload paths:**
- `Briefs.tsx` → https://github.com/racoursey-cloud/fundlens-v6/upload/main/client/src/pages
- `Pipeline.tsx` → https://github.com/racoursey-cloud/fundlens-v6/upload/main/client/src/pages
- `App.tsx` → https://github.com/racoursey-cloud/fundlens-v6/upload/main/client/src

**Next up:** Session 11 — Polish + Deploy (responsive layout, error states, connect fundlens.app domain, upgrade Supabase to Pro).

---

### Session 11: Polish + Deploy — COMPLETED April 5, 2026

**Files delivered to FundLens v6 folder (pending GitHub upload):**
- `client/src/components/AppShell.tsx` (updated — responsive layout) — Three breakpoints: mobile (<768px) shows fixed bottom tab bar with 3 icons, tablet (768–1024px) shows collapsed 64px icon-only sidebar, desktop (>1024px) shows full 240px sidebar with collapse toggle. Smooth transitions between states. Main content padding reduces from 32px to 16px on mobile.
- `client/src/components/ErrorBoundary.tsx` (new) — React class component error boundary with componentDidCatch. Catches any render error and displays styled fallback UI: error icon, message, "Try Again" button (reloads page), "Go Home" button. Dark theme styling using theme.ts constants.
- `client/src/App.tsx` (updated) — Wrapped entire app with ErrorBoundary component. ErrorBoundary sits outside AuthProvider/BrowserRouter to catch errors at any level.
- `client/src/main.tsx` (updated) — Added global `@keyframes pulse` animation (used by Pipeline status dots and available for loading skeletons). Added `unhandledrejection` event listener that creates DOM-based error toasts: red background (#ef4444 at 15% opacity), red text, red left border, auto-dismisses after 5 seconds with fade animation.
- `DEPLOY_CHECKLIST.md` (new — NOT uploaded to GitHub) — Robert's personal deployment reference covering: pre-deploy tasks, connecting fundlens.app domain on Railway, upgrading Supabase to Pro ($25/mo), post-deploy validation checklist (login, wizard, portfolio, fund detail, pipeline, briefs, mobile testing), environment variable verification.

**Key decisions made:**

1. **Responsive layout uses `window.innerWidth` checks via resize listener.** No CSS-in-JS libraries or media query APIs. `getLayoutMode()` returns 'mobile', 'tablet', or 'desktop' and the component re-renders on resize. Clean and dependency-free.

2. **Mobile bottom tab bar is fixed-position.** 56px tall, 3 icons (Portfolio ◉, Brief ◈, Pipeline ◎) using the same NavLink components as the sidebar. Main content gets extra bottom padding (72px) on mobile to prevent content from being hidden behind the tab bar.

3. **Tablet sidebar is always collapsed.** No toggle button on tablet — the 64px icon-only sidebar is the only option. Desktop retains the user-controlled collapse toggle.

4. **ErrorBoundary wraps the entire app.** Placed outside AuthProvider and BrowserRouter in App.tsx so it catches errors from any component, including auth state changes and routing.

5. **Error toast uses pure DOM manipulation.** No React state needed — the `unhandledrejection` handler creates, animates, and removes a toast element directly. This ensures it works even if React itself has crashed.

6. **Pulse animation added to global CSS.** `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }` — already referenced by Pipeline's running status dot, now available globally for any loading skeleton.

**Build verified:** TypeScript `tsc --noEmit` and `vite build` both pass with zero errors. Strict mode, noUnusedLocals, noUnusedParameters, noUncheckedIndexedAccess all satisfied.

**Files to delete from GitHub:**
- `client/src/pages/BriefsPlaceholder.tsx` (replaced by Briefs.tsx in Session 10)
- `client/src/pages/PipelinePlaceholder.tsx` (replaced by Pipeline.tsx in Session 10)

**GitHub upload paths:**
- `AppShell.tsx`, `ErrorBoundary.tsx` → https://github.com/racoursey-cloud/fundlens-v6/upload/main/client/src/components
- `App.tsx`, `main.tsx` → https://github.com/racoursey-cloud/fundlens-v6/upload/main/client/src

**Next up:** Session 12 — Validation + Tuning (run pipeline against real fund menu, validate scores, tune scoring curves, test Investment Brief quality).

---

## 16. STANDING RULES FOR ALL SESSIONS

1. Read this document at the start of every session (especially Section 15 — Session Completion Log)
2. One file per commit, never batch (unless using Claude Code on the Web, which handles multi-file PRs)
3. Deliverables: complete single files via present_files tool
4. Dark theme mandatory — never revert to light theme
5. Evidence Gate Protocol: read all files completely, cite specific rules for every decision, state findings before writing, verify all interfaces after delivery
6. Use Opus for all sessions — planning and execution. Robert trusts Opus to build it right.
7. Break work into focused single-session assignments
8. Do not write code in planning sessions
9. Do not assume Robert knows infrastructure jargon — explain terms like "cron job," "PR," "schema" on first use
