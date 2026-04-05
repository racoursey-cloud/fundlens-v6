# FundLens Rebuild Plan
## Master Reference — April 4, 2026

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
Risk tolerance (set by user in profile) affects **allocation sizing only**, not scoring. Conservative users get more diversified allocations. Aggressive users get more concentrated allocations in top scorers. Same scores, same rankings, different position sizes.

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
| Claude API (Sonnet) | Macro thesis generation, Investment Brief writing |
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
15. (If Brief triggered) Generate personalized Investment Brief per user via Claude Sonnet

### Mandatory Rules (Carried Forward)
- **TINNGO_KEY** typo is intentional — never correct or mention it
- **Claude model constant:** claude-haiku-4-5-20251001 (CLAUDE_MODEL in constants.js)
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
- **AI:** Claude API (Haiku for classification, Sonnet for thesis/brief)

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

## 14. FILES TO UPLOAD / DELETE BEFORE REBUILD

### Awaiting Upload (from April 4 session)
1. edgar.js → src/engine/
2. cusip.js → src/engine/
3. quality.js → src/engine/
4. constants.js → src/engine/
5. api.js → src/services/
6. pipeline.js → src/engine/
7. SetupWizard.jsx → src/components/wizard/
8. outlier.js → src/engine/

### Files to Delete
- src/engine/mandate.js (dead — zero imports)
- src/engine/manager.js (dead — zero imports)

### SQL to Run
- v51_user_weights_migration.sql (delivered April 4 session)

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
- Claude API → sector classification (Haiku) + thesis/briefs (Sonnet)

**Next up:** Session 2 — Holdings Pipeline (EDGAR NPORT-P parser, OpenFIGI CUSIP resolver, dynamic 65%/50-holding cutoff, fund-of-funds look-through, Supabase schema for holdings cache)

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
