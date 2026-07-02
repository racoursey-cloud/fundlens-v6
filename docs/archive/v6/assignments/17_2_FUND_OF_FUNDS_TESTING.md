# Assignment 17.2: Fund-of-Funds Testing + Spec Update

**Session:** 17 (Optional)
**Estimate:** 30 minutes
**Depends on:** 17.1 (resolveSubFundTicker wired)

---

## Spec Reference

- **§2.4.4** — Fund-of-funds look-through, depth = 1
- **MISSING-15** — Wire resolveSubFundTicker()

## What to Do

### 1. Identify fund-of-funds in the TerrAscend menu

Review the ~18 funds in the TerrAscend universe. Identify any that are fund-of-funds (target-date funds are the most common — they hold other funds as underlying assets). Check the EDGAR NPORT-P filings for holdings that look like other funds rather than individual companies.

### 2. Test look-through against a real fund-of-fund

If any fund-of-funds exist in the universe:

a) Run the pipeline (or just the holdings fetch step) for that specific fund
b) Verify that `resolveSubFundTicker()` is called for fund-like holdings
c) Verify that sub-fund holdings are fetched (EDGAR NPORT-P for the sub-fund)
d) Verify that the look-through stops at depth 1 (does not recurse further)
e) Verify that the sub-fund's holdings are scored and included in the parent fund's quality calculation

### 3. If no fund-of-funds exist in the universe

Document this finding:
```
No fund-of-funds identified in the TerrAscend 18-fund universe.
Look-through code is implemented but untestable with current fund list.
Recommend adding a known fund-of-funds ticker (e.g., a target-date fund)
to the test fund list for verification in a future session.
```

### 4. Document results

```
## Fund-of-Funds Testing

### Funds Tested
| Fund | Type | Has Sub-Fund Holdings? | Look-Through Triggered? |
|------|------|----------------------|------------------------|
| ... | ... | ... | ... |

### Look-Through Results
[Description of what happened — did sub-fund resolution work?
Were sub-fund holdings scored? Did depth=1 hold?]

### Issues Found
[List any issues]
```

### 5. Update spec

- §9: Mark MISSING-15 as resolved (or partially resolved if testing was limited)
- §10: Add Session 17 changelog entry
- §5.5: No new files (just modified holdings.ts)

### 6. Commit and push

1. `Session 17: Wire fund-of-funds look-through + testing`
2. `Session 17: Update spec §9 + §10`

Mark all Session 17 assignments as COMPLETED.

## What NOT to Do

- Do NOT change the scoring algorithm
- Do NOT increase MAX_LOOKTHROUGH_DEPTH beyond 1
- Do NOT add funds to the Supabase `funds` table without Robert's approval
- Do NOT run the full pipeline just for this test if a targeted test is possible

## Verification

1. `tsc --noEmit` passes
2. `resolveSubFundTicker()` returns non-null for at least one test case (or documented why no test cases exist)
3. Look-through depth = 1 verified
4. Results documented
