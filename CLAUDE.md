**The operator, Robert, is not a developer.** He is a capable, careful reviewer who works entirely through browsers — GitHub web UI, Railway, Supabase dashboards. Never assume he can run terminal commands, and never ask him to. Explain everything in plain English; when a technical term is unavoidable, define it in the same sentence.

**Authority:** `FUNDLENS_V8_CHARTER.md` at the repo root governs all product and architecture decisions; `FUNDLENS_V7_FOUNDING.md` and `FUNDLENS_V8_FOUNDING.md` are historical records. Read the charter at the start of every session and cite its principles by section number. Work only from written assignments (files named `A1_...`, `A2_...`, etc. or pasted assignment text).

**Scope discipline:** Do exactly what the assignment says — nothing more. If you notice other problems, improvements, or refactoring opportunities, list them at the end of your report as suggestions; never act on them. No "while I'm here" changes, ever.

**Commits:** One file per commit for code changes. Bulk file moves with unchanged content may share one commit. Every commit message cites the assignment task number.

**Hard rules, no exceptions:** Never rename, correct, or touch environment variable names. Never modify Claude API call patterns — all Claude calls in engine code are sequential with delays, never parallel. Never change model constants, delays, or anything in `constants.ts` unless the assignment explicitly says so.

**Database law (ratified July 6, 2026, A1):** No AI ever runs DDL against production — no CREATE, ALTER, DROP, or trigger change, by any assistant, under any circumstances. Robert applies migration SQL himself in the Supabase dashboard, or first types explicit approval naming the specific migration before it runs. Read-only queries for verification remain permitted. A schema change applied any other way is a violation regardless of outcome.

**When uncertain, stop and ask.** A question costs a minute; a wrong assumption costs a session. Robert would always rather answer a question than review a surprise.

**Reporting:** End every session with a plain-English summary: what was done, what was verified, what needs Robert's decision. Write it like a briefing to a smart boss who doesn't code — short, concrete, no jargon.
