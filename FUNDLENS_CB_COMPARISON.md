# CB §4 — Classifier Seat: The Three-Model Comparison
## Compiled by Fabio, August 1, 2026 · same 400-holding out-of-sample test, same FMP ground truth, exact production prompts and parsers

## The numbers

| Model | Sector agreement | Industry agreement (159 menu) | Parser coercions to "Other" |
|---|---|---|---|
| Haiku (seat) | 343/400 = **85.8%** | 219/400 = **54.8%** | 1 |
| Sonnet 5 | 276/400 = 69.0% *(not valid — see artifact)* | 282/400 = **70.5%** | ~90 |
| **Opus 5** | 365/400 = **91.3%** | 292/400 = **73.0%** | **0** |

**The ratified decision rule:** challenger takes the seat only if it beats
Haiku's industry agreement by ≥3 points without regressing sector
agreement.

**Opus passes outright: industry +18.2 points, sector +5.5 points, zero
parser artifacts in 400 holdings.** Both margins are far outside sampling
noise at this sample size (the industry gap is roughly five standard
errors wide). Opus's phrasing sailed through the production parser — its
35 sector disagreements contain not a single coerced "Other," so its
numbers needed no instrument correction.

**Sonnet cannot be certified under the rule as written.** Its industry
gain (+15.7) clears the bar, but its sector number is an instrument
artifact — roughly ninety of its 124 sector "disagreements" are the
parser stamping unparsed replies as "Other" (NVIDIA, Meta, FedEx, Shell —
answers no model gets wrong). Its true sector agreement is unknown
without the raw-capture cure and a re-run. Against Opus it is likely
close on industry (70.5 vs 73.0 — inside sampling noise of each other),
cheaper per call, and unmeasured on sector.

## What the disagreement lists say beyond the numbers

- **Both challengers and the incumbent get docked for agreeing with the
  app's own menu.** All three models put gold and silver miners in
  "Precious Metals" — the sector Robert's fifteen-name menu deliberately
  carved out — while FMP's ground truth calls them "Materials." Several
  of Opus's other "misses" are FMP being wrong or coarse (Nintendo and
  Capcom to Communication Services; Haleon to Consumer Staples; BNP,
  Mizuho, and Crédit Agricole as "regional" banks). A stronger model is
  penalized MORE by noisy ground truth, so 91.3/73.0 likely understate
  Opus.
- **Haiku's misses include genuine howlers now cached in production:**
  Sankyo (a pachinko company) filed under Apparel; Discovery Ltd (a
  South African insurer) under Broadcasting; DCC (an energy group)
  under Food Distribution. Opus's and Sonnet's misses are overwhelmingly
  adjacent-category calls.
- **The sector parser is brittle by construction** — tuned to Haiku-style
  replies, coercing anything else to "Other." Opus happens to phrase
  compatibly (0 coercions in 400). This stays a latent risk for any
  future model change and goes to FOLLOWUPS regardless of today's ruling.

## Cost at seat volumes

Classification is cached — a holding is classified once, ever. Steady
state is new holdings only: pennies per month on any of the three. A
one-time full reclassification of all ~10,000 cached holdings, if Robert
wants uniform provenance and Haiku's cached howlers purged: roughly $2
on Haiku, $4 on Sonnet, $9–10 on Opus. There is no volume at which the
price difference matters for this app.

## Fabio's recommendation, for Robert's ruling

**Opus takes the seat.** It is the only challenger that passes the
ratified rule on clean instrumentation, it beat the incumbent on both
levels by wide margins, and the cost premium is immaterial at cached
volumes. The alternative — cure the benchmark's raw-capture gap, re-run
Sonnet, and possibly certify a marginally cheaper near-equal — buys
pennies at the price of another cure-and-measure cycle; recommended only
if Robert wants the Sonnet number for the record.

**What the swap order (CB-S, next) must contain — flagged now:**

1. **The constant split.** `CLAUDE.CLASSIFICATION_MODEL` is used by MORE
   than the classifier — notably the legacy full-tier Help chat runs on
   it. Swapping the constant blind would silently re-seat that chat on
   Opus. The order must split the constant (a new `CLASSIFIER_MODEL` for
   classification + benchmark; the legacy chat keeps Haiku) — this is
   exactly the kind of side effect the frozen-constants law exists to
   force into the open.
2. **Robert's call on the one-time reclassification** (~$10, purges the
   cached howlers, uniform provenance) — recommended.
3. **FOLLOWUPS lines:** the `industry_haiku_pct` column name goes stale
   at swap; the sector parser's coerce-to-Other brittleness (raw-reply
   logging or synonym tolerance, a future wave).

*— Fabio, for the record. Three models, one instrument, one artifact
found and routed around; the rule you set before seeing a number now
gives its answer.*
