/**
 * H2 p4 — fence report over cached FMP company descriptions.
 *
 * REPORTING MODE, per Robert's ruling 1 (August 2, 2026): this script
 * REPORTS. It gates nothing, suppresses nothing, and writes nothing. Option
 * (b) — fence-as-gate — was declined at ratification precisely because it
 * would silently blank many large-cap descriptions; this is the instrument
 * that replaced it. Fabio posts the output to the record before launch and
 * Robert eyeballs it.
 *
 * Scope: the descriptions a member can actually open. A cached profile is
 * only reachable if some holdings row carries that ticker as its VALIDATED
 * display ticker (holdings_cache.ticker — the H1-F2 vouched column, null
 * where the app will not stand behind a code). Profiles nothing links to are
 * counted separately and not listed; they are not a member-facing surface.
 *
 * Run from the repo root, with the server environment loaded:
 *
 *   npx tsx scripts/h2-fence-report.ts
 *
 * Exits 0 whatever it finds — a trip is a finding for the record, not a
 * failure. Outside tsconfig's src include; never part of the server build.
 */

import { supaFetch } from '../src/engine/supabase.js';
import { BANNED_VOCABULARY, findBannedWord } from '../src/engine/fund-summaries.js';

const PAGE = 500;

interface FmpCacheRow {
  ticker: string;
  profile: { companyName?: unknown; description?: unknown } | null;
}

interface HoldingTickerRow {
  ticker: string | null;
}

/** Every display ticker a member can click — the vouched column only. */
async function loadValidatedDisplayTickers(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supaFetch<HoldingTickerRow[]>('holdings_cache', {
      params: {
        select: 'ticker',
        ticker: 'not.is.null',
        order: 'ticker.asc',
        limit: String(PAGE),
        offset: String(offset),
      },
    });
    if (error) throw new Error(`holdings_cache read failed: ${error}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.ticker) out.add(row.ticker.trim().toUpperCase());
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Every cached profile carrying a non-empty description. */
async function loadCachedDescriptions(): Promise<Array<{ ticker: string; company: string; description: string }>> {
  const out: Array<{ ticker: string; company: string; description: string }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supaFetch<FmpCacheRow[]>('fmp_cache', {
      params: {
        select: 'ticker,profile',
        profile: 'not.is.null',
        order: 'ticker.asc',
        limit: String(PAGE),
        offset: String(offset),
      },
    });
    if (error) throw new Error(`fmp_cache read failed: ${error}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const description = typeof row.profile?.description === 'string' ? row.profile.description.trim() : '';
      if (!description) continue;
      out.push({
        ticker: row.ticker.trim().toUpperCase(),
        company: typeof row.profile?.companyName === 'string' ? row.profile.companyName : '',
        description,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** One-line context around the matched stem, so a reader can judge it. */
function snippet(description: string, word: string): string {
  const at = description.search(new RegExp(`\\b${word}\\w*`, 'i'));
  if (at < 0) return description.slice(0, 120);
  const start = Math.max(0, at - 60);
  const end = Math.min(description.length, at + 80);
  return `${start > 0 ? '…' : ''}${description.slice(start, end).replace(/\s+/g, ' ')}${end < description.length ? '…' : ''}`;
}

async function main(): Promise<void> {
  const [displayTickers, profiles] = [await loadValidatedDisplayTickers(), await loadCachedDescriptions()];

  const reachable = profiles.filter(p => displayTickers.has(p.ticker));
  const unreachable = profiles.length - reachable.length;

  const trips: Array<{ ticker: string; company: string; word: string; context: string }> = [];
  const perStem = new Map<string, number>();

  for (const p of reachable) {
    // The real fence function — the same one B7/B9/B10 reject on. Reporting
    // mode changes what we DO with the verdict, never how it is reached.
    const word = findBannedWord(p.description);
    if (!word) continue;
    trips.push({ ticker: p.ticker, company: p.company, word, context: snippet(p.description, word) });
    perStem.set(word, (perStem.get(word) ?? 0) + 1);
  }

  console.log('— H2 fence report: FMP company descriptions (REPORTING MODE) —\n');
  console.log(`Cached profiles with a description : ${profiles.length}`);
  console.log(`Reachable via a validated ticker   : ${reachable.length}`);
  console.log(`Not reachable (not listed below)   : ${unreachable}`);
  console.log(`Reachable descriptions tripping    : ${trips.length}`);
  console.log(
    `Share of reachable                 : ${reachable.length ? ((trips.length / reachable.length) * 100).toFixed(1) : '0.0'}%\n`,
  );

  console.log('Per stem (first match per description; stems are checked in list order):');
  for (const word of BANNED_VOCABULARY) {
    const n = perStem.get(word) ?? 0;
    if (n > 0) console.log(`  ${word.padEnd(12)} ${n}`);
  }

  console.log('\nEvery trip, for the record:\n');
  for (const t of trips.sort((a, b) => a.word.localeCompare(b.word) || a.ticker.localeCompare(b.ticker))) {
    console.log(`[${t.word}] ${t.ticker} — ${t.company}`);
    console.log(`    ${t.context}\n`);
  }

  console.log('— end of report — nothing was gated, suppressed, or written —');
}

main().catch(err => {
  console.error(`[h2-fence-report] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
