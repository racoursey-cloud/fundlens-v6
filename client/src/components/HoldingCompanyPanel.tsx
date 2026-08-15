/**
 * FundLens — The Holding Company Panel (H2 p3, made shared by H3 t1)
 *
 * THE SAME PANEL, MOVED — not a second one. Every line below arrived here
 * verbatim from client/src/pages/reference/FundDetail.tsx, where H2 built
 * it: the same /api/holdings/company call, the same h6 serve-time
 * name-guard behaviour (the filed name rides along and the server fails
 * closed without it), the same dash/no-ticker fallback of filed name plus
 * Wikipedia with zero network calls, the same m8 OTC wording. Only the
 * docblock and the subject type are new.
 *
 * WHY IT MOVED (H3 t1, "company panel everywhere"). The panel has to open
 * from the shared FundExposurePanel's holding rows and from the H3 search
 * results, and it lived inside a PAGE that imports FundExposurePanel. A
 * component cannot import from a page that imports it — the module graph
 * forbids it — so the only way to reuse this panel rather than write a
 * second one was to give it its own file. The assignment's "no new
 * component" is honoured in the sense that matters: there is exactly one
 * company panel in the app, and this is it. Three surfaces now open it.
 *
 * Information, never evaluation — the same posture as the About tab one
 * level up. FMP's description serves verbatim in a quote block under
 * attribution; the facts are the non-moving ones only (no price, no market
 * cap, no ratings). Wikipedia is the independent second door and stays
 * secondary.
 *
 * H3-F3 CURE 1 — THE FALLBACK IS THE ANSWER TO EVERY NON-SERVING LOOKUP.
 * Finding of record (Robert's member testing, August 15, 2026; reproduced by
 * Fabio): a row carrying a display ticker whose lookup does not serve — KDDI,
 * ticker 9433, a vouched Tokyo code with no FMP profile behind it, answering
 * 404 — must show what a dash row shows, not an empty region and not a
 * "Loading company…" that never ends. The lookup's outcome is now ONE state
 * value with two terminal phases, so there is no pair of flags to fall out of
 * step and no path that leaves the panel mid-flight: see the Lookup type
 * below. Nothing retries — the endpoint is cache-only, so asking twice has
 * the same answer and costs the member's rate ceiling.
 *
 * Destination: client/src/components/HoldingCompanyPanel.tsx
 */

import { useEffect, useState } from 'react';
import { fetchHoldingCompany, type CompanyPanel } from '../api';
import { VendorQuote } from './SourceQuote';
import { theme } from '../theme';

/**
 * What the panel needs to know about the row that opened it. Deliberately
 * the three fields it actually reads, so every caller can satisfy it: a
 * ReferenceHolding (the fund detail's Holdings tab), an ExposureHolding
 * (the shared exposure panel's holdings list), and a search result all
 * carry these and nothing narrower is required.
 */
export interface CompanyPanelSubject {
  /** The name as filed, exactly as the row displays it */
  name: string;
  /** The VALIDATED display ticker, or null — never an unvouched code */
  ticker: string | null;
  /** The sector as the row shows it, or null where none is shown */
  sector: string | null;
}

/** Wikipedia name search — lands on a search page for obscure names, which
 *  is honest: it says "here is where to look", never "here is the company". */
function wikipediaSearchUrl(name: string): string {
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
}

/**
 * M1 m8 — the venues where FMP's date is a quote date, not a listing date.
 *
 * Ruled August 15, 2026: the assignment's intent was "venues where the date
 * is a quote date, not an IPO," and Pink Sheets is that, so PNK relabels
 * alongside OTC. The exchange codes present in the cache today are OTC,
 * NYSE, NASDAQ, AMEX, PNK and CBOE; only the first and the fifth are
 * over-the-counter. An unrecognized or absent code is treated as a listing,
 * which is the conservative reading — it keeps today's wording rather than
 * asserting a quote history nobody has evidence for.
 */
const OTC_VENUES = new Set(['OTC', 'PNK']);

function isOverTheCounterVenue(exchange: string | null): boolean {
  return exchange !== null && OTC_VENUES.has(exchange.trim().toUpperCase());
}

/**
 * THE LOOKUP'S OUTCOME, AS ONE VALUE (H3-F3 cure 1).
 *
 * 'loading' is the only non-terminal phase and it is reachable only while a
 * request is genuinely in flight. Everything else is 'done', carrying either
 * the served profile or null — and null is the ruled fallback: filed name,
 * "Filed under <sector>" where the row knows one, the Wikipedia door.
 *
 * EVERY non-serving answer the endpoint can give lands on `company: null`:
 * 400 (a ticker outside the display-ticker shape, or a missing filed name —
 * the guard failing closed), 404 (no cached profile, or the h6 serve-time
 * guard refusing a pairing whose names disagree), a rate-limit wall, a 5xx, a
 * network failure, a body that is not JSON. The member's screen is the same
 * in all of them, because the truth is the same in all of them: there is no
 * description this app is willing to stand behind for this row.
 *
 * Why one value and not two flags: the panel previously held `loading` and
 * `company` separately, and the branch that skips the lookup returned without
 * clearing `loading` — so a panel whose row lost its vouched ticker mid-flight
 * (My Mix does exactly that whenever the ?all=1 lists go back to pending) sat
 * on "Loading company…" with no request left to end it. A single value cannot
 * hold that state.
 */
type Lookup =
  | { phase: 'loading' }
  | { phase: 'done'; company: CompanyPanel | null };

export function HoldingCompanyPanel({ holding }: { holding: CompanyPanelSubject }) {
  // Opens on the fallback, not on a spinner: a row with no vouched ticker is
  // answered without touching the network, on the first paint.
  const [lookup, setLookup] = useState<Lookup>({ phase: 'done', company: null });

  // H1-F2 followup, honored: the panel keys on VALIDATED display tickers
  // only. holdings_cache.ticker carries the vouched display value or null,
  // so a dashed row asks the server nothing — there is no identifier the app
  // is willing to stand behind, and a lookup on an unvouched code is exactly
  // how the wrong company reaches a member.
  const lookupTicker = holding.ticker;

  useEffect(() => {
    if (!lookupTicker) {
      // Nothing to ask, so the answer is already final — including when this
      // run replaces one whose request is still in flight.
      setLookup({ phase: 'done', company: null });
      return;
    }
    let cancelled = false;
    setLookup({ phase: 'loading' });
    // The filed name rides along: the server re-checks the h6 name-agreement
    // guard against it and fails closed without it.
    fetchHoldingCompany(lookupTicker, holding.name)
      .then(res => {
        if (cancelled) return;
        // apiFetch resolves for every HTTP status — a 400 or 404 arrives here
        // as data:null with the server's own message in `error` — so this one
        // line settles the serving and the non-serving cases alike.
        setLookup({ phase: 'done', company: res.data?.company ?? null });
      })
      .catch(() => {
        // apiFetch is written never to reject. If that ever changes, the panel
        // still settles on the fallback rather than waiting forever.
        if (!cancelled) setLookup({ phase: 'done', company: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lookupTicker, holding.name]);

  const loading = lookup.phase === 'loading';
  const company = lookup.phase === 'done' ? lookup.company : null;

  // F4 convention: a literal 'N/A' filing name is not a name. With no company
  // name either, there is nothing to search for and no link is offered.
  const filedName = holding.name === 'N/A' ? null : holding.name;
  const searchName = company?.companyName ?? filedName;

  const wikipediaLink = searchName ? (
    <a
      href={wikipediaSearchUrl(searchName)}
      target="_blank"
      rel="noopener"
      style={{ color: theme.colors.textDim, textDecoration: 'underline' }}
    >
      Search Wikipedia ↗
    </a>
  ) : null;

  // The non-moving facts, each rendered only where FMP carries it.
  const facts: string[] = [];
  if (company) {
    const place = [company.city, company.country].filter(Boolean).join(', ');
    if (place) facts.push(place);
    const business = [company.sector, company.industry].filter(Boolean).join(' — ');
    if (business) facts.push(business);
    if (company.exchange) facts.push(company.exchange);
    // M1 m8 (ruled August 15, 2026): on an over-the-counter venue the date
    // FMP files is when that quote line opened, not when the company listed.
    // TSMWF is the case that surfaced it — "Listed 2026-07-15" for Taiwan
    // Semiconductor, public since 1997 and carrying that 1997 date on its
    // NYSE line. The date is right; the word "Listed" was wrong. OTC and PNK
    // (Pink) are both quote venues in this sense; NYSE, NASDAQ, AMEX and
    // CBOE are listings and are untouched.
    if (company.ipoDate) {
      facts.push(
        isOverTheCounterVenue(company.exchange)
          ? `OTC quote since ${company.ipoDate}`
          : `Listed ${company.ipoDate}`
      );
    }
  }

  return (
    <div
      style={{
        background: theme.colors.bg,
        borderTop: `1px solid ${theme.colors.border}`,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, marginBottom: 10 }}>
        {company?.companyName ?? filedName ?? '—'}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: theme.colors.textDim, margin: 0 }}>Loading company…</p>
      ) : company && company.description ? (
        <>
          <VendorQuote attribution="Company data: Financial Modeling Prep">
            {company.description}
          </VendorQuote>

          {facts.length > 0 && (
            <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: '12px 0 0' }}>
              {facts.join(' · ')}
              {company.website && (
                <>
                  {' · '}
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener"
                    style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}
                  >
                    {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </>
              )}
            </p>
          )}

          {wikipediaLink && (
            <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '10px 0 0' }}>{wikipediaLink}</p>
          )}
        </>
      ) : (
        /* THE FALLBACK, and the answer to every non-serving lookup (H3-F3):
           no vouched ticker to ask about, no cached profile behind the one we
           asked about (KDDI's 9433 — a 404), the h6 guard declining the
           pairing (also a 404), a 400, a wall, a failed request, or a profile
           that carries no description. The member gets what the filing itself
           says, plus the second door — never another company's description,
           and never a blank space where an answer should be. */
        <>
          <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: 0 }}>
            {holding.sector
              ? `Filed under ${holding.sector}. No company description is available for this holding.`
              : 'No company description is available for this holding.'}
          </p>
          {wikipediaLink && (
            <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '10px 0 0' }}>{wikipediaLink}</p>
          )}
        </>
      )}
    </div>
  );
}
