# Session 14 Pre-Flight Report
Date: April 8, 2026

## Environment
- [x] All env vars present (13 vars on Railway: 11 required from §5.6 + 2 VITE_ client vars)
- [x] Server starts clean (fundlens.app loads, "LIVE" badge shown, user logged in as racoursey)
- [x] TypeScript compiles clean (server `tsc` passes, client `tsc -b` passes — 102 modules transformed)
- [x] Database tables exist (confirmed via live app: funds, fund_scores, user_profiles all serving data)
- [x] Fund seed data present (15 funds displayed — see note below)

## Fund Count Discrepancy (CRITICAL)
The universe has **22 funds** (per Robert + seed_funds.sql). The app displays only **15**. Seven funds are missing:

| Ticker | Fund Name |
|--------|-----------|
| QFVRX  | Quantified STF Fund |
| MADFX  | BlackRock Advantage International Fund |
| RNWGX  | American Funds New World Fund |
| OIBIX  | Invesco International Bond Fund |
| VWIGX  | Vanguard International Growth Fund |
| BPLBX  | BrandywineGLOBAL High Yield Fund |
| CFSTX  | Cornerstone Total Return Fund |

The 15 displayed tickers are:
DRRYX, FXAIX, PRPFX, TGEPX, VFWAX, FSPGX, HRAUX, WEGRX, VADFX, BGHIX, RTRIX, MWTSX, WFPRX, FDRXX, ADAXX

**Confirmed cause:** All 22 funds exist in the `funds` table (per Robert). The 7 missing funds have no `fund_scores` rows — they were never scored by the pipeline. The UI only displays funds that have scores. Task 14.2 (pipeline execution) should score all 22 and resolve this gap.

## Issues Found

### ISSUE-1: Quality scores >100 for some funds (Severity: HIGH)
5 of 15 funds display raw quality scores well above the 0–100 expected range:
- FXAIX: 996
- DRRYX: 958
- RTRIX: 890
- BGHIX: 807
- FSPGX: 327

The remaining 10 funds show quality scores in the expected 0–100 range (50–83). The displayed value comes from `holdings_quality` (the raw pre-z-space score) in Portfolio.tsx line 541. This does NOT affect the composite score (which uses z_holdings_quality via CDF normalization), but it is a misleading display for the user. Root cause investigation deferred to Task 14.3.

### ISSUE-2: Settings navigation appears broken (Severity: MEDIUM)
Clicking the SETTINGS tab from Portfolio did not navigate to the Settings page — the URL changed to /settings but the Portfolio content remained visible. May be a client-side routing issue.

### ISSUE-3: Nav tab labels don't match spec §6.7 (Severity: LOW)
Current tabs: PORTFOLIO | BRIEF | HISTORY | SETTINGS
Spec §6.7 / Session 11 changelog: Portfolio | Thesis | Briefs | Settings
"BRIEF" should be "Briefs" and "HISTORY" should be "Thesis" (or the Thesis page was renamed to History at some point).

### ISSUE-4: Local Vite build fails due to sandbox permissions (Severity: INFORMATIONAL)
`npm run build` fails at the Vite step with `EPERM: operation not permitted, unlink` when trying to clean `client/dist/assets/`. This is a sandbox/mounted-directory permission issue, NOT a code error. Both server `tsc` and client `tsc -b` compile clean. The Railway deployment builds successfully (app is live).

### ISSUE-5: Health endpoint returns 401 (Severity: LOW)
`/api/monitor/health` returns HTTP 401 (unauthorized). This endpoint should arguably be accessible without auth for uptime monitoring. Not blocking for integration testing.

## Database Tables Verified (via app behavior)
The following tables are confirmed functional based on the live app serving data:
- `funds` — 15 funds loaded with names, tickers, expense ratios
- `fund_scores` — composite scores, factor scores, z-scores all present
- `pipeline_runs` — "LIVE" badge implies at least one successful pipeline run
- `user_profiles` — user authenticated as racoursey with stored preferences

The following cache tables could NOT be verified via the UI alone (they are backend-only):
- `fmp_cache`
- `tiingo_price_cache`
- `finnhub_fee_cache`
- `sector_classifications`
- `holdings_cache`
- `allocation_history`

These will be exercised during Task 14.2 (pipeline execution).

## Conclusion
**Pre-flight: PASS with issues noted.** The environment is configured, the server is running, and fund data is present. The fund count discrepancy (15 of 22 scored) will be resolved by Task 14.2 (pipeline execution will score all 22). ISSUE-1 (quality scores >100) should be investigated in Task 14.3.
