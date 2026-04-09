# Assignment 14.7: Bug Documentation

**Session:** 14
**Estimate:** 20 minutes
**Depends on:** 14.2–14.6 (all testing tasks complete)

---

## Purpose

Catalog all issues found during Session 14 testing into a single BUGS.md file. This becomes the input for Session 15's bugfix task (15.3).

## What to Do

### 1. Review all Session 14 findings

Go through the documentation from Tasks 14.1–14.6. Collect every issue, warning, anomaly, or failure.

### 2. Create BUGS.md

Create `BUGS.md` in the repo root with this structure:

```markdown
# FundLens v6 — Bug Tracker
## Created: Session 14 Integration Testing — [Date]

---

## Severity Definitions

- **CRITICAL:** Blocks core functionality. Must fix before v6 can ship.
- **HIGH:** Produces wrong results or broken UX. Should fix in Session 15.
- **MEDIUM:** Works but could be better. Fix if time permits.
- **LOW:** Cosmetic or nice-to-have. Defer to later.

---

## Open Bugs

### BUG-1: [Short description]
**Severity:** CRITICAL/HIGH/MEDIUM/LOW
**Found in:** Task 14.X
**Spec reference:** §X.Y
**Description:** [What's wrong]
**Expected behavior:** [What the spec says should happen]
**Actual behavior:** [What actually happened]
**Suggested fix:** [How to fix it, if known]
**Files likely affected:** [File paths]

### BUG-2: ...
(repeat for each bug)

---

## Resolved in Session 14
[If any bugs were obvious enough to fix during testing, list them here.
But remember: Session 14 is testing-only. Do NOT fix bugs during testing
unless they block further testing.]

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | [N] |
| HIGH | [N] |
| MEDIUM | [N] |
| LOW | [N] |
| **Total** | **[N]** |
```

### 3. If no bugs found

If everything passes cleanly (unlikely but possible), still create BUGS.md with:

```markdown
# FundLens v6 — Bug Tracker
## Created: Session 14 Integration Testing — [Date]

No bugs found during integration testing. All pipeline steps completed,
scoring validated, allocation verified, Brief generated successfully.
```

### 4. Update spec §9 and §10

Add to §9 under the build roadmap:
```
| 14 | End-to-End Integration Testing | **DONE** — [N] bugs found ([N] critical, [N] high) |
```

Add a §10 changelog entry:
```
### [Date] — Session 14: End-to-End Integration Testing

First full pipeline run against real 18-fund TerrAscend universe after 13 sessions of development. Results:
- Pipeline: [completed/failed] in [time]
- Scoring: [N] funds scored, [validation result]
- Allocation: [validation result]
- Brief: [generated/failed], [structure check result]
- Performance: cold [time], warm [time]
- Bugs found: [N] total ([breakdown by severity])

See BUGS.md for full bug catalog.
```

### 5. Commit and push

Two commits:
1. `Session 14: Integration testing results + BUGS.md`
2. `Session 14: Update spec §9 + §10`

## What NOT to Do

- Do NOT fix bugs in this task — just document them
- Do NOT downplay severity to make the report look better
- Do NOT skip creating BUGS.md even if no bugs found
- Do NOT modify source code

## Verification

BUGS.md exists with all issues cataloged. Spec §9 and §10 updated. All changes committed and pushed.
