# Assignment 17.1: Wire resolveSubFundTicker() to FMP Search

**Session:** 17 (Optional)
**Estimate:** 30 minutes
**Depends on:** Session 15 complete

---

## Spec Reference

- **§2.4.4** — "When a holding is itself another fund, fetch sub-fund's NPORT-P, score underlying holdings."
- **MISSING-15** — "Scaffolding exists in holdings.ts but resolveSubFundTicker() is a stub (always returns null)."
- **§9.4** — "resolveSubFundTicker() in holdings.ts is still a stub"

## Files to Read First

- `src/engine/holdings.ts` — find `resolveSubFundTicker()`. Read the full function and understand:
  - What it receives (fund name? CUSIP? holding data?)
  - What it should return (a ticker symbol for the sub-fund)
  - What the MAX_LOOKTHROUGH_DEPTH constant is set to (should be 1)
  - How the look-through is triggered (what condition causes a holding to be treated as a fund-of-fund)
- `src/engine/fmp.ts` — find the search endpoint. Read how FMP search works:
  - What endpoint is used (`/stable/search-name`)
  - What parameters it accepts
  - What it returns
- `src/engine/cusip.ts` — understand how CUSIP resolution works, since the sub-fund resolution may follow a similar pattern

## Files to Change

- `src/engine/holdings.ts` — specifically the `resolveSubFundTicker()` function

## What to Do

### 1. Understand the current stub

The function currently returns `null` always. It needs to:
- Take a holding's identifying information (name, CUSIP, or other identifiers)
- Determine if the holding is itself a mutual fund or ETF
- If yes, resolve it to a ticker symbol using FMP search
- Return the ticker or null if resolution fails

### 2. Implement FMP search-based resolution

Use the FMP search-by-name endpoint (already used in `cusip.ts` as a fallback). The pattern should be:

```typescript
async function resolveSubFundTicker(holdingName: string, fmpApiKey: string): Promise<string | null> {
  // 1. Search FMP by name
  // 2. Filter results for mutual funds / ETFs (not individual stocks)
  // 3. Return the best-matching ticker, or null
}
```

**Key considerations:**
- Only search if the holding looks like it might be a fund (heuristic: name contains "fund", "trust", "portfolio", "ETF", or ends with a share class like "Inst", "Inv", "Class A")
- Respect the 250ms API delay between calls
- Cache results if the cache infrastructure supports it
- Return null on any error — the pipeline will handle the holding without look-through

### 3. Respect MAX_LOOKTHROUGH_DEPTH = 1

The spec says recursion depth is 1. This means: if Fund A holds Fund B, we look through Fund B's holdings. But we do NOT look through Fund B's holdings' holdings. The existing scaffolding should already enforce this — verify it does.

## What NOT to Do

- Do NOT change MAX_LOOKTHROUGH_DEPTH from 1
- Do NOT add recursive look-through beyond depth 1
- Do NOT change the scoring algorithm
- Do NOT modify any other functions in holdings.ts
- Do NOT make this a blocking operation — if FMP search fails, return null and let the pipeline continue

## Verification

1. `tsc --noEmit` passes
2. `resolveSubFundTicker()` makes a real FMP API call (not just returns null)
3. MAX_LOOKTHROUGH_DEPTH is still 1
4. Function handles errors gracefully (returns null, doesn't throw)

## Rollback

```
git checkout -- src/engine/holdings.ts
```
