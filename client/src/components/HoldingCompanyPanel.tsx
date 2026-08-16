/**
 * FundLens — The Holding Company Card (H2 p3 · shared by H3 t1 · rebuilt by H4)
 *
 * ONE CARD, EVERY SURFACE. Wherever a company's name appears in this app —
 * a fund's Holdings tab, a sector drill, the top-holdings column, My Mix's
 * two mix-level lists, the Brief's allocation card, a search result — the
 * same click opens this same card. Robert's standard, verbatim: "the same
 * click gives the same kind of answer in every place a company's name
 * appears."
 *
 * THE H4 RULING (Robert, August 15, 2026): "Display an honest depiction of
 * what you have — a thin gray line only looks like the app is broken." The
 * card is no longer a vendor description with a fallback sentence when the
 * vendor has nothing. It is what OUR OWN records hold about this row —
 * filed name, its weight, sector, industry, country, and where the surface
 * already knows it, which funds hold it — with the vendor's description
 * added WHEN the cache has one, and the Wikipedia door ALWAYS. A row with no
 * profile is no longer a near-empty box; it is a card with four true things
 * on it.
 *
 * WHAT IS NEVER PRINTED: a placeholder. An absent fact is absent — no em
 * dashes, no "not available" lines apologising for a field. The card says
 * what it knows and stops.
 *
 * THE INDUSTRY LINE IS VENDOR-ONLY (H4 ruling 2). A holding's industry can
 * be the vendor's or our own nightly classifier's. The server's
 * vendorIndustry gate (reference-shape.ts) serves it only when the vendor
 * said so, so by the time a row reaches this file a present industry is a
 * vendor fact and there is no judgment left here to get wrong.
 *
 * FROZEN AND EMPTY ARE IMPOSSIBLE SCREEN STATES, BY CONSTRUCTION. The lookup
 * is ONE value with two phases (see Lookup below): 'loading' exists only
 * while a request is genuinely in flight, and every other outcome — served,
 * 400, 404, rate-limited, 5xx, dead connection, a body that isn't JSON, or a
 * row with no vouched ticker to ask about — is 'done' and renders the card.
 * The panel previously held two flags and the branch that skips the lookup
 * returned without clearing the waiting one, which is how a card could sit
 * on "Loading company…" with no request left to end it.
 *
 * VISIBILITY IS A SEPARATE PROBLEM, SOLVED SEPARATELY. This card is opaque
 * and has a real minimum height, so a partial view reads as a card rather
 * than as a hairline; the scrolling that brings it into view lives in
 * drill-scroll.ts, at the lists.
 *
 * Information, never evaluation. The vendor description serves verbatim in a
 * quote block under attribution; the facts are the non-moving ones only (no
 * price, no market cap, no ratings). Wikipedia is the independent second
 * door and stays secondary.
 *
 * Destination: client/src/components/HoldingCompanyPanel.tsx
 */

import { useEffect, useState } from 'react';
import { fetchHoldingCompany, type CompanyPanel } from '../api';
import { VendorQuote } from './SourceQuote';
import { theme } from '../theme';

/**
 * What the card needs to know about the row that opened it.
 *
 * Only the first three are required, because only the first three are
 * knowable on every surface. Everything else is what THIS surface happens to
 * know: a fund page knows the weight in that fund, My Mix knows the weight
 * in the mix and which funds it came through, a search result knows neither.
 * The card prints what it is given and never invents the rest.
 */
export interface CompanyPanelSubject {
  /** The name as filed, exactly as the row displays it */
  name: string;
  /** The VALIDATED display ticker, or null — never an unvouched code */
  ticker: string | null;
  /** The sector as the row shows it, or null where none is shown */
  sector: string | null;
  /** H4: the VENDOR's industry (the server gates it), or null/absent */
  industry?: string | null;
  /** H4: country of issuer as filed, or null/absent */
  country?: string | null;
  /**
   * H4: this row's weight, and what it is a weight OF — "0.12%" of "FXAIX",
   * "<0.1%" of "the mix". The text is pre-formatted BY THE SURFACE on
   * purpose: each list has its own ruled convention (My Mix's dust floor
   * prints "<0.1%" where two decimals would print a false zero), and the
   * card must not quietly re-round a number a page already ruled on.
   */
  weight?: { text: string; of: string } | null;
  /**
   * H4: the funds this row is held through, where the surface knows it AND
   * the row itself does not already list them. Only My Mix's
   * across-the-mix list passes this — the overlap list and the search
   * results print their funds in the row, and a card that repeats the line
   * above it is noise, not information.
   */
  heldBy?: Array<{ fundTicker: string; text: string }> | null;
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
 * THE LOOKUP'S OUTCOME, AS ONE VALUE (H4; first written at H3-F3).
 *
 * 'loading' is the only non-terminal phase and it is reachable only while a
 * request is genuinely in flight. Everything else is 'done', carrying the
 * served profile or null — and null costs the card nothing now: it loses the
 * description and keeps every fact our own records hold.
 *
 * EVERY non-serving answer lands on `company: null`: 400 (a ticker outside
 * the display-ticker shape, or a missing filed name — the h6 guard failing
 * closed), 404 (no cached profile, or the guard refusing a pairing whose
 * names disagree), a rate-limit wall, a 5xx, a network failure, a body that
 * is not JSON. One screen for all of them, because they are one truth: no
 * description this app is willing to stand behind for this row.
 */
type Lookup =
  | { phase: 'loading' }
  | { phase: 'done'; company: CompanyPanel | null };

/** The card is opaque and never shorter than this, so a partially scrolled
 *  view reads as a card. The failure this replaces was a 1px border of an
 *  empty box, which read as a broken app. */
const CARD_MIN_HEIGHT = 92;

export function HoldingCompanyPanel({ holding }: { holding: CompanyPanelSubject }) {
  // Opens on the card, not on a spinner: a row with no vouched ticker is
  // answered without touching the network, on the first paint.
  const [lookup, setLookup] = useState<Lookup>({ phase: 'done', company: null });

  // H1-F2 followup, honored: the card keys on VALIDATED display tickers
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
        // apiFetch is written never to reject. If that ever changes, the card
        // still settles rather than waiting forever.
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

  /**
   * ONE facts line, deduplicated by source precedence.
   *
   * Our own record goes first, because it describes THIS filed row: the
   * sector the fund filed it under, the vendor industry our pipeline stamped
   * on it, the country of issuer off the filing. The vendor profile then
   * fills only what our row does not carry, and adds the things only it
   * knows — city, exchange, when the listing or the OTC quote opened.
   *
   * Nothing is printed twice and nothing is printed as a placeholder.
   */
  const facts: string[] = [];
  if (holding.sector) facts.push(holding.sector);
  else if (company?.sector) facts.push(company.sector);
  if (holding.industry) facts.push(holding.industry);
  else if (company?.industry) facts.push(company.industry);
  if (company?.city) facts.push(company.city);
  if (holding.country) facts.push(holding.country);
  else if (company?.country) facts.push(company.country);
  if (company?.exchange) facts.push(company.exchange);
  // M1 m8 (ruled August 15, 2026): on an over-the-counter venue the date FMP
  // files is when that quote line opened, not when the company listed. TSMWF
  // is the case that surfaced it — "Listed 2026-07-15" for Taiwan
  // Semiconductor, public since 1997 and carrying that 1997 date on its NYSE
  // line. The date is right; the word "Listed" was wrong. OTC and PNK (Pink)
  // are both quote venues in this sense; NYSE, NASDAQ, AMEX and CBOE are
  // listings and are untouched.
  if (company?.ipoDate) {
    facts.push(
      isOverTheCounterVenue(company.exchange)
        ? `OTC quote since ${company.ipoDate}`
        : `Listed ${company.ipoDate}`
    );
  }

  return (
    <div
      style={{
        background: theme.colors.surface,
        borderTop: `1px solid ${theme.colors.border}`,
        padding: '14px 16px',
        minHeight: CARD_MIN_HEIGHT,
      }}
    >
      {/* Identity: the company as we can best name it, and the vouched
          ticker beside it where there is one. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, flex: 1, minWidth: 0 }}>
          {company?.companyName ?? filedName ?? '—'}
        </span>
        {holding.ticker && (
          <span style={{ fontSize: 11, fontFamily: theme.fonts.mono, color: theme.colors.textDim, flexShrink: 0 }}>
            {holding.ticker}
          </span>
        )}
      </div>

      {/* The member's own question first: how much of this do I have here? */}
      {holding.weight && (
        <p style={{ fontSize: 12, color: theme.colors.text, margin: '0 0 6px' }}>
          <span style={{ fontFamily: theme.fonts.mono, fontWeight: 600 }}>{holding.weight.text}</span>
          {' of '}
          {holding.weight.of}
        </p>
      )}

      {facts.length > 0 && (
        <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: '0 0 6px' }}>
          {facts.join(' · ')}
        </p>
      )}

      {/* Held through — only where the surface knows it and the row above
          does not already say it. */}
      {holding.heldBy && holding.heldBy.length > 0 && (
        <p style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 1.6, margin: '0 0 6px' }}>
          Held through{' '}
          {holding.heldBy.map((f, i) => (
            <span key={`${f.fundTicker}-${i}`}>
              {i > 0 && ' · '}
              <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.text }}>{f.fundTicker}</span>
              {' '}{f.text}
            </span>
          ))}
        </p>
      )}

      {/* The vendor's description, when the cache has one. Its absence costs
          the card a paragraph, never its existence — which is the whole H4
          ruling in one line. */}
      {loading ? (
        <p style={{ fontSize: 12, color: theme.colors.textDim, margin: '8px 0 0' }}>
          Looking up the company description…
        </p>
      ) : company && company.description ? (
        <div style={{ marginTop: 8 }}>
          <VendorQuote attribution="Company data: Financial Modeling Prep">
            {company.description}
          </VendorQuote>
          {company.website && (
            <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '8px 0 0' }}>
              <a
                href={company.website}
                target="_blank"
                rel="noopener"
                style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}
              >
                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            </p>
          )}
        </div>
      ) : null}

      {wikipediaLink && (
        <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '10px 0 0' }}>{wikipediaLink}</p>
      )}
    </div>
  );
}
