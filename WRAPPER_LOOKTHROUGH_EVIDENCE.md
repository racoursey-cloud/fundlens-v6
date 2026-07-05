# Wrapper Look-Through — Evidence Appendix (v8 Register Item)

**Status:** Banked 2026-07-05. Not scheduled. Excluded from the v7 universe by Robert's ratification.
**Future assignment:** v8 A-series, wrapper look-through — new fund type, fact-sheet ingestion, blended scoring.
**Source documents:** Five Alta Trust / GGA Retirement fact sheets, all as of 12/31/2025, uploaded by Robert 2026-07-05. Refresh cadence is quarterly; sheets go stale.

## What these are

Five collective investment trusts (CITs) offered in the TerrAscend plan as "Personal Portfolios," managed by Granite Group Advisors, trusteed by Alta Trust Company (South Dakota). CITs are not SEC-registered: **no N-PORT, no EDGAR path, no public daily NAV.** The standard pipeline cannot see them. All data comes from these quarterly fact sheets.

## Ticker → trust mapping (confirmed against sheet content and plan categories)

| Plan ID | Trust | CUSIP | Target mix | All-in expense | Turnover |
|---|---|---|---|---|---|
| QIOOQ | GGA Aggressive All Equity Class 1 | 38741M105 | 100% equity | 0.49% | 22% |
| QIOKQ | GGA Aggressive Balanced Class 1 | 38741M600 | 80/20 | 0.48% | 24% |
| QIOPQ | GGA Moderate Balanced Class 1 | 38741M402 | 60/40 | 0.47% | 12% |
| QIOLQ | GGA Conservative Balanced Class 1 | 38741M709 | 40/60 | 0.50% | 12% |
| QIOMQ | GGA Fixed Income Class 1 | 38741M881 | 100% fixed income | 0.53% | 20% |

All five: inception 5/1/2020, Class 1, no shareholder-level fees (expense is all-in at trust level). The plan ID pattern is recordkeeper-internal (Q-wrapped); CUSIP is the durable identifier.

**Data quirk:** the plan election screen categorizes QIOOQ as "Large Blend"; the sheet shows a global all-equity blend (15.2% foreign large, 9.15% diversified EM). Recordkeeper category is unreliable; use sheet data.

## Template consistency (the parser spec)

Identical layout across all five: header (name, CUSIP, as-of date), Fund Objective, Fund Strategy, Performance table (YTD/1M/3M/1Y/3Y/5Y/10Y/ITD vs a named Morningstar or Bloomberg benchmark, net of fees), Top Holdings (name + weight, **names truncated, no tickers/CUSIPs on underlyings**), Fund Allocations pie (asset-class level), Portfolio Sectors bars (Morningstar-category granularity, sums to ~100%), page 2: Disclosures, Fees (single all-in Total Annual Operating Expense), Contact. One parser handles all five. Top Holdings count varies (10 for the four multi-asset trusts; 6 for Fixed Income, whose top 6 = ~100%).

## Underlying-position census (all five sheets combined, ~16 distinct positions)

**Bucket A — already in the FundLens universe (fully examined funds):**
- Vanguard FTSE All World ex US Index → VFWAX
- Allspring Special Mid Cap Value → WFPRX
- Metropolitan West Total Return Bond → MWTSX
- Fidelity 500 Index → FXAIX
- Invesco International Bond R6 → OIBIX
- American Funds New World → RNWGX

**Bucket B — strategy twins of universe funds (different vehicle, same strategy):**
- Carillon Eagle Mid Cap Growth CIT ↔ HRAUX
- Royce Total Return CIT R ↔ RTRIX
- Invesco S&P 500 Equal Weight ETF (RSP) ↔ VADFX

**Bucket C — outside the universe:**
- iShares Russell 1000 Value ETF (IWD), Russell 1000 Growth ETF (IWF), Russell 2000 Growth ETF (IWO), Core MSCI Emerging Markets ETF (IEMG) — all N-PORT filers, examinable if wanted
- Victory Fund for Income — mutual fund, N-PORT filer
- TCW Emerging Markets Sustainable — note: this is NOT TGEPX (TCW EM Income); distinct fund, verify identity at build time
- Alta Trust Short Term Investment Fund CIT — the sweep vehicle; cash-like; genuinely opaque; treat as cash bucket
- Cash (explicit line, Fixed Income sheet)

Weighted coverage: for each trust, Bucket A+B positions carry roughly 40–60% of top-holdings weight; sheets itemize ~85–100% of the trust (Fixed Income ~100%, multi-asset ~top-10 only with residual tail).

## Performance snapshot (net of fees, as of 12/31/2025 — for the record, not for scoring)

- All four equity-containing trusts trail their Morningstar benchmark on every period shown (YTD, 1Y, 3Y, 5Y, ITD). Example: Aggressive All Equity ITD 13.11% vs benchmark 14.45%; Aggressive Balanced ITD 11.51% vs 12.12%.
- GGA Fixed Income is the exception: trails Bloomberg Global Agg YTD (6.58% vs 8.17%) but beats it on 3Y (5.31% vs 3.98%), 5Y (1.21% vs −2.15%), and ITD (2.24% vs −0.64%).

## Design implications for the future assignment

1. **New fund type** (`wrapper` / `cit`): fact-sheet-sourced, quarterly staleness disclosed, lower confidence rung, "estimated" vocabulary. No Pulse (no daily NAV); Momentum either omitted or computed as a modeled composite from underlyings' NAVs — modeled, never presented as observed.
2. **Cost Efficiency is directly computable now:** the all-in expense (0.47–0.53%) is the number; note it embeds the underlying funds' expenses (no double-stacking).
3. **Look-through scoring:** Bucket A underlyings inherit full FundLens scores; Bucket B can inherit twin scores with a disclosed "strategy twin" flag; Bucket C either gets onboarded (ETFs are cheap) or carried as scored-by-category.
4. **Name matching is manual-assisted:** truncated names, no identifiers on underlyings. One-time mapping table per trust (this document is its first draft), refreshed quarterly with Robert's eyes on ambiguous rows.
5. **Ingestion path:** Robert uploads five PDFs quarterly; parser extracts holdings, sectors, expense, as-of date. Sector bars are already Morningstar-category granularity — potentially usable directly for Positioning without any per-holding work, which may be the cheapest v1.
6. **Sweep/cash handling:** Alta Trust STIF + Sweep sector (8–33% depending on trust!) treated as cash. Note Fixed Income trust is ~33% sweep — material to any scoring.

## Open questions for the assignment's Evidence Gate

- Confirm TCW Emerging Markets Sustainable identity (ticker, N-PORT availability).
- Confirm whether the 0.47–0.53% all-in expense includes or excludes acquired fund fees (sheet language says "All Fund included in the total annual operating expenses" — reads as inclusive; verify with Alta Trust docs if it matters to Cost scoring).
- Decide Bucket B twin-inheritance policy (inherit vs. onboard the actual vehicle).
- Decide whether the residual tail beyond top-10 (multi-asset trusts, ~15%) is scored by sector bars or disclosed as unexamined.
