# Assignment 16.1: Help Page with Static FAQs

**Session:** 16 (Optional)
**Estimate:** 30 minutes
**Depends on:** Session 15 complete

---

## Spec Reference

- **MISSING-9** — "Help section with static FAQs and Claude Haiku chat scoped strictly to FundLens questions."
- **§6.7** — UI components list (Help page not yet listed — will be added)

## Purpose

Create a Help page accessible from the main navigation. Start with static FAQs that answer the most common questions about FundLens.

## Files to Read First

- `client/src/components/AppShell.tsx` — navigation structure, to understand where to add the Help tab
- `client/src/App.tsx` — route definitions
- `client/src/pages/` — existing page patterns to follow

## Files to Create

- `client/src/pages/Help.tsx`

## Files to Change

- `client/src/App.tsx` — add route for Help page
- `client/src/components/AppShell.tsx` — add Help tab to navigation

## What to Do

### 1. Create Help.tsx

Create a Help page component with static FAQ content. Follow the existing page patterns (dark theme, same layout structure).

**FAQ content to include:**

1. **What is FundLens?** — FundLens scores the funds in your 401(k) plan across four factors and recommends personalized allocations based on your risk tolerance.

2. **How are funds scored?** — Each fund is scored 0–100 based on four factors: Cost Efficiency (how much it charges), Holdings Quality (financial health of its holdings), Momentum (recent price performance), and Positioning (how well its sectors align with current economic conditions). The four scores are combined into one composite score.

3. **What do the scores mean?** — 75+ (green) is strong, 50–74 (blue) is solid, 25–49 (amber) is below average, below 25 (red) is weak. These are relative — a score of 60 means the fund is above average compared to the other funds in your plan.

4. **How are allocations calculated?** — Your allocation is based on fund scores and your risk tolerance. Higher risk tolerance concentrates more money in top-scoring funds. Lower risk tolerance spreads money more evenly. Any fund that would receive less than 5% is excluded.

5. **What does the risk slider do?** — It controls how concentrated your allocation is. It does NOT change fund scores — those are objective. At "Very Conservative," your money is spread across many funds. At "Very Aggressive," it's concentrated in your highest-conviction picks.

6. **What are the factor weight sliders?** — They let you customize how much each factor matters to you. The defaults (Cost 25%, Quality 30%, Momentum 25%, Positioning 20%) are based on academic research, but you can adjust them. Changing weights instantly updates your scores and allocation.

7. **What is the Investment Brief?** — A personalized report generated monthly that explains your allocation in plain English. It covers what the economic data shows, what changed since your last Brief, what to watch for, and where your allocation stands.

8. **How often is data updated?** — The scoring pipeline runs daily. Fund prices are updated from Tiingo. Company fundamentals are cached for 7 days. The macro thesis is regenerated with each pipeline run using the latest FRED economic data and news headlines.

9. **What does "Low Data" mean?** — A fund marked "Low Data" has too many missing data points to score reliably. It still appears in your fund list but is excluded from allocation recommendations.

10. **Can I trust this?** — FundLens is a decision-support tool, not financial advice. It democratizes the kind of analysis institutional investors use, but you should always consider your full financial picture. The scores are based on published academic research and real financial data.

### 2. Style the page

- Use the existing dark theme (theme.ts)
- Accordion-style FAQ (click to expand) or simple stacked cards
- Keep it clean and readable — no complex interactivity
- Match the visual style of the Briefs page or Settings page

### 3. Add the route

In `App.tsx`, add a route for `/help` pointing to the Help component.

### 4. Add navigation

In `AppShell.tsx`, add a "Help" tab to the navigation bar. Place it after "Settings" (or as the last tab). Use a question-mark or help-circle icon if the icon library is available.

## What NOT to Do

- Do NOT add the Claude chat yet — that's Tasks 16.2 and 16.3
- Do NOT add external links or references to third-party sites
- Do NOT include financial advice or specific investment recommendations in the FAQ text
- Do NOT change any existing pages

## Verification

1. `tsc --noEmit` passes
2. Help page renders with 10 FAQs
3. Navigation shows Help tab
4. Route `/help` resolves correctly

## Rollback

```
git checkout -- client/src/App.tsx client/src/components/AppShell.tsx
rm client/src/pages/Help.tsx
```
