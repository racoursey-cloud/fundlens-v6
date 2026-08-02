# S-H1 POST-REFRESH SWEEP REPORT — August 2, 2026 (run d7a7ddd3, 24.0 min, 23/23 funds, 10,216 holdings)

VERDICT: **FAIL — not because the cures missed, but because full-coverage sweeps
now see a systemic class the original audit only grazed.** — Fabio, for the record.

## What PASSED (the H1/H1-F1 targets, all verified in settled data)

- Known-bad thirteen: **zero rows**. ASML = ASMLF in VFWAX and VWIGX. Diageo → DGEAF,
  Bayer → BAYZF, BMW → BAMXF/BYMOF, RELX → RLXXF, Telecom Italia → TIAJF — all correct
  OTC codes now.
- CICHF class intact (16 rows) — the f1 amendment protected them exactly as designed.
- Equity-line whitespace tickers: zero (TVS bond string gone; TVS now TVSL / TVSMOTOR.NS).
- Fubon = Financials, TCC Group = Materials (h6 holding). Torrent = honest dash (h5 holding).
- Old currency-tail set (USD/EUR/GBP/CHF, ≥6): zero rows.

## What FAILED — the classes, measured over all 10,216 rows

| Class | Rows | Weight (pct-pts) | Funds | Examples |
|---|---|---|---|---|
| A. Vendor currency lines, new currencies (GBX/CAD) | 7 | 0.5 | 4 | Honeywell "HONGBX" (FXAIX 0.23%, VADFX 0.19%), Thomson Reuters "TRI4CAD", Carnival "CCL1GBX" |
| C. LSE order-book codes (0XXX.L) on US-listed names | 45 | 12.1 | 6 | **Medtronic "0Y6X.L" — 4.54% of MADFX, the exemplar fund**; Sherwin-Williams "0L5V.L", McDonald's "0R16.L", Eaton "0Y3K.L" |
| D. Bond rows wearing foreign-venue or ETF tickers | 75 | 17.6 | 8 | Bank of America bonds "BAC.SW", Alphabet "GOOG.NE" (Canadian CDR), Mastercard "MA.BA" (Buenos Aires); sovereigns as ETFs: Australia govt "VGB.AX", "SWITZERLAND" "UC94.L", Romania "ROX.DE", China govt "CBND.L" |
| F. ".XD" vendor placeholders | 3 | 0.3 | 1 | Investor AB "INVEAS.XD", Hexagon "HEXABS.XD" |
| G. Digit-lead venue codes | 8 | 2.8 | 6 | DuPont "6D8", Apellis "1JK", American Tower "A0T.DU" |

~138 rows, ~33 percentage points of member-visible weight, concentrated in the bond
funds (MWTSX, BPLBX, BGHIX, TGEPX, OIBIX, DRRYX, PRPFX) plus MADFX and VADFX.

## Why pattern cures stopped working — the diagnosis

Three cure cycles each killed its named tickers and the resolver then served the
NEXT candidate off the same junk-heavy lists (HONGBP → HONGBX; TRI4EUR → TRI4CAD).
Negative filtering cannot win against a vendor list with more junk lines than good
ones. The durable fix is **positive validation**: a ticker is displayed only if we
can affirmatively vouch for it, not merely fail to recognize it as junk. The pieces
already exist: FMP's ticker universe with the h6 name-agreement matcher (built,
proven), tier ranking, and the CINS/ISIN country machinery.

## PROPOSED DISPLAY POLICY (the ruling that ends this)

"The Ticker column shows an identifier a member could type into a quote site and
find the security — or a dash."

1. US-listed ticker where one exists (MDT, not 0Y6X.L; validated: FMP knows it and
   the profile name agrees per h6).
2. Else the OTC code (ASMLF, SSNLF — same validation).
3. Else the bare home-market code where the venue matches the security's country
   (000660, RELIANCE, 2222.SR, 9433.T-style shown bare as "9433"); vendor suffixes
   stripped for display consistency.
4. Corporate-bond rows: the ISSUER's ticker by rules 1–3 (BAC, not BAC.SW) — it is
   there for enrichment anyway. Sovereign/government rows: always a dash — a
   government is not a ticker, and an ETF is not a government.
5. Anything that passes none of these displays a dash. A dash is honest.

Implementation is one order (working name H1-F2): a validation pass at the same
post-cache point where h5 lives, consuming the FMP universe + h6 matcher + country
machinery. One build, one refresh, then the sweeps re-run and the 23 sheets follow.

## Sequencing note

The 23 review sheets are BLOCKED on this ruling — every flagged row's verdict
("defect" vs "fine") depends on which policy governs. Sheeting first would mean
re-sheeting after.

## Carried FOLLOWUPS candidates from this cycle

- Pipeline run panel shows no resolution-phase progress; a healthy 20-minute quiet
  stretch reads as a hang (caused one user cancel today).
- "TVSMOTOR.NS"-style suffixed local codes vs bare-code convention (policy rule 3
  resolves this if adopted).
