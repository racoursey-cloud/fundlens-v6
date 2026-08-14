# Regime harness — fallback posture

**Status:** RECORDED — August 14, 2026, on Robert's ruling (A1-F1 p3).
**Nature:** a decision written down, not a feature. Nothing in A1-F1 builds
what this document describes. It exists so that nobody has to decide it
during an outage, when the pressure to improvise is highest.

**Governing law:** charter §5 (data law, two houses), §2.5 (determinism and
the vintage policy), A1 ruling **D1** (insurance rows seed dormant; a
missed-publication alert is the named trigger that opens a build slice —
act on a named trigger, never for insurance).

---

## Why this exists

The August 2026 artifact lag is the occasion. The Cleveland nowcast pair fell
two business days behind the publisher's own page, the morning check breached
every business day, and the honest fix was to widen that pair's grace to its
measured steady state (A1-F1 p2). Widening a grace buys quiet at the cost of
a day's detection latency. That trade is only defensible if what happens
*after* the alarm is already settled.

It is settled below.

---

## 1. The nowcasts have no fallback channel

`CLEV_CPI_NOWCAST` and `CLEV_PCE_NOWCAST` carry an empty `fallback_channel`
in the registry, and that is not an oversight — it is the truth. There is no
second machine-readable source for the Cleveland Fed's daily inflation
nowcast. The operator probe of August 14, 2026 confirmed why: the publisher's
nowcasting page is server-rendered and fires no data endpoint at all — its
tables live in the page's HTML. The JSON artifact the harness reads is the
only machine-readable channel that exists.

**Posture:** when the nowcasts go quiet, nothing substitutes for them
in kind. Do not go looking for one mid-outage. Scraping the page's HTML is
not adopted here; it would be a new source requiring its own vintage policy
under §4.2·6 before any race use, and that is a decision for a build slice
with a name, not for an outage.

## 2. Daily inflation timeliness rides the breakevens

The nowcasts sit in the **timeliness** tier of the **inflation** axis. They
are not alone there: `T10YIE` (10-year breakeven) and `T5YIFR` (5-year,
5-year forward) sit in the same tier on the same axis, publish via H.15 each
business day around 16:15 ET, and are never revised once published — the
charter's "gold for determinism" (Record 01 §6.4).

**Posture:** while the nowcasts are dark, **daily inflation timeliness rides
T10YIE and T5YIFR.** They are not a like-for-like substitute — a breakeven is
the market's priced expectation, a nowcast is a statistical estimate of the
current print, and the two answer different questions. What they share is the
duty this tier exists to perform: telling us today whether the inflation
picture is moving, without waiting for a monthly official release.

**This is why those two keep grace 2** while the nowcast pair moved to 3
(A1-F1 p2). The backup rail keeps the sharper alarm. Loosening it to quiet a
noisy neighbour would have blunted the very thing the outage plan depends on.

## 3. The dormant EXPINF pair is the monthly insurance

`EXPINF1YR` and `EXPINF10YR` — the Cleveland Fed inflation-expectations model
on FRED, monthly on CPI release day, history to 1982 — are seeded in the
registry as two rows, both `enabled=false`, **insurance** tier, per ruling D1.

**Posture:** they are the **monthly** insurance behind the inflation axis, not
a daily replacement. A nowcast outage does not by itself wake them; a
*sustained* one does. Enabling them is a registry change (`enabled=true`),
which is a write against the production database and therefore **Robert's
hand alone** under the Database law. No assistant enables them on its own
judgment, in an outage or out of one.

## 4. Five business days marks the series degraded

**Posture:** if no new rows arrive for a series for **five or more business
days**, the series is **degraded**, and the harness says so **once** — one
plain-English statement that this series is no longer current and what is
carrying its duty in the meantime, not a repeat of the daily miss letter.

Five is chosen against the measured steady state, not picked round. The pair's
gap at check time sits at three business days when everything is working and
four after one day of genuine slip. Five is the first number that cannot be
explained by the artifact lag under any normal behaviour, so it is the first
number that means *something has actually stopped*.

**Not built in A1-F1.** The order says record, not build. What exists today is
the transition-aware miss alert of p2, which already shouts on every day a
true blackout deepens (4 → 5 → 6 business days, each naming the worsening).
Degraded-marking is the escalation above that: a state on the series, stated
once, rather than a gap measurement repeated. It becomes a build slice when
Robert wants it or when an outage names the need — ruling D1's principle,
applied to our own harness rather than to a vendor.

---

## What is NOT decided here

- **Whether the deterministic engine may run on a degraded inflation input.**
  That is race law (§2.3) and contender-spec territory — Contender A already
  carries its own §3.7 staleness ladder with an inflation-stale threshold, and
  that ladder governs classification, not this document. This document governs
  ingestion and what the operator is told.
- **Any vintage policy for a new source.** §4.2·6 stands: a documented
  per-source vintage policy is a precondition of race use. Nothing here
  creates one.
- **Any schema or registry change.** Both are reserved (Database law). The
  registry's `fallback_channel` column is the natural home for §1–§3 above,
  in the same style the CPI/PCE anchors already use for their BLS/BEA
  channels; populating it is a one-line write for Robert's hand, at his
  timing, and this document stands whether or not he runs it.

---

*Recorded by Clyde under A1-F1 p3, from Robert's ruling of August 14, 2026;
probe and drafting of the ruling by Fabio. No code accompanies this file.*
