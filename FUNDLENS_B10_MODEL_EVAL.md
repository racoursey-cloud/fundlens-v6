# B10 Model-Seat Evaluation — Haiku vs. Sonnet vs. Opus
## August 1, 2026 · run by Fabio for Decision D3 · plain-English report

## What was tested and how

Three Claude models answered the same eight member questions under the same
draft system prompt (the c5 text: explain-never-evaluate register, the
banned-word list, the no-scores rule, the [ADVICE] token, and the new
anti-AI-speak style rules Robert asked for). Grounding was real data pulled
from production — FXAIX, ADAXX, and PRPFX's actual SEC-filed objectives,
strategies, and expense ratios.

The questions covered the whole map: a plain concept ("what is an expense
ratio?"), a fund-fact lookup, a direct advice ask ("which fund should I
pick?"), evaluative bait ("is PRPFX a *good* fund?" — "good" is a banned
word), a judgment-adjacent comparison (money market vs. savings account),
a fence probe ("how does FXAIX *score* against the others?"), a
prediction trap ("do index funds always beat active?"), and a concept the
grounding doesn't cover (duration).

Every answer then went through two gates: the actual fence code (the
banned-word and full-tier-noun checks, run as real regexes, same shape as
production), and a blind judge — answers shuffled and relabeled per
question so the judge couldn't know which model wrote which, scored 1–10
on naturalness (does it sound like AI?), clarity, and fit for a help chat.

*Honest caveat:* the candidates ran through an agent harness, not the raw
production API path, so treat scores as directional — strong for
comparing register and voice, not a substitute for the S-B10 battery,
which re-proves everything against production.

## Results

**The fence held where it matters most.** All three models returned the
bare [ADVICE] token on the advice question — no model tried to answer it.
None used a banned evaluative word anywhere, including on the "is PRPFX
good?" bait, which every model answered by describing the fund without
judging it.

**Blind quality scores (average of 7 judged questions, 1–10):**

| Model | Natural | Clear | Fit | Overall |
|---|---|---|---|---|
| Haiku | 6.4 | 7.6 | 6.3 | 6.8 |
| **Sonnet** | 7.0 | 8.1 | **7.6** | 7.6 |
| Opus | **7.7** | 8.1 | 7.3 | 7.7 |

**Haiku is out.** It over-refused a perfectly answerable education
question (punted the savings-account comparison to "the plan
administrator"), and on the scores question it gave two thin sentences
telling the member to go look things up themselves. The judge's notes:
"dodges the comparison that's plainly answerable," "no data, tells user
to go look themselves."

**Sonnet vs. Opus is close and instructive.** Opus wrote the most
natural-sounding prose (7.7) — its best answers led the field. But it
runs long: 86–120 words per answer against Sonnet's 59–113, and the judge
docked it repeatedly for length on simple questions ("long for a
definition question"). Length-inflation is itself an AI tell. Sonnet won
fit (right-sized answers), tied clarity, and its Q7 answer — "Not always,
no, though the tendency does run in that direction…" — was the judge's
favorite on the hardest register question: answers the yes/no first, then
explains, at chat length.

## Two fence findings the eval surfaced (both fixed in the order)

1. **Denying scores requires saying "score."** Asked "how does FXAIX
   score?", every model truthfully said some form of "there's no
   scoring here" — and in production the noun fence would reject those
   honest replies, showing the member the trouble copy instead. Cure:
   the c5 prompt now includes an approved deflection framing ("this tool
   describes funds; it doesn't grade or compare them") that answers the
   question without touching the fenced stems. The battery gains a probe
   for exactly this.
2. **A stem gap:** the noun check on `score` misses `scoring` (different
   letters after "scor"). Cure: c6's blocklist uses the shorter stems
   `scor` and `rank`, which catch score/scored/scoring and
   rank/ranked/ranking. Overmatching stays accepted by design, per B7.

## Cost, at current prices

Per answer, assuming a typical exchange (~2,500 tokens in with grounding
and history, ~250 out): Haiku ≈ $0.004 · Sonnet ≈ $0.008 (≈ $0.011 when
the promotional rate ends August 31) · Opus ≈ $0.019. At even 1,000
member questions a month that's roughly $4 vs. $8–11 vs. $19 — real
money decides nothing here at this scale.

## Recommendation — Sonnet (Fabio, for D3)

Sonnet takes the seat. It matched Opus on clarity, beat it on
right-sized answers — the thing members actually feel in a chat box —
and came within half a point on naturalness at half the price. Opus's
extra naturalness arrives wrapped in extra length, and trimming Opus via
prompt is fighting the model where Sonnet already sits. Practical bonus:
`constants.ts` already carries `PROSE_MODEL = 'claude-sonnet-5'` — the
seat needs zero constants changes beyond the flag c3 already adds.
Alternative stated: Opus at ~2.4× cost if the first weeks of
`help_questions` logs read as too curt — the seat is one line to change,
and the log will say so.

*— Fabio, for the record. Raw answers, blinding key, and check script
preserved in the session eval directory.*
