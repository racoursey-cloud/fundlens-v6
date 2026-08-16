# FUNDLENS_U2_RECON.md — recon (NO CODE)

**Order:** `FUNDLENS_U2_BRAND_ORDER.md`, §4 sequence — "Clyde recon confirms ● LIVE semantics + enumerates v6 strings."
**Session:** Clyde, August 16, 2026. Branch restarted from merged `main` (`e670ed2`). No code changed.

**Headline: the ● LIVE badge is a live instrument, not branding — and the full tier has no tier badge to rename.** §2 and §3 of the order are coupled, and one ruling is needed before either can be built.

---

## 0. The gate, verified independently

The order states H4-F1 cleared and PR #85 merged. Confirmed against the remote rather than taken on report: `origin/main` is at `e670ed2` (merge of PR #85); all three H4-F1 commits are ancestors of it; `flexShrink: 0` is present at the fix site in `main`'s copy of `FundExposurePanel.tsx`. The gate is real.

## 1. §3 — WHAT ● LIVE ACTUALLY IS

**It encodes state. It is not static decoration.** The order asked recon to confirm this before the rename deletes an instrument; the answer is unambiguous.

`Shell.tsx:81–139` defines `SourceBadge` with **three** states, not one:

| State | Renders | Meaning |
| --- | --- | --- |
| `live` | green dot + **LIVE** | the last pipeline run completed |
| `analyzing` | spinning ring + **ANALYZING…** | a run is in flight right now |
| `seed` | no dot + **SEED DATA** | seed data — no completed run behind what you are looking at |

It is driven by real reads, not by a constant:

- `Shell.tsx:197–208` — one `/api/pipeline/status` call on mount sets `live` only when `latestRun.status === 'completed'`.
- `Shell.tsx:211–244` — a 2-second poll while a run is active, which drives `analyzing` and then settles the badge.
- `Shell.tsx:227` carries an explicit honesty guard, and its comment says why: *"'live' only if it completed (a cancelled or failed run must not flash LIVE)."*

**Consequence for the order.** Replacing `● LIVE` with `ANALYST` would not rename a badge — it would delete the data-freshness instrument and, with it, the ANALYZING and SEED DATA states and the honesty guard behind them. §3's own caution ("the rename must not silently delete an instrument") is the correct one, and it applies in full.

**The green dot specifically** is not separable branding either: it is the `live`-state marker (`Shell.tsx:94–97`). In `analyzing` it is replaced by a spinner; in `seed` there is no dot at all. There is no static dot anywhere in the lockup.

## 2. §3 — THE PROBLEM THE ORDER DID NOT ANTICIPATE

**The two tiers do not render the same kind of object, and the full tier has no tier badge at all.**

`capabilities.ts:100–127` gives the two tiers disjoint header chrome:

| | `referenceTag` | `dataFreshness` | What the header actually shows |
| --- | --- | --- | --- |
| reference | **true** | false | `FundLens` + a plain text tag reading REFERENCE |
| full | false | **true** | `FundLens` + the status pill (LIVE / ANALYZING… / SEED DATA) |

So today:

- The **REFERENCE** tag (`Shell.tsx:349–357`) is a bare `<span>` — no border, no background, no padding. It is a *name*.
- The **● LIVE** pill (`Shell.tsx:83–139`) is a bordered, filled, rounded badge. It is a *status*.

They are different classes of object that happen to occupy the same slot on different tiers. The order's §3 premise — "the full tier's badge becomes a name" — reads the pill as the full tier's tier-badge. It is not. **There is no ANALYST slot to rename into; one has to be created**, and the status pill has to keep existing alongside it.

This also makes §2 and §3 **coupled, not independent**. §2 asks for an identical lockup on both tiers (`FundLens <BADGE>`). That cannot be built until §3 decides what the full tier's badge *is* — because right now the full tier has nothing in that position except an instrument.

### The shapes available (findings, not a recommendation to adopt)

1. **Both** — `FundLens ANALYST` as the tier name, with the status pill following it. Keeps the instrument whole and makes the lockup symmetric. Costs header width; puts two objects where one sits today.
2. **Name only, status re-homed** — `FundLens ANALYST` in the lockup, and LIVE / ANALYZING… / SEED DATA moves to a deliberate home elsewhere (the order's own phrasing anticipates this). Keeps the lockup clean; needs a decision about where the instrument lands and whether it stays as visible.
3. **Name only, status dropped** — not viable without ruling that the instrument is expendable. Recorded for completeness; it is the outcome §3 explicitly warns against.

Form is a second question inside the same ruling: the REFERENCE tag is plain text and the pill is a chip. An identical lockup requires both tiers to use the same treatment — either both plain text, or both chips. That is a design call, not a build detail.

## 3. §2 — THE ALIGNMENT, MEASURED

The finding is real. The mechanical description in the order is not quite right, and the difference matters for the fix.

Measured in headless Chromium against a harness carrying the styles copied verbatim from `Shell.tsx:332–364` and `84–100`, with the real Inter webfont resolved (`document.fonts.ready`, font confirmed as Inter, not a fallback):

| Reference tier | y |
| --- | ---: |
| `FundLens` baseline | 34.5 |
| `REFERENCE` baseline | 32.5 |
| **baseline delta** | **−2.0 px** |
| `FundLens` cap-top | 21.5 |
| `REFERENCE` cap-top | 23.5 |

**The tag is not bottom-justified.** Its baseline sits **2px above** the wordmark's baseline, and its cap-top sits 2px below the wordmark's cap-top. It is anchored to neither line — it floats in the middle of the wordmark's band, touching nothing. Both ink bands happen to share a centre at y = 28.0, which is exactly what the header's `alignItems: 'center'` (`Shell.tsx:336`) produces: it centres *boxes*, and nothing in the lockup is baseline-aligned.

So Robert's eye is right that it reads wrong, and the order's §2 prescription — align on baseline/cap-height, not container bottom — is the correct cure. The phrase "bottom-justified" describes the symptom, not the mechanism; the mechanism is box-centring.

**The cure, measured.** Wrapping the wordmark and its badge in their own `align-items: baseline` group, leaving the header itself centred:

| | today | baseline-aligned |
| --- | ---: | ---: |
| reference: tag baseline delta | −2.0 px | **0.00 px** |
| full: pill text baseline delta | −1.5 px | +1.0 px |

The text tag lands exactly. **The pill does not** — it settles 1px on the other side, because it is a bordered box with its own 3px padding and its own internal centring, so its flex baseline is its content's, not its box's. A chip is read as an object rather than as type, so baselining its text may be the wrong target for it; that is a design judgment and it is flagged, not decided here.

**Fidelity caveat, stated plainly:** this is a faithful reconstruction of the shipped styles, not production pixels. I cannot reach `www.fundlens.app` from this environment — the network policy refuses it — so the production screenshots in the order's §6 remain the authority on what Robert saw. The reconstruction resolves the same webfont and the same declarations; the mechanism it identifies (`alignItems: 'center'`) is in the shipped source either way.

## 4. §1 — THE STRING SWEEP, COMPLETE

Swept: every `.tsx`/`.ts` in `client/src`, `client/index.html`, the email templates (`brief-email.ts`, `admin-alert.ts`), the server's user-reachable routes, and the pipeline log export. **No silent caps — everything found is listed.**

**User-facing version strings: exactly one.**

| File | Line | String | Surface |
| --- | ---: | --- | --- |
| `client/src/pages/Settings.tsx` | 377 | `FundLens v6 — 401(k) Fund Scoring & Allocation Platform` | Settings → About. **Full tier only** — reference accounts have no Settings tab (`capabilities.ts:104`) |

**Already clean, checked and confirmed:**

- `client/index.html` — `<title>FundLens</title>`. No version. No OG or meta tags exist to carry one.
- No dynamic `document.title` anywhere in the client.
- `brief-email.ts` — header wordmark (`:113`), body copy (`:131`, `:140`, `:144`) and the from-name (`:217`, `FundLens <brief@updates.fundlens.app>`) all read plain **FundLens**. The subject is the brief's own title (`:219`), not a branded string.
- `admin-alert.ts` — from-name, subject prefix and footer read **FundLens** / **FundLens Ops**. No version. (Admin-facing; listed for completeness.)
- `ErrorBoundary.tsx` — the error page reads "Something went wrong". No wordmark, no version.
- `routes.ts:1311` — the pipeline log export header reads `FundLens Pipeline Log`. No version.
- `ReferenceFooter.tsx:30` — the reference footer the order's §6 flagged. Confirmed: no version string in it.
- `Login.tsx:150`, `SetupWizard.tsx:405`, `Help.tsx`, `HelpChat.tsx`, `Shell.tsx:407–408` — all read plain **FundLens** or **FundLens Reference**.

**Everything else matching `v6` is out of scope by the order's own §1**, and is listed here only so the count is honest rather than quietly filtered: 28 docblock headers of the form `* FundLens v6 — <file purpose>`, the `v6.1`/`v6.2` engine-provenance comments in `allocation.ts` and `YourBrief.tsx`, and the internal server log at `server.ts:153` (`FundLens v6 server running on port…`). None are user-visible.

**One trap for whoever builds §1 and §2.** The reference tag is written as `Reference` in the source and rendered as REFERENCE by `text-transform: uppercase` (`Shell.tsx:352`). A sweep searching for the uppercase string will not find it. Same for any future ANALYST badge if it is styled the same way.

## 5. WHAT NEEDS A RULING BEFORE BUILD

1. **The instrument's fate (blocks §3, and §2 through it).** ● LIVE is the live/analyzing/seed indicator. Does ANALYST sit *beside* it, does the instrument move to a new home, or something else? The order anticipated this question; recon confirms it is live and must be answered first.
2. **Badge form (blocks §2).** REFERENCE is plain text; the status badge is a chip. "Identical lockup" needs both tiers on the same treatment — which one?
3. **The pill's alignment target (§2 detail).** Baseline alignment lands the text tag exactly and leaves a chip 1px off. Baseline the chip's text, or centre the chip's box against the wordmark's cap band? A design call.

Items 1 and 2 are not mine to rule and are not defaults I should pick; §1's single string change is independent of all three and could be built alone if that is wanted.

---

*Recon only. No file in `client/` or `src/` was modified. The measurement harness lives outside the repository.*
