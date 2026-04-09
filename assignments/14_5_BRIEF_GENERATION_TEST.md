# Assignment 14.5: Brief Generation Test

**Session:** 14
**Estimate:** 20 minutes
**Depends on:** 14.2 (pipeline has completed with scores in database)

---

## Spec Reference

- **§7.2** — 4-section "W" structure: "Where the Numbers Point", "What Happened", "What We're Watching", "Where We Stand"
- **§7.3** — Editorial policy v2.0 (advisor voice, behind-the-curtain rule)
- **§7.7** — Allocation history persistence
- **§4.2** — Brief model = Claude Opus

## Purpose

Generate an Investment Brief and verify it follows the spec's structure and editorial policy.

## What to Do

### 1. Trigger Brief generation

```bash
curl -X POST "http://localhost:3000/api/briefs/generate?sendEmail=false" \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json"
```

Note: `sendEmail=false` skips email delivery (we just want to test generation).

### 2. Fetch the generated Brief

```bash
curl -s http://localhost:3000/api/briefs \
  -H "Authorization: Bearer <your-jwt>" | jq '.briefs[0]'
```

### 3. Verify structure

The Brief content should have exactly 4 sections. Check for:

- [ ] **Section 1: "Where the Numbers Point"** — macro + sector thesis summary, what the data says
- [ ] **Section 2: "What Happened"** — allocation changes since last Brief (may say "first Brief" if no prior allocation)
- [ ] **Section 3: "What We're Watching"** — risk factors, upcoming catalysts, things that could change the outlook
- [ ] **Section 4: "Where We Stand"** — final allocation recommendation with specific percentages

### 4. Verify editorial policy compliance

- [ ] **Voice:** Reads like a knowledgeable buddy, not a research analyst. Conversational but substantive.
- [ ] **Behind the curtain rule:** Does NOT mention "composite scores", "z-scores", "factor weights", "MAD", "Kelly", "exponential curve", "CDF", or any model internals. May reference general concepts like "cost", "quality", "momentum" in plain language.
- [ ] **No model language:** Does NOT say "as an AI", "I was trained", "based on my analysis", etc.
- [ ] **Allocation included:** Section 4 includes specific fund tickers and percentage allocations.
- [ ] **Length:** Substantial but not overwhelming. Each section should be 2–5 paragraphs.

### 5. Verify allocation history

Check that the allocation was persisted:

```bash
# Check allocation_history table has a new entry
curl -s http://localhost:3000/api/briefs \
  -H "Authorization: Bearer <your-jwt>" | jq '.briefs[0].id'
```

### 6. Document findings

```
## Brief Generation Test

### Generation
- Triggered at: [time]
- Completed: YES/NO
- Brief ID: [id]
- Error (if any): [error message]

### Structure Check
- [ ] Section 1 present: "Where the Numbers Point"
- [ ] Section 2 present: "What Happened"
- [ ] Section 3 present: "What We're Watching"
- [ ] Section 4 present: "Where We Stand"

### Editorial Policy Check
- [ ] Advisor voice (not research analyst)
- [ ] No model internals revealed
- [ ] No AI self-reference
- [ ] Allocation with specific percentages in Section 4
- [ ] Reasonable length per section

### Allocation in Brief
| Fund | Allocation % |
|------|-------------|
| ... | ... |

### Quality Assessment
[1-2 sentences: Would Robert be comfortable sending this to ~200 coworkers?]

### Issues Found
[List any issues]
```

## What NOT to Do

- Do NOT modify any source code
- Do NOT send the email (use sendEmail=false)
- Do NOT rewrite the editorial policy
- Do NOT grade the Brief on investment quality — just verify structure and policy compliance

## Verification

Brief generated successfully with 4 sections. Editorial policy compliance verified. Findings documented.
