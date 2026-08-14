# U1 — App Unification: One App, Modules by Entitlement
## Status: RATIFIED — August 2, 2026, by Robert · planned by Fabio · U1-A to be built by Clyde (then H2, then U1-B, then U1-C)

Final ruling at ratification (Robert): "everyone lands on Funds — agreed." Item 6 below
is confirmed; no open items remain.

## AMENDMENT — August 14, 2026, by Robert

**Ruling 2 (fund selection) is DISSOLVED BY PREMISE FAILURE. The per-row selection
toggle is STRUCK from Wave U1-B.**

Ruling 2 moved fund selection "from Settings to the unified grid." There was never a
working selection to move:

- **Settings' fund list is read-only, and always was** — ticker, name, expense ratio, no
  control of any kind. Its docblock's "enable/disable" describes a feature that has never
  existed in this codebase; it is stale text carried in from the v5.1 port.
- **`selected_fund_ids` is written but never read.** The Setup Wizard writes it and the
  profile route accepts it. Nothing consumes it: not My Mix, not Your Brief, not the
  brief generator, not the allocation math.

Confirmed behaviorally, not only by search: the admin profile carries a real selection —
22 of 23 funds, CEMEX deliberately excluded at setup — and the July 29 allocation in
`allocation_history` contains CEMEX anyway. **The control overrode a decision its owner
actually made.** No toggle that writes an unread field will be built in this house.

Struck with it, as the clauses this dissolve touches:

- **Ruling 2**, in full.
- **Wave U1-A's** "Settings keeps its fund list UNTIL the grid toggle exists" guard.
  Nothing orphans, because nothing ever worked.
- **Wave U1-B's** grid bullet — the words "and the selection toggle".
- **Wave U1-B's** Settings bullet — the condition "the same wave the grid toggle lands".
  The list retires in U1-B regardless, on its own merits: read-only, and duplicated by
  the unified grid it sat beside.
- **Verification's** "selection round-trips to mix/brief", which would now verify a
  dissolved feature.

If fund selection is ever wanted for real, it arrives as its own future order, with the
generation-behavior semantics decided on purpose. It does not ride a display wave.

Ruled on Clyde's U1-B Evidence Gate finding 3 and Fabio's data review. Everything else in
this assignment stands as ratified.

## THE VISION (Robert, August 2)

One app, one truth. The reference experience is the shared base for every account;
full-tier and admin surfaces are MODULES that light up — additional tabs, columns, and
affordances — like turning on parts of the app. No more parallel page trees drifting
apart (the two-holdings-tables bug class dies permanently).

**The safety architecture does not move:** the B2 allowlist (reference-shape.ts) and
requireFullTier remain the only decider of what DATA ships per tier. Client tabs render
from the payload; a reference browser could mount every component in the codebase and
still hold only reference-shaped data. Entitlements are DERIVED in client code from the
existing access_tier + is_admin — no new columns, no Database-law ceremony.

## RULINGS OF RECORD (all Robert, August 2, 2026)

1. Full-tier Help page RETIRES → a global chat affordance: small icon, top-right of the
   shell, opens a modal. Admin/full only. MINIMAL grounding investment — existing fund
   data + scoring outputs; "it's primarily for me; develop later if we want." The
   fenced reference Help page is untouched and remains the member surface.
2. ~~Fund selection (which funds feed mix/brief) moves from Settings to the unified grid
   as a per-row toggle — FULL TIER ONLY. Reference members explore; nothing persists.~~
   **DISSOLVED — Amendment, August 14, 2026 (premise failure: there was no working
   selection to move).**
3. Sequencing: SHELL FIRST (U1-A), then H2 company panel, then the fund-experience
   merge (U1-B). H2 correctly held as draft by Clyde until its gate cleared; it builds
   into the unified base once U1-A lands, so the panel is built exactly once.
4. Research stays OUT of the reference tier (posture ruling, August 2) — offered to
   HR/legal as a deliberately-excluded, ready-to-discuss add-on, not shipped.
5. Combined fund grid style: reference grid's SORTABLE COLUMNS as the skeleton; the
   full version's EXPAND ARROW and BLUE TICKER styling as the skin.
6. Stated default, subject to veto: everyone lands on Funds. (Full tier currently
   lands on Brief; in the unified shell, Brief is one tab over.)

## WAVE U1-A — THE SHELL (build first; small)

- One shell replaces AppShell/ReferenceShell: nav renders its tab list from a derived
  capability set. Reference accounts: Funds · My Mix · Help. Full/admin adds: Brief ·
  Research · Pipeline (admin) · Settings.
- The reference pages become the shared base for all tiers — full tier sees the
  reference Funds grid/detail as-is in this wave (scores arrive in U1-B).
- Global chat icon + modal (ruling 1): minimal prompt over existing data; Opus seat per
  the seating chart; standard rate limit; no fence (full/admin surface).
- Old full-tier Help page retires. FundLens page SURVIVES this wave (retires in U1-B).
- ~~Settings keeps its fund list UNTIL the grid toggle exists (U1-B) — selection must
  never be orphaned between waves.~~ **STRUCK — Amendment, August 14, 2026.**

## THEN: H2 (already ratified) builds into the unified fund detail. One build, no port.

## WAVE U1-B — THE FUND EXPERIENCE (the real merge; medium)

- ONE grid: sortable columns (reference skeleton), expand arrow + blue ticker (full
  skin), score/tier columns ~~and the selection toggle~~ rendered only when the payload
  carries full-tier fields. FundLens.tsx retires.
  *(toggle STRUCK — Amendment, August 14, 2026)*
- ONE fund detail: About / Holdings / Sectors as the shared base, plus for full tier a
  Scores tab (the FundLens evaluative content re-homed as a module).
- The Your Allocation donut EXTRACTED from YourBrief into a shared component and
  embedded per-fund: sector exposure left, holdings right, same interactions, risk
  dial removed. Both tiers get it (sector data already ships in the reference
  allowlist — richer view, zero new data).
- Settings drops its fund list ~~the same wave the grid toggle lands~~ **in this wave
  regardless — Amendment, August 14, 2026** (read-only, and duplicated by the one grid).

## WAVE U1-C — BRIEF & RESEARCH (display-level; small)

- Your Brief trims to the personal core: recommendation, the why, your allocation.
  Brief history capped at the last five, older not displayed.
- Research remains the single home of market context (sector outlook, regime, news);
  the brief stops repeating it. Display-level only in this wave — brief GENERATION
  prompts are untouched (a content-generation trim is its own later order if wanted).

## SCOPE GUARDS

No DDL, no schema changes, no new env vars, no model changes. reference-shape.ts and
the fence untouched in all three waves. One file per commit; Evidence Gate per wave;
Clyde discloses judgment calls on the PR per house practice.

## VERIFICATION (per wave, Fabio)

Reference-account probe: member sees exactly the three member tabs, no new columns, no
chat icon; payload byte-shape unchanged (server untouched, so this is a client check).
Full-account probe: modules present, old bookmarks redirect sanely. U1-B adds: one
grid sorts correctly both tiers; donut parity with the old YourBrief component;
~~selection round-trips to mix/brief~~ **STRUCK — Amendment, August 14, 2026 (verifies a
dissolved feature)**. Existing proof battery re-run green each wave.

*— Drafted by Fabio, August 2, 2026, from Robert's directives and rulings of the same
date. For ratification: confirm or veto the landing-page default (item 6), then hand
U1-A to Clyde. Fabio, for the record.*
