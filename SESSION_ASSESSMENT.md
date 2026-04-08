# Session Task: Full Project Assessment
## READ SESSION_PREAMBLE.md FIRST. Follow every rule in it.

---

## CONTEXT

FundLens v6 is a TypeScript rebuild of a working JavaScript app (v5.1). After 14+ sessions of development, the project has accumulated drift — code that doesn't match the spec, features built on wrong assumptions, and conflicting documentation. Before any more feature work happens, we need an honest, thorough assessment of where things actually stand.

## YOUR MISSION

**Conduct a full assessment of FundLens v6.** Compare what the spec says should exist against what the code actually does. Compare v6's implementation against v5.1's working implementation. Identify every gap, every mismatch, every broken assumption.

**You are in Phase 1 (READ-ONLY) for this entire session.** Do not edit, write, or create any files other than the final assessment report. Do not fix anything. Do not "improve" anything. Just read and report.

## STEP-BY-STEP INSTRUCTIONS

### Step 1: Clone v5.1 for reference
```
git clone https://github.com/racoursey-cloud/fundlens.git /tmp/fundlens-v5
```

### Step 2: Read these files completely — every line, no skipping

**v6 docs (in the fundlens-v6 repo):**
- `FUNDLENS_SPEC.md` — the entire file, all sections
- `FundLens_Spec_vs_Code_Gap_Analysis.md`
- `FUNDLENS_REBUILD_PLAN.md`
- `SESSION_PREAMBLE.md`

**v6 source (read every file listed):**
- `src/engine/pipeline.ts`
- `src/engine/scoring.ts`
- `src/engine/allocation.ts`
- `src/engine/classify.ts`
- `src/engine/thesis.ts`
- `src/engine/brief-engine.ts`
- `src/engine/fund-summaries.ts`
- `src/engine/persist.ts`
- `src/engine/constants.ts`
- `src/routes/routes.ts`
- `src/server.ts`
- `client/src/App.tsx`
- `client/src/api.ts`
- `client/src/components/AppShell.tsx`
- `client/src/pages/Portfolio.tsx`
- `client/src/pages/Thesis.tsx`
- `client/src/pages/Briefs.tsx`
- `client/src/pages/Settings.tsx`

**v5.1 source (read every file listed):**
- All files in `src/` directory — list them first, then read each one
- All files in the client/frontend directory — list them first, then read each one
- `package.json` (to understand dependencies and structure)

### Step 3: As you read, answer these questions (write your answers down)

**Architecture:**
1. What is v5.1's architecture? (server framework, database, frontend, AI integration)
2. What is v6's architecture? How does it differ?
3. Are there architectural decisions in v6 that diverge from what the spec describes?

**Scoring Engine (this is the most important part of the product):**
4. How does v5.1 calculate composite fund scores? Walk through the exact math.
5. How does v6 calculate composite fund scores? Walk through the exact math.
6. Where do they differ? Be specific — formula by formula.
7. Does v6's scoring match what FUNDLENS_SPEC.md Section 4 describes? Where does it diverge?

**Allocation Engine:**
8. How does v5.1 calculate allocations? Walk through the exact algorithm.
9. How does v6 calculate allocations? Walk through the exact algorithm.
10. Where do they differ?
11. Does v6's allocation match what FUNDLENS_SPEC.md Section 5 describes?

**Data Pipeline:**
12. What data sources does v5.1 use? List every API integration.
13. What data sources does v6 use? List every API integration.
14. Which v5.1 data sources are missing or broken in v6?
15. Does the pipeline execution order match the spec?

**Investment Brief / Thesis:**
16. How does v5.1 generate its thesis/macro analysis?
17. How does v6 generate its investment brief?
18. What are the differences in prompt structure, model used, and output format?

**UI / Client:**
19. What pages/views does v5.1 have?
20. What pages/views does v6 have?
21. What's in v5.1's UI that's missing or broken in v6?
22. What's in v6's UI that's new (not in v5.1)?

**Database:**
23. What does v5.1 use for storage?
24. What does v6 use?
25. Are there schema mismatches between v6's code and what the spec describes?

### Step 4: Write the assessment report

Save it as `ASSESSMENT_REPORT.md` in the fundlens-v6 repo. Structure it as:

1. **Executive Summary** — 3-5 sentences. Where is this project?
2. **What Works** — things that are genuinely functional and correct
3. **Critical Gaps** — things that are wrong or fundamentally broken (scoring math, allocation algorithm, etc.)
4. **Missing Features** — things the spec requires that don't exist yet
5. **Drift / Conflicts** — places where the code, spec, and docs disagree with each other
6. **v5.1 Features Not Yet Ported** — things that work in v5.1 but aren't in v6
7. **Recommended Priority Order** — what to fix first, second, third, with reasoning
8. **Remaining Sessions Estimate** — how many focused sessions to get v6 to "works as well as v5.1"

### Step 5: Report to Robert

Present your findings. Do not sugarcoat. If something is broken, say it's broken. If you're not sure about something, say you're not sure and explain what would be needed to verify it.

## RULES FOR THIS SESSION

- **READ-ONLY.** The only file you create is `ASSESSMENT_REPORT.md`. You do not edit any source code.
- **No fixing.** If you find a bug, document it. Do not fix it.
- **No shortcuts.** Read every file listed above in full. If a file is 800 lines, read all 800 lines.
- **Prove your reading.** For the scoring engine and allocation engine specifically, write out the actual formulas/algorithms you found in the code. Not summaries — the actual math.
- **Be honest.** A brutal honest assessment is infinitely more valuable than an optimistic one.
