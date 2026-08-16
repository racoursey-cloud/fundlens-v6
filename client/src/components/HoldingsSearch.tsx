/**
 * FundLens — Cross-Fund Holdings Search (H3 t5)
 *
 * One box, two homes, two scopes — Robert's ruling of August 15, 2026:
 *   - the Funds page asks it of the whole lineup: "of these twenty-three
 *     funds, which ones hold the following company?"
 *   - My Mix asks it of the funds on screen: "if I have this, do I have any
 *     of X Y Z company?"
 * Same component, same endpoint, same answer shape. The surface decides the
 * scope by the prop it passes, and the narrowing happens HERE, in the
 * browser (§7-d) — the server is stateless because only the browser knows
 * what an unsaved, hypothetical mix contains.
 *
 * SUBMIT, NOT TYPEAHEAD (§7-b and §8): the call goes out on Enter or on the
 * button, never per keystroke. The endpoint allows 30 searches an hour.
 *
 * Every company result opens the SAME company panel a holding row opens —
 * components/HoldingCompanyPanel.tsx, the one H2 built — with the same h6
 * name-guard behind it and the same filed-name-plus-Wikipedia fallback for
 * a company with no vouched ticker or no cached profile. That is the wave's
 * governing principle applied to search: no dead ends.
 *
 * H4: the results are the ONE list in the app with no fixed-height window
 * of its own, which is why they were never reported broken while every other
 * surface was — and why they need no scroll anchoring now. The card they open
 * carries the same facts as everywhere else (ruling 3 lifted H3's exclusion
 * of sector, industry and country for exactly this purpose).
 *
 * Copy is §6 of the ratified order, verbatim, and lives here so the two
 * homes cannot drift apart.
 *
 * Destination: client/src/components/HoldingsSearch.tsx
 */

import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchHoldings, type HoldingsSearchCompany } from '../api';
import { HoldingCompanyPanel } from './HoldingCompanyPanel';
import { theme } from '../theme';

// ─── Scope ─────────────────────────────────────────────────────────────────

/**
 * 'all' — every fund in the lineup (the Funds page).
 * { funds } — keep only these fund tickers (My Mix: the funds carrying a
 * nonzero allocation on screen at that moment). An EMPTY list is the honest
 * zero-allocation state, not a request for nothing: the box disables and
 * says what to do.
 */
export type HoldingsSearchScope = 'all' | { funds: string[] };

// ─── Ratified copy (§6) ────────────────────────────────────────────────────

const PLACEHOLDER = 'Look up a company — e.g. Dollar General or DG';

const COVERAGE_LINE =
  "Searches the holdings each fund files with the SEC. Money market funds (ADAXX, FDRXX) hold cash instruments, not companies, and aren't included.";

const ZERO_ALLOCATION_LINE = 'Enter percentages above to search what your mix would hold.';

/** The server's own 400 wording, so the two agree and an obviously short
 *  term does not spend one of the member's thirty searches. */
const LENGTH_RULE = 'Search for a company using 2 to 80 characters.';

/** §5 t3 caps the answer at 20 companies. Rendered only when the SERVER's
 *  own answer reached that cap — a cap nobody is told about reads as "there
 *  are no others", which would be false. Phrased so it is equally true on My
 *  Mix, where the scope may then narrow those twenty down further. */
const CAP_LINE = 'This search reached its limit of 20 companies. Narrow it to see others.';

// ─── Component ─────────────────────────────────────────────────────────────

export function HoldingsSearch({ scope }: { scope: HoldingsSearchScope }) {
  const [text, setText] = useState('');
  /** The term the results on screen actually answer — never the live input */
  const [asked, setAsked] = useState<string | null>(null);
  const [companies, setCompanies] = useState<HoldingsSearchCompany[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const isAllFunds = scope === 'all';
  const scopeTickers = isAllFunds ? null : scope.funds;
  const noAllocation = scopeTickers !== null && scopeTickers.length === 0;

  /** The mix scope, applied over the all-funds answer. A company whose funds
   *  all fall outside the scope drops out entirely — it is not in this mix. */
  const visible = useMemo<HoldingsSearchCompany[] | null>(() => {
    if (companies === null) return null;
    if (scopeTickers === null) return companies;
    const keep = new Set(scopeTickers);
    return companies
      .map(c => ({ ...c, funds: c.funds.filter(f => keep.has(f.fundTicker)) }))
      .filter(c => c.funds.length > 0);
  }, [companies, scopeTickers]);

  const runSearch = async () => {
    const q = text.trim();
    if (q.length < 2 || q.length > 80) {
      setError(LENGTH_RULE);
      setCompanies(null);
      setAsked(null);
      return;
    }
    setLoading(true);
    setError(null);
    setExpandedKey(null);
    const res = await searchHoldings(q);
    if (res.data) {
      setCompanies(res.data.companies);
      setAsked(res.data.query);
    } else {
      // The server's plain-words message, as sent — the house pattern.
      setError(res.error || 'Could not search the holdings. Please try again.');
      setCompanies(null);
      setAsked(null);
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: theme.fonts.body }}>
      <form
        onSubmit={e => {
          e.preventDefault();
          void runSearch();
        }}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
      >
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={noAllocation}
          placeholder={PLACEHOLDER}
          aria-label="Look up a company held by the funds"
          style={{
            flex: '1 1 280px',
            minWidth: 0,
            maxWidth: 420,
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: theme.fonts.body,
            color: noAllocation ? theme.colors.textDim : theme.colors.text,
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.sm,
          }}
        />
        <button
          type="submit"
          disabled={noAllocation || loading}
          style={{
            padding: '8px 18px',
            borderRadius: theme.radii.md,
            border: `1px solid ${noAllocation || loading ? theme.colors.border : theme.colors.accentBlue}`,
            background: noAllocation || loading ? 'transparent' : theme.colors.accentBlue,
            color: noAllocation || loading ? theme.colors.textDim : '#fff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: theme.fonts.body,
            cursor: noAllocation || loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {noAllocation ? (
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '8px 0 0' }}>
          {ZERO_ALLOCATION_LINE}
        </p>
      ) : isAllFunds ? (
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '8px 0 0', lineHeight: 1.6 }}>
          {COVERAGE_LINE}
        </p>
      ) : null}

      {error && (
        <p style={{ fontSize: 12, color: theme.colors.error, margin: '8px 0 0' }}>{error}</p>
      )}

      {/* Results — only ever for the term that was actually asked */}
      {!loading && !error && asked !== null && visible !== null && (
        visible.length === 0 ? (
          <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: '12px 0 0', lineHeight: 1.6 }}>
            {isAllFunds ? (
              <>No fund in the lineup files a holding matching &lsquo;{asked}&rsquo;.</>
            ) : (
              <>
                None of the funds in this mix hold &lsquo;{asked}&rsquo;. To search all 23
                funds, use the{' '}
                <Link to="/" style={{ color: theme.colors.accentBlue, textDecoration: 'underline' }}>
                  Funds page
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radii.sm,
                overflow: 'hidden',
              }}
            >
              {visible.map((company, idx) => {
                const rowKey = `${company.displayTicker ?? ''}:${company.companyName}`;
                const isExpanded = expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <div
                      onClick={() => setExpandedKey(prev => (prev === rowKey ? null : rowKey))}
                      style={{
                        padding: '8px 10px',
                        borderTop: idx === 0 ? 'none' : `1px solid ${theme.colors.border}`,
                        cursor: 'pointer',
                        background: isExpanded ? theme.colors.surface : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* H2-F1's lesson: the door has to be visible to be a
                            door. Every result opens, including the ones with
                            no ticker, which open the Wikipedia fallback. */}
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: 9,
                            fontSize: 10,
                            color: theme.colors.textDim,
                            flexShrink: 0,
                            transform: isExpanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s',
                          }}
                        >
                          ▸
                        </span>
                        <span style={{ fontSize: 13, color: theme.colors.text, flex: 1, minWidth: 0 }}>
                          {company.companyName}
                        </span>
                        {company.displayTicker && (
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: theme.fonts.mono,
                              color: theme.colors.textDim,
                              flexShrink: 0,
                            }}
                          >
                            {company.displayTicker}
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: 4, paddingLeft: 15 }}>
                        {company.funds.map(f => (
                          <div key={f.fundTicker} style={{ marginTop: 2 }}>
                            <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
                              held by{' '}
                              <span style={{ fontFamily: theme.fonts.mono, color: theme.colors.text }}>
                                {f.fundTicker}
                              </span>{' '}
                              at{' '}
                              <span style={{ fontFamily: theme.fonts.mono, fontWeight: 600, color: theme.colors.accentBlue }}>
                                {f.pctOfNav.toFixed(2)}%
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: theme.colors.textDim }}>
                              {f.fundName}
                              {f.reportDate ? ` · Data as-of ${f.reportDate.slice(0, 10)}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {isExpanded && (
                      <HoldingCompanyPanel
                        holding={{
                          // The name its largest holder filed, and the vouched
                          // display ticker — the pair the server's h6 guard
                          // checks before it will serve any description.
                          name: company.companyName,
                          ticker: company.displayTicker,
                          // H4 ruling 3 lifted the H3 exclusion for exactly
                          // these three, so a card opened from a search result
                          // now says what a card opened from a holding row
                          // says. They come from the same largest filed row
                          // that gives the group its name, and industry is
                          // vendor-sourced only, gated server-side.
                          sector: company.sector ?? null,
                          industry: company.industry ?? null,
                          country: company.country ?? null,
                          // No weight line and no held-through line: a search
                          // result has no single fund to be a percentage of,
                          // and the row directly above the card already lists
                          // every fund that holds it, with each percentage.
                          // Repeating that inside the card would be noise.
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
            {companies !== null && companies.length === 20 && (
              <p style={{ fontSize: 11, color: theme.colors.textDim, margin: '6px 0 0' }}>{CAP_LINE}</p>
            )}
          </div>
        )
      )}
    </div>
  );
}
