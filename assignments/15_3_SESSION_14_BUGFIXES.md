# Assignment 15.3: Fix Session 14 Bugs

**Session:** 15
**Estimate:** 60 minutes (varies based on bug count and severity)
**Depends on:** Session 14 complete (BUGS.md exists)

---

## Spec Reference

Varies per bug — each bug in BUGS.md should cite a spec section.

## What to Do

### 1. Read BUGS.md

Read the entire `BUGS.md` file created in Session 14, Task 14.7. Understand every bug listed.

### 2. Prioritize

Fix bugs in this order:
1. **CRITICAL** — must fix, blocks core functionality
2. **HIGH** — should fix, produces wrong results
3. **MEDIUM** — fix if time permits
4. **LOW** — defer to later

### 3. For each bug you fix

Follow the standard phase gates:

**Phase 1:** Read the affected files completely. Understand the current behavior.

**Phase 2:** Present your fix plan to Robert. Cite the spec section. Wait for approval.

**Phase 3:** Make the fix. One file at a time. Run `tsc --noEmit` after each change.

**Phase 4:** Verify the fix. Update BUGS.md to mark the bug as resolved:
```
### BUG-X: [description]
**Status: RESOLVED (Session 15)**
[Original bug details...]
**Fix:** [What was changed and why]
```

### 4. If BUGS.md says "No bugs found"

Skip this task entirely. Move to 15.4.

### 5. If a bug requires changes outside Session 15's scope

Do NOT fix it. Add a note to BUGS.md:
```
**Status: DEFERRED — requires [description of what's needed]**
```

Report it to Robert with your recommendation.

## What NOT to Do

- Do NOT fix LOW-severity bugs if there are unfixed HIGH or CRITICAL bugs
- Do NOT make changes beyond what's needed to fix the documented bug
- Do NOT fix bugs that aren't in BUGS.md — if you find new issues, document them in BUGS.md first, then ask Robert
- Do NOT change the allocation algorithm, scoring math, or any core engine behavior unless a bug specifically requires it and the fix is approved

## Verification

1. `tsc --noEmit` passes
2. Each fixed bug has a verification step (specific to the bug)
3. BUGS.md updated with resolution status for each bug addressed

## Rollback

Per-file: `git checkout -- <file>` for any file where the fix made things worse.
