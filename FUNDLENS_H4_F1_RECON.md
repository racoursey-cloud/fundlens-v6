# FUNDLENS_H4_F1_RECON.md — Task 1 recon (NO CODE)

**Order:** `FUNDLENS_H4_F1_CURE_ORDER.md`, Task 1.
**Session:** Clyde, August 16, 2026. Branch `claude/new-session-e4xddx`. No code changed.
**Verdict: STOP AND REPORT.** Both stop conditions the order names are met — the cure lands in a file the reference tier also renders, and the finding is not the one the order diagnosed.

---

## 1. The short version, in plain English

Robert is right that the drill cards are broken, and right that the data was never
missing. But the cause is not what the order says it is.

The order's diagnosis (§2.2) is that the card is a **stub** — that it throws away the
company information it was handed. That is not what the code does. The unified card is
already wired to both drill surfaces, already receives the payload, and already renders
it. **Task 2 of the order is already built.**

What is actually wrong is a **layout** fault, one property wide. When a sector is
selected, the holdings list becomes a 300-pixel window. The card opens inside that
window as a box with rounded corners. That box is allowed to be **squeezed to nothing**
when the list is longer than the window — and it is squeezed first and hardest, because
of one styling choice (`overflow: hidden`, added to round its corners) that also tells
the browser "this box may shrink to zero height."

The rows themselves cannot be squeezed below their own text. The card can. So the card
gets crushed to a **2-pixel sliver** — and a 2-pixel sliver of a bordered box is
precisely **a gray line**.

The card behind that line is fully rendered, 121 pixels tall, with every fact on it. It
is simply clipped down to two pixels of itself.

Everything in Robert's report follows from this one fact, including the parts that
looked contradictory:

| What was observed | Why |
| --- | --- |
| Siemens, Schneider, and the rest all show a gray line | VFWAX Industrials is **69 rows**; anything past ~18 crushes the card to 2px |
| The API call fires and returns 200 | The card is mounted and working — it just has no height to draw in |
| No console errors | Nothing failed. Nothing is broken in code. It is a squeeze, not a crash |
| Brief **Top Holdings** (NVIDIA) serves the full card on the same page | The unfiltered list is capped at 8 rows and has **no** 300px window — nothing to squeeze |
| The drill window "moves correctly" | It does. The row is pinned to the top of the window exactly as designed — the card that opens under it is 2px |

## 2. The measurement (pixels, at HEAD)

The shipped `FundExposurePanel` was mounted in a headless browser with VFWAX-shaped
rows and its company lookup forced to return nothing — the **worst case**, the honest
fallback. Clicking the top row and measuring the expansion:

| Rows in the selected sector | Expansion height on screen | Card's own height |
| ---: | ---: | ---: |
| 8 | **123 px** (full card) | 121 px |
| 11 | 94 px | 121 px |
| 14 | 40 px | 121 px |
| 18 | **2 px** | 121 px |
| 22 | **2 px** | 121 px |
| 28 | **2 px** | 121 px |
| **69 — VFWAX Industrials, live** | **2 px — the gray line** | 121 px |

The card's height never changes. Only the amount of it allowed on screen does.

At 8 rows the DOM under a clicked Siemens row reads, in full:

```
Siemens AG · SMAWF · 0.6% of VFWAX · Industrials · Search Wikipedia ↗
```

— a `DIV` plus **three** `<p>` elements, on the filled `#16181c` card background. §2.2 of
the order reports "a single `<p>`, 18px, containing exactly '0.6% of VFWAX'". That is
the **second** of those three paragraphs, measured on its own. The pixel half of §2.2
("a gray line") is exactly right; the DOM half read one paragraph and took it for the
whole card.

### Why the card is the only thing that shrinks

The holdings list is a vertical flex column with `max-height: 300px`. In a flex column,
children shrink to fit before the container is allowed to scroll.

- A **row** cannot shrink below the height of its own text — that is the browser's
  default floor for a flex item.
- The **card's wrapper** has `overflow: hidden` on it (`FundExposurePanel.tsx:526–532`),
  put there so the border radius clips. `overflow: hidden` removes that floor: the
  browser is now permitted to shrink the box to **zero**.

So the entire overflow of a 69-row list is charged to the one item that is allowed to
absorb it, and the card is squeezed out of existence while the rows stay legible.

`CARD_MIN_HEIGHT = 92` (`HoldingCompanyPanel.tsx:141`) does not protect it: that minimum
sits on the card, which is the wrapper's **child**. The wrapper is the item that shrinks,
and it carries no minimum of its own.

`drill-scroll.ts` is not implicated. Below ~18 rows it correctly finds no scroller
(nothing overflows — the card was squeezed instead); above it, it finds the scroller and
pins the row to the top exactly as designed. Both behaviors are correct. Neither helps,
because the thing being scrolled to is two pixels tall.

### The cure, tested

Making the card's wrapper unshrinkable — one property — restores it at every list length:

| Rows | As shipped | With the wrapper made unshrinkable |
| ---: | ---: | ---: |
| 14 | 40 px | **123 px** |
| 22 | 2 px | **123 px** |
| 28 | 2 px | **123 px** |
| 69 | 2 px | **123 px** |

The row still pins to the top of the window; the list scrolls normally instead of
crushing its contents. Screenshots of the 69-row case, before and after, accompany this
report.

## 3. Task 1's questions, answered

**Which components render the two adviser-tier drill lists and their expansion card?**

**One component, not two.** Both surfaces the order names are the same file:

- `client/src/components/FundExposurePanel.tsx` — its inner `HoldingsList` (lines 449–557)
  renders the rows and the expansion on every surface.

Its three call sites:

| Call site | Surface | Tier |
| --- | --- | --- |
| `pages/YourBrief.tsx:1116` | Brief → Your Allocation → Sector Exposure → *SECTOR* HOLDINGS | full (adviser) only |
| `pages/reference/FundDetail.tsx:660` | Funds → fund → Sectors tab → sector drill | **both tiers** |
| `pages/reference/MyMix.tsx:831` | My Mix → sector panel → sector drill | **both tiers** |

**Which card variant is mounted?** The unified one — `HoldingCompanyPanel`
(`FundExposurePanel.tsx:533`). There is no stub variant anywhere in the client; the app
has exactly one company card and this is it.

**Where does the fetched `/api/holdings/company` response go today?** Into the card's own
single-value `Lookup` state (`HoldingCompanyPanel.tsx:134–182`) and straight onto the
screen — description, city, exchange, listing date, all of it. It is not dropped, not
parked in a separate slice, and not un-requested. It is rendered, and then clipped.

**Does any reference-tier file have to change?** **Yes — and this is the stop.**
`FundExposurePanel.tsx` states in its own header that "BOTH TIERS render this," and two of
its three call sites live under `pages/reference/`. The fence cannot be held here: the
Brief's drill and the reference tier's Sectors drill are the *same rendered component*,
and the defect is in that component. There is no adviser-only edit that fixes Robert's
Brief.

Byte-diff note for whoever builds: the change is presentational only — no data, no props,
no payload, no allowlist. The reference tier's served facts are untouched; the reference
tier's **pixels** change, because its Sectors drill is broken in the identical way today.

## 4. Task 3 — the tier sweep, complete

Every list in the app that opens a holding expansion, and whether it can be crushed:

| Surface | Tier | Door? | Card | Verdict |
| --- | --- | --- | --- | --- |
| Brief → sector drill | full | yes | unified | **BROKEN — collapses to 2px** |
| Brief → Top Holdings (unfiltered, ≤8) | full | yes | unified | OK — no window |
| Funds → fund → **Sectors** drill | both | yes | unified | **BROKEN — same component** |
| Funds → fund → Sectors, Top Holdings (≤8) | both | yes | unified | OK — no window |
| Funds → fund → **Holdings** tab (420px) | both | yes | unified | OK — a table, not a flex column |
| Funds → Holdings search | both | yes | unified | OK — no window (the control case) |
| My Mix → **sector drill** | both | yes | unified | **BROKEN — same component** |
| My Mix → "Held through more than one fund" | both | yes | unified | OK — flex column, no height cap |
| My Mix → "Holdings across the mix" (360px) | both | yes | unified | OK — block layout, not flex |
| My Mix → Holdings search | both | yes | unified | OK — no window |
| **Research** | full | **no door** | — | no holding rows; its drills open funds and sectors, not companies |
| Settings · Pipeline · Help chat | — | no door | — | n/a |

**Nothing was left unswept.** All three broken entries are the same component through
three doors. The mobile layout is affected identically (`FundExposurePanel.tsx:313–318`
renders the same list inside the same window).

Scale of the live blast radius, from the current snapshot: of the sector lists on VFWAX
and FXAIX alone, **19 of 25 exceed 14 rows** and **17 of 25 exceed 18** — so on those two
funds nearly every sector drill, on all three surfaces, is a gray line today.

## 5. What this means for the order

The order's §3 Task 2 — "replace the stub expansion with the unified HoldingCompanyPanel"
— has **nothing to replace**. Building it as written would mean rewriting working code
around a defect that is not there, and would leave the gray line exactly where it is.

Every field requirement Task 2 lists is already shipped and verifiable in the source:
single-state machine, honest fallback, vendor-only industry gate, display-ticker honesty,
"X% of FUND" caption naming its denominator, FMP attribution, Wikipedia on the fallback,
deterministic `scrollTop` via refs with no `scrollIntoView`. The one prescription not met
is "**card visually unmistakable (filled background, min-height)**" — the background is
filled and the min-height exists, but the min-height is on the wrong element to survive
the squeeze.

So the cure is smaller than the order anticipated and lands in a place the order fenced
off. That is Robert's call to make, not mine.

## 6. What I need from Robert

1. **Ratify the re-diagnosis** — the drill card is not a stub; it is a rendered card
   crushed to two pixels by a flex-shrink in its 300px window.
2. **Lift the fence for `FundExposurePanel.tsx`**, or say otherwise. The Brief's drill and
   the reference tier's Sectors drill are one component; there is no adviser-only cure.
   Leg 6 of the acceptance battery (reference-tier Sectors drill) stops being a
   confirmation and becomes a **second fix site** — it is broken today, for the same
   reason.
3. **Confirm the shape of the build** if the above is ratified: one file
   (`client/src/components/FundExposurePanel.tsx`), one property on the expansion wrapper
   so it can no longer be shrunk, committed as `H4-F1 (1/1)`. No new fields, no new
   endpoints, no schema change, no allowlist edit — D1 through D3 of the order stand
   untouched.

The S-H4-F1 acceptance battery in §4 of the order needs no change other than the
reclassification of leg 6, and its legs 1–4 are exactly the right test: at 69 rows, leg 2
(the deep row) and leg 1 (the top row) both fail today and both pass with the cure.

---

*Recon only. No file in `client/` or `src/` was modified. Verification harness and
screenshots were produced outside the repository. Read-only SQL was used to count the
live snapshot rows; no DDL, no writes.*
