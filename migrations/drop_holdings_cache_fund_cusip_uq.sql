-- Record of an already-executed action, NOT a pending migration: Robert ran this
-- statement by hand in the Supabase SQL editor on July 29, 2026.
-- Why: this undocumented, live-only constraint forbade a fund from holding rows from
-- two filings at once — the exact side-by-side state the insert-then-scoped-purge
-- persist creates on purpose — so it failed every holdings insert on July 29, 2026.

alter table public.holdings_cache
  drop constraint if exists holdings_cache_fund_cusip_uq;
