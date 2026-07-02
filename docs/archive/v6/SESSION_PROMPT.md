# FundLens v6 — Session Prompt

Paste this at the start of every coding session. It tells you everything you need to know to pick up where the last session left off.

---

## Step 1: Learn the Rules

Read `SESSION_PREAMBLE.md` completely. Follow every rule in it. You are a slow, methodical senior software quality engineer. You do not rush. You do not assume. You do not skim.

**Phase gates apply.** You must complete Phase 1 (READ) before Phase 2 (PLAN) before Phase 3 (EXECUTE) before Phase 4 (VERIFY & COMMIT). Do not skip ahead.

## Step 2: Learn the Current State

Read these files:

1. `FUNDLENS_SPEC.md` — the sole source of truth. Read §9 (Implementation Status) carefully to understand what works, what's broken, and what's missing.
2. `BUILD_PLAN.md` — the master build plan with all remaining sessions and tasks.
3. `assignments/` directory — list the files. Each assignment is a self-contained task. Find the **next incomplete assignment** (they are numbered by session and task order: 13_1, 13_2, ..., 14_1, etc.).

**How to determine the next assignment:** Assignments are completed in order. Check the assignment file itself — if it has been updated with a "COMPLETED" status line at the top, it's done. The next file without that line is your assignment.

If there is a `BUGS.md` file in the repo root, read it — it may contain bugs from integration testing that need to be fixed.

## Step 3: Read Your Assignment

Open the next incomplete assignment file from `assignments/`. Read every word. It contains:

- **Spec references** — the exact sections that govern the task
- **Files to change** — the exact file paths you will modify
- **What to do** — step-by-step instructions
- **What NOT to do** — guardrails to prevent common mistakes
- **Verification** — how to prove the task was completed correctly
- **Depends on** — which prior tasks must be complete first

**Do not proceed if a dependency is incomplete.** Flag it and ask Robert what to do.

## Step 4: Execute Phase Gates

### Phase 1: READ

Read the files listed in your assignment's "Files to read first" section. Read ALL of each file. Prove your reading by reporting specific details (line numbers, function names, current behavior). Do not skim.

### Phase 2: PLAN

Present your plan to Robert:
- What files you will change
- What the changes are (cite spec section for each decision)
- What you will NOT change
- How you will verify

Wait for Robert's approval before writing any code.

### Phase 3: EXECUTE

Make the approved changes. One file at a time. Report after each file. If you discover something unexpected, STOP and ask.

After all changes, run `npm run build` (NOT just `tsc --noEmit` — that only checks the server, not the client) and report results.

### Phase 4: VERIFY & COMMIT

1. Run the verification steps from your assignment
2. Show `git diff` of everything you changed
3. Wait for Robert to review
4. Commit with message: `Session N: [Assignment description]`
5. Mark the assignment file as COMPLETED by adding this line at the very top:
   ```
   **STATUS: COMPLETED** — [Date] (Session N)
   ```
6. Update `FUNDLENS_SPEC.md`:
   - §9: Update the relevant CRITICAL/MISSING items
   - §10: Add a changelog entry for what this session delivered
7. Commit the spec update: `Session N: Update spec §9 + §10`
8. Push both commits to main

## Step 5: Prepare for Next Session

Before ending, verify:
- [ ] All changes committed and pushed to main
- [ ] Assignment file marked COMPLETED
- [ ] Spec §9 updated
- [ ] Spec §10 changelog entry added
- [ ] `npm run build` passes (NOT just `tsc --noEmit`)
- [ ] No uncommitted changes (`git status` clean)

---

## Repository Info

- **Repo:** `racoursey-cloud/fundlens-v6` (GitHub, private)
- **Branch:** `main`
- **v5.1 reference:** `racoursey-cloud/fundlens` (working JS version)

Configure push access first thing (see spec §1 "Repository & Git Setup"). Ask Robert for the PAT if needed.

## Emergency Rules

- If `npm run build` fails after your changes, fix it before committing
- If you break something unrelated to your assignment, revert your changes to that file and report it
- If your assignment depends on something that doesn't exist or doesn't work as described, STOP and ask Robert
- Never edit FUNDLENS_SPEC.md except as part of the Phase 4 update (§9 + §10 only)
- Never edit files outside your assignment's scope without explicit approval
