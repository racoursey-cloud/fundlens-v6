# FUNDLENS VFWAX HOLDINGS AUDIT — August 2, 2026

Scope: all VFWAX holdings rows in `holdings_cache` (3,855 rows; dossier says 3,918 filed), audited programmatically for ticker-resolution and sector errors, with web verification of flagged rows. Read-only; no rows changed. — Fabio, for the record.

## VERDICT

The ticker column is overwhelmingly correct. The local-code conventions that look odd are mostly real (Korean 000660 ✓, KRX preferred codes like 00680K ✓, Thai foreign-board /F lines ✓, Brazilian B3 codes ✓, JPX alphanumeric 417A ✓, NSE codes like 360ONE ✓). Corporate renames are being tracked correctly (Barrick→B, Zomato→ETERNAL, Bancolombia→CIB, Pilbara→PLS, Phoenix→Standard Life, Ashtead→Sunbelt/SUNB, Incitec→Dyno Nobel, unchanged tickers with new names — the vendor is fresher than FMP here). Out of the 1,000 rows the app displays, roughly a dozen are genuinely wrong or garbled.

## A. WRONG-COMPANY TICKERS (member sees another company's symbol) — blocking-class

1. **ASML Holding NV → "ASMH"** (1.43% VFWAX; 3.44% VWIGX). ASMH is a third-party single-stock currency-hedged ETF on NYSE Arca, not ASML. Correct by house convention (TSMWF/SSNLF pattern): **ASMLF**. A correct ASMLF row already exists in cusip_cache; the bad row is cusip N07059202.
2. **Torrent Pharmaceuticals → "TRP"** (0.012%). TRP is TC Energy's NYSE ticker — and TC Energy also appears in this fund as TRP (0.18%). Two different companies, same displayed ticker, same page.
3. **Kotak Mahindra Bank → "KMB"** (0.057%). Bare Bloomberg-India code; KMB on any US quote system is Kimberly-Clark. Same collision family (bare Indian codes shown without the exchange qualifier): BHE (Bharat Electronics vs US BHE), 3M (3M India; NSE symbol is actually 3MINDIA), MM, LT, TATA, INFO, TMCV etc. Most don't collide; KMB, TRP, BHE, 3M do or will.

## B. GARBAGE / INTERNAL CODES DISPLAYED AS TICKERS — blocking-class

- Thomson Reuters → **TRI4EUR**; Telecom Italia → **TITUSD**; Swissquote → **SQNEUR**; Polyus → **PLZLUSD** (vendor line-code strings, not tickers)
- TVS Motor → **"TVSLIN 6 09/01/26"** — a bond identifier displayed as an equity ticker
- "Samsung Episholdings Co Ltd" → **0126Z0** — garbled name and placeholder code (likely Samsung EPIS Holdings unlisted line); SKC Co → **0117901G** similar

## C. WRONG-VENUE / STALE VENUE CODES (right company, wrong or defunct listing)

- Diageo → **DGE.PA** (no Paris listing; LSE is DGE.L)
- Bayer → **BAY.WA** (no Warsaw listing; Xetra is BAYN)
- BMW → **BMW.SW** (no Swiss listing; Xetra is BMW)
- RELX → **REN.AS** (Amsterdam line discontinued)
- BASF → **BASA.DE** (Xetra symbol is BAS — suspect)
- Obscure-but-real secondary venues a member won't recognize: ABB → 0NX2.L, Geberit → 0QQ2.L (LSE international order book), Compass → XGR2.DE, IHG → IC1B.F, Hermès → HMI.DE (Frankfurt cross-lists). Not false, but inconsistent with the OTC-ticker convention used elsewhere.

## D. SECTOR ERRORS (root cause: FMP profile cache, not the resolver)

- **Fubon Financial shows sector "Technology."** Its ticker FUISF is correct (verified: Fubon's real OTC symbol), but FMP's cached profile for FUISF is *Fujitsu Limited* — wrong company on FMP's side — and the Technology sector came along with it.
- **TCC Group (TGBMF)**: ticker correct, FMP profile says *Taseko Mines* (wrong company). Sector currently Financials→? (row shows Financials — verify at next rebuild).
- **Oriental Land (theme parks) shows "Technology"** — FMP's own junk classification, inherited.
- **Sunbelt Rentals (equipment rental) shows "Financials"** — FMP classes it Financial-Credit Services, inherited.
- **Valterra Platinum shows sector "Precious Metals"** — an off-taxonomy label leaking into the sector column (every other row uses the standard 11+Fixed Income/Other set). Polyus also carries it.
- Defensible, no action: FUJIFILM=Healthcare, Kawasaki Heavy=Consumer Discretionary (FMP's auto/motorcycle framing).
- **Caution for the drill-in feature under discussion:** an in-app company panel keyed by ticker would show Fujitsu's description under Fubon and Taseko's under TCC. FMP wrong-company profiles must be handled before that feature builds.

## E. DISPLAY COPY DEFECTS

1. **"Showing all 1000 holdings as filed"** — the filing has 3,918 holdings (3,855 stored); the app shows the top 1,000. "All ... as filed" is false as displayed. Blocking-class copy fix.
2. **"Vanguard Cmt Funds-Vanguard Market Liquidity Fundcash reserves"** — the stored name ends at "...Liquidity Fund"; the UI concatenates a "cash reserves" label with no separator. Cosmetic render bug.
3. Rows with no ticker show "—" (18 rows, incl. L'Oréal/Air Liquide/Engie secondary lines and the unnamed row) — consistent with the as-filed posture; no action.

## PROPOSED CURES (nothing executed)

- Row edits on Robert's typed word: ASMH→ASMLF (cusip_cache + 2 holdings rows). The rest of A/B/C are resolver-logic and refresh-pipeline issues — a Clyde order, not row surgery (hand-editing ~15 rows would be overwritten at next holdings refresh).
- Clyde order candidates: (1) holdings copy fix "Showing largest 1,000 of N holdings as filed"; (2) name/label concatenation spacing; (3) resolver rules: reject line-code patterns (…USD/…EUR suffixes, bond-ID strings), prefer OTC F/Y tickers over foreign venue suffixes, qualify or suppress bare Bloomberg India codes; (4) sector: normalize off-taxonomy labels; flag FMP wrong-company profiles (FUISF, TGBMF) before any drill-in feature.
- FOLLOWUPS one-liners if deferred.
