# FundLens v6 — Session 12 Handoff
**Date:** April 7, 2026
**Previous session:** Session 11 (v5.1 UI port)
**Repo:** `racoursey-cloud/fundlens-v6` on GitHub (private)
**Branch:** `main`
**Spec:** `FUNDLENS_SPEC.md` (read it first — it is the single source of truth)

---

## What Was Done in Session 11

Ported v5.1's visual layout and UX to v6's React/TypeScript client. v6 now looks like a financial product instead of a dev prototype while preserving all v6 improvements (4 factors, continuous risk slider, 4-section briefs, tier badges).

### New Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `client/src/components/DonutChart.tsx` | Shared SVG donut component with hover tooltips, click drill-in, MiniDonut variant | ~300 |
| `client/src/components/SectorScorecard.tsx` | Sector scorecard grid (14 sectors, 1–10 scale, progress bars, reasoning) | ~130 |
| `client/src/pages/Thesis.tsx` | Macro thesis card + sector outlook (from /api/thesis/latest) | ~180 |
| `client/src/pages/Settings.tsx` | Profile, fund list, pipeline controls, about | ~280 |

### Modified Files

| File | Changes |
|------|---------|
| `client/src/pages/Portfolio.tsx` | Full rebuild: v5.1 two-donut layout, 7-column fund table (Fund/Score/Tier/Cost/Quality/Momentum/Positioning), factor weight sliders with proportional redistribution, continuous risk slider. Sector donut click drills into holdings by sector. Fund donut click opens sidebar. Money market funds sort to bottom. |
| `client/src/components/FundDetail.tsx` | Rebuilt as 420px fixed right slide-in sidebar with backdrop. Header (name/ticker/expense ratio/tier), 38px composite score, 4 factor bars, sector donut with expandable holdings per sector, AI reasoning blocks. |
| `client/src/components/AppShell.tsx` | 4-tab navigation: Portfolio / Thesis / Briefs / Settings. Pipeline moved out of top-level nav. Responsive: desktop sidebar, tablet collapsed, mobile bottom bar. |
| `client/src/App.tsx` | Added /thesis and /settings routes. Pipeline stays at /pipeline but is no longer primary nav. |
| `client/src/pages/Briefs.tsx` | Section headings now use Libre Baskerville serif font. Empty state improved. |
| `client/src/theme.ts` | Added serif font (Libre Baskerville), surfaceAlt color (#1c1e23). |
| `client/src/api.ts` | Added ThesisData interface with typed sector_preferences, dominant_theme, macro_stance. |
| `FUNDLENS_SPEC.md` | Updated §9.1 (new working items), §9.5 (Session 11 → DONE), §10 (changelog). |

### What Was Preserved from v6 (NOT Regressed)

- 4 visible factors (Cost, Quality, Momentum, Positioning) at 25/30/25/20
- Continuous risk slider 1.0–7.0 with 0.1 step and Kelly k-interpolation
- Client-side rescore using pre-computed z-scores + normalCDF (no API call)
- 4-section Brief structure with advisor voice
- "Behind the curtain" rule
- Tier badges (Breakaway/Strong/Solid/Neutral/Weak) with MAD z-score
- TypeScript + Vite client
- Error boundary
- All engine files untouched (pipeline.ts, scoring.ts, etc.)

---

## Session 12 Goal

**Help Section — FAQs + Live Claude Chat (MISSING-9)**

Per the spec roadmap §9.5, Session 12 implements the Help section:

### What to Build

1. **Help/FAQ Page** — Static FAQ content covering:
   - What is FundLens? How does it work?
   - What do the scores mean? How are they calculated?
   - What is the Investment Brief?
   - How does risk tolerance affect my allocation?
   - How often should I run the pipeline?
   - What data sources does FundLens use?

2. **Claude Haiku Chat** — A scoped chat interface where users can ask questions about FundLens:
   - Model: claude-haiku-4-5-20251001 (fast, cheap)
   - Scoped strictly to FundLens questions — not general-purpose AI chat
   - System prompt should include relevant spec sections so Claude can answer accurately
   - Show typing indicator, message history within session
   - Rate limit: reasonable per-user cap (e.g., 20 messages per hour)

3. **Navigation** — Add "Help" to the nav bar, or make it accessible from Settings page.

### Architecture Notes

- Server-side: Add `POST /api/help/chat` endpoint in routes.ts. Takes user message, prepends system prompt with FundLens context, calls Claude Haiku, returns response. Use the Anthropic SDK already imported for thesis/brief generation.
- Client-side: New `Help.tsx` page with two sections — static FAQ cards and chat interface.
- Remember: MANDATORY 1.2s delay between Claude calls (`CLAUDE_CALL_DELAY_MS`). NEVER Promise.all() for Claude calls.

### Other Session 12 Candidates

If Help is quick, consider also addressing:

- **MISSING-7: HHI Concentration Display (§6.6)** — Herfindahl-Hirschman Index per fund in FundDetail sidebar. Pure client-side math from holdings data.
- **Inline SectorScorecard in Briefs** — Parse "Where We Stand" section from Brief markdown and render the SectorScorecard component inline instead of plain text.
- **Donut drill-in data quality** — The sector drill-in on the Portfolio page depends on holdings data being present in `factor_details`. Verify this is populated by the pipeline and flows correctly to the client.

---

## Pre-Flight Checklist

### 1. Read the Spec
Read `FUNDLENS_SPEC.md` in full. Pay special attention to:
- §6 (UI Rules)
- §9.3 (MISSING-9 for Help section)
- §10 (Changelog — understand what Session 11 did)

### 2. Run `tsc --noEmit` to Verify Clean Baseline
```bash
cd <repo-root>
npm install
npx tsc --noEmit
```
Should pass clean.

### 3. Review the v6 Client
The client has been significantly rebuilt in Session 11. Familiarize yourself with:
- `client/src/components/DonutChart.tsx` — shared donut component
- `client/src/components/SectorScorecard.tsx` — shared sector grid
- `client/src/pages/Thesis.tsx` — new thesis page
- `client/src/pages/Settings.tsx` — new settings page
- `client/src/theme.ts` — includes serif font now

---

## Session 12 Handoff Prompt

```
You are continuing the FundLens v6 build. This is Session 12.

Read FUNDLENS_SPEC.md first — it is the single source of truth. Pay special attention to:
- §6 (UI Rules)
- §9.3 (MISSING-9 — Help section)
- §9.5 (Build Roadmap — Session 12 scope)
- §10 (Changelog — Sessions 7–11)

Also read HANDOFF_SESSION_12.md for detailed plan.

Primary deliverables:
1. Create Help.tsx page with static FAQ cards
2. Add Claude Haiku chat interface scoped to FundLens questions
3. Add POST /api/help/chat endpoint to routes.ts
4. Wire Help into navigation (Settings page or new nav tab)

If time permits:
5. MISSING-7: HHI concentration display in FundDetail sidebar
6. Inline SectorScorecard rendering in Briefs

Rules:
- All inline styles. No CSS modules, no Tailwind.
- Dark theme only.
- 1.2s delay between Claude calls. Never Promise.all() for Claude.
- Do NOT touch engine files unless necessary.

Repo: racoursey-cloud/fundlens-v6 (GitHub, private)
Branch: main
After completing: update FUNDLENS_SPEC.md §9/§10, run tsc --noEmit, commit and push, write HANDOFF_SESSION_13.md.
```
