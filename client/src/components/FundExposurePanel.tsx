/**
 * FundLens — Fund Exposure Panel (U1-B)
 *
 * The Your Allocation three-panel block, extracted from YourBrief.tsx into a
 * shared component so it can be embedded per-fund (U1 WAVE U1-B). Sector
 * exposure left, a donut in the middle, holdings right; click a sector to
 * filter the holdings list, click again to clear. On narrow screens the
 * side panels drop and reappear as one stacked card beneath the donut.
 *
 * Extracted VERBATIM from YourBrief's block: every size, gap, opacity,
 * transition, grid template, truncation and scroll ceiling is the value it
 * had there, so "donut parity with the old YourBrief component" is a
 * reading of the same code rather than a comparison of two.
 *
 * THE RISK DIAL IS NOT HERE, per the assignment. It was never inside this
 * block — it is a sibling below the fund chips in YourBrief — so extracting
 * the block excludes it by construction. Same for the fund selector chips:
 * they are Your Brief's way of choosing WHICH fund the panels describe, and
 * a fund detail already knows.
 *
 * The CENTER is a prop, because the two call sites put different things
 * there and the assignment's phrase is "embedded per-fund":
 *   - Your Brief passes the allocation donut (weights across your funds)
 *     plus the selected fund's label, unchanged.
 *   - The fund detail passes that fund's own sector donut.
 * The panel owns the left/right content and the sector filter; the parent
 * owns the donut and what clicking it means. Nothing about the center is
 * assumed here.
 *
 * BOTH TIERS render this. Everything it draws — sector weights, holding
 * names, tickers, percentages, sectors — is already enumerated in the B2
 * allowlist (src/engine/reference-shape.ts), which is why the assignment
 * can say "richer view, zero new data". No evaluative value passes through
 * this file: the colors are the caller's composition palette and say what a
 * fund HOLDS, never whether that is good.
 *
 * H3 t1 — COMPANY PANEL EVERYWHERE. Every holding row in the list below
 * now opens the shared company panel (components/HoldingCompanyPanel.tsx),
 * the same one H2 built for the fund detail's Holdings tab: same endpoint,
 * same h6 serve-time name-guard, same filed-name-plus-Wikipedia fallback.
 * One wiring lights up all three surfaces this component renders on. The
 * governing principle of the wave, Robert's words: "At any point that I
 * see something — oh, tell me more about that — I want to be a click away
 * from that."
 *
 * Destination: client/src/components/FundExposurePanel.tsx
 */

import { Fragment, useState, type ReactNode } from 'react';
import { HoldingCompanyPanel } from './HoldingCompanyPanel';
import { useDrillScroll } from './drill-scroll';
import { theme } from '../theme';

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface ExposureSector {
  sector: string;
  /** Percent on the 0–100 scale */
  weight: number;
  /** Composition color, chosen by the caller from its own palette */
  color: string;
}

export interface ExposureHolding {
  name: string;
  ticker: string | null;
  /** Percent on the 0–100 scale */
  weight: number;
  sector: string | null;
  /** H4: the VENDOR's industry where the caller's rows carry one (the
   *  ?all=1 holdings do; the Brief's stored snapshot does not) */
  industry?: string | null;
  /** H4: country of issuer as filed, same provenance rule */
  country?: string | null;
  /**
   * H4: the row's weight as the CARD should print it. The list prints its
   * own one-decimal figure as it always has; a caller whose page rules a
   * different convention — My Mix's dust floor, which prints "<0.1%" where
   * one decimal would print a false "0.0%" — passes it here so the card
   * never contradicts the row it opened from. Absent: the card formats the
   * weight above at one decimal, matching the row.
   */
  weightText?: string;
}

interface FundExposurePanelProps {
  sectors: ExposureSector[];
  holdings: ExposureHolding[];
  /** Controlled: the sector currently filtering the holdings list */
  selectedSector: string | null;
  onSelectSector: (sector: string | null) => void;
  /** The middle column — the caller's donut, and anything beneath it */
  center: ReactNode;
  isMobile: boolean;
  /**
   * Your Brief dims both side panels to 0.3 until a fund is chosen from the
   * allocation donut. A fund detail is always about one fund, so it passes
   * true and the panels never dim.
   */
  active?: boolean;
  /**
   * How many sectors the left panel lists with no filter applied.
   * Your Brief's values are the default (8 desktop / 6 mobile). The fund
   * detail passes null: that surface replaced a legend that printed EVERY
   * filed sector, and capping it would drop sectors a fund actually holds.
   */
  sectorLimit?: number | null;
  /** Same, for the unfiltered holdings list. A selected sector always shows
   *  all of its holdings in a scrolling window, at either call site. */
  holdingsLimit?: number | null;
  /** Rendered under the block — provenance and disclosure lines */
  footnotes?: ReactNode;
  /**
   * H3 t1 — DO THESE ROWS CARRY VOUCHED DISPLAY TICKERS?
   *
   * The standing rule (H1-F2 followup, honored by H2 p3) is that the company
   * panel keys on VALIDATED display tickers only: holdings_cache.ticker,
   * which the pipeline's display-validation pass either vouches for or sets
   * to null for the honest dash. A lookup on an unvouched code is how the
   * wrong company reaches a member.
   *
   * The three surfaces do not all feed this component from that column:
   *   - the fund detail's Sectors tab reads holdings_cache (?all=1) — vouched;
   *   - My Mix reads it too, once its ?all=1 fetches land — vouched from then;
   *   - the Brief allocation card reads factor_details.topHoldings, the
   *     stored pipeline blob, which carries the RAW resolved ticker.
   *
   * Measured read-only on August 15, 2026: of 9,813 stored blob rows, 6,780
   * carry a ticker, and 680 of those either were refused by the display
   * validation (379) or differ from the ticker it vouched (301). Forty-four
   * of the refused ones have a cached FMP profile behind them.
   *
   * So the flag defaults to FALSE — fail closed. A row whose ticker is not
   * known-vouched still OPENS (no dead ends, the wave's principle): it opens
   * the ruled fallback, filed name plus the Wikipedia search link, with zero
   * network calls, exactly as a dash row does. Callers reading the vouched
   * column pass true and get the full panel.
   *
   * H3-F2 (Robert's ruling, August 15, 2026, on seeing NVIDIA fall back on
   * his own Brief — "it seems to me that there should be information about
   * Nvidia"): a caller whose rows are NOT from the vouched column may instead
   * pass THE SET of tickers the app has vouched, and the decision is made per
   * row. A row whose ticker is in the set is looked up; every other row keeps
   * the fallback. That is what lets the Brief allocation card serve NVIDIA —
   * vouched on four funds — while the 426 snapshot tickers the display
   * validation never vouched anywhere stay exactly as safe as they are today.
   *
   * The h6 serve-time guard is still the last word in every case: a ticker
   * this component agrees to look up can still be refused by the server when
   * the filed name and the vendor profile disagree, and the row falls back.
   *
   * Values: true = every row (they come from the vouched column) · false or
   * absent = none · a Set = these tickers, compared upper-cased.
   */
  tickersAreDisplayValidated?: boolean | ReadonlySet<string>;
  /**
   * H4 — WHAT THE ROW'S PERCENTAGE IS A PERCENTAGE OF, in the member's
   * words: a fund's ticker on a fund page ("0.12% of FXAIX"), "the mix" on
   * My Mix. The card states it because a number with no denominator is not
   * a fact. Absent: the card omits the weight line rather than printing an
   * unanchored percentage.
   */
  weightOfLabel?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FundExposurePanel({
  sectors,
  holdings,
  selectedSector,
  onSelectSector,
  center,
  isMobile,
  active = true,
  sectorLimit,
  holdingsLimit,
  footnotes,
  tickersAreDisplayValidated = false,
  weightOfLabel,
}: FundExposurePanelProps) {
  const defaultLimit = isMobile ? 6 : 8;
  const sectorCap = sectorLimit === undefined ? defaultLimit : sectorLimit;
  const holdingsCap = holdingsLimit === undefined ? defaultLimit : holdingsLimit;

  const shownSectors = sectorCap === null ? sectors : sectors.slice(0, sectorCap);
  const filteredHoldings = selectedSector
    ? holdings.filter(h => h.sector === selectedSector)
    : holdingsCap === null
      ? holdings
      : holdings.slice(0, holdingsCap);

  const toggleSector = (sector: string) =>
    onSelectSector(selectedSector === sector ? null : sector);

  return (
    <>
      <div
        style={
          isMobile
            ? { display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }
            : {
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: 20,
                alignItems: 'start',
                minHeight: 260,
              }
        }
      >
        {/* LEFT PANEL — Sector Exposure (desktop only) */}
        {!isMobile && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            opacity: active ? 1 : 0.3,
            transition: 'opacity 0.2s',
            minWidth: 0,
          }}>
            {active && (
              <div style={{
                fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
              }}>Sector Exposure</div>
            )}
            {active && shownSectors.length > 0 ? (
              <SectorBars
                sectors={shownSectors}
                allSectors={sectors}
                selectedSector={selectedSector}
                onToggle={toggleSector}
                mobile={false}
              />
            ) : active ? (
              <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                No sector data
              </span>
            ) : null}
          </div>
        )}

        {/* CENTER — the caller's donut */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          {center}
        </div>

        {/* RIGHT PANEL — Holdings, filtered by the selected sector (desktop) */}
        {!isMobile && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            opacity: active ? 1 : 0.3,
            transition: 'opacity 0.2s',
            minWidth: 0,
          }}>
            {active && (
              <>
                <HoldingsHeader
                  selectedSector={selectedSector}
                  onClear={() => onSelectSector(null)}
                  marginBottom={4}
                />
                {filteredHoldings.length > 0 ? (
                  <HoldingsList
                  holdings={filteredHoldings}
                  scrolling={!!selectedSector}
                  tickersAreDisplayValidated={tickersAreDisplayValidated}
                  weightOfLabel={weightOfLabel}
                />
                ) : (
                  <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                    {selectedSector ? `No ${selectedSector} holdings` : 'No holdings data'}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* MOBILE — the stacked card beneath the donut */}
      {isMobile && active && (
        <div style={{
          background: theme.colors.surfaceAlt,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.md,
          padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
          width: '100%',
        }}>
          {shownSectors.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
              }}>Sector Exposure</div>
              <SectorBars
                sectors={shownSectors}
                allSectors={sectors}
                selectedSector={selectedSector}
                onToggle={toggleSector}
                mobile
              />
            </div>
          )}
          {filteredHoldings.length > 0 ? (
            <div>
              <HoldingsHeader
                selectedSector={selectedSector}
                onClear={() => onSelectSector(null)}
                marginBottom={8}
              />
              <HoldingsList
                holdings={filteredHoldings}
                scrolling={!!selectedSector}
                tickersAreDisplayValidated={tickersAreDisplayValidated}
                weightOfLabel={weightOfLabel}
              />
            </div>
          ) : selectedSector ? (
            <div>
              <span style={{ fontSize: 11, color: theme.colors.textDim, fontStyle: 'italic' }}>
                No {selectedSector} holdings
              </span>
            </div>
          ) : null}
        </div>
      )}

      {footnotes}
    </>
  );
}

// ─── Sector bars ───────────────────────────────────────────────────────────
// The bar length is each sector's share OF THE LARGEST SECTOR, not of the
// fund — the YourBrief scaling, carried as-is. The number beside it is the
// sector's own weight, so the figure is never the thing being scaled.

function SectorBars({
  sectors,
  allSectors,
  selectedSector,
  onToggle,
  mobile,
}: {
  sectors: ExposureSector[];
  allSectors: ExposureSector[];
  selectedSector: string | null;
  onToggle: (sector: string) => void;
  mobile: boolean;
}) {
  const maxWeight = Math.max(...allSectors.map(x => x.weight));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sectors.map(s => {
        const isActive = selectedSector === s.sector;
        const isDimmed = selectedSector !== null && !isActive;
        return (
          <div
            key={s.sector}
            onClick={() => onToggle(s.sector)}
            style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '80px 1fr 36px' : '90px 1fr 40px',
              alignItems: 'center', gap: 6,
              cursor: 'pointer',
              opacity: isDimmed ? 0.35 : 1,
              transition: 'opacity 0.15s',
              borderRadius: 3,
              background: isActive ? `${s.color}15` : 'transparent',
              padding: '1px 4px',
              margin: '0 -4px',
            }}
          >
            <span style={{
              fontSize: 11,
              color: isActive ? theme.colors.text : theme.colors.textMuted,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontWeight: isActive ? 600 : 400,
            }}>{s.sector}</span>
            <div style={{
              height: 6, borderRadius: 3,
              background: mobile ? theme.colors.surface : theme.colors.surfaceAlt,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3, background: s.color,
                width: `${Math.min(100, (s.weight / maxWeight) * 100)}%`,
              }} />
            </div>
            <span style={{
              fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
              color: theme.colors.text, textAlign: 'right',
            }}>{s.weight.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Holdings ──────────────────────────────────────────────────────────────

function HoldingsHeader({
  selectedSector,
  onClear,
  marginBottom,
}: {
  selectedSector: string | null;
  onClear: () => void;
  /** 4 in the desktop column, 8 in the mobile card — both as YourBrief had them */
  marginBottom: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: theme.colors.textDim,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {selectedSector ? `${selectedSector} Holdings` : 'Top Holdings'}
      </div>
      {selectedSector && (
        <button
          onClick={onClear}
          style={{
            background: 'none', border: 'none', color: theme.colors.textDim,
            cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1,
            fontFamily: theme.fonts.body,
          }}
        >&times;</button>
      )}
    </div>
  );
}

/** May this row's ticker be sent to the company endpoint? True only where the
 *  caller has vouched for it — as a whole list, or as a named set (H3-F2). */
function mayLookUpTicker(
  ticker: string | null,
  vouching: boolean | ReadonlySet<string>,
): boolean {
  if (ticker === null) return false;
  if (typeof vouching === 'boolean') return vouching;
  return vouching.has(ticker.trim().toUpperCase());
}

function HoldingsList({
  holdings,
  scrolling,
  tickersAreDisplayValidated,
  weightOfLabel,
}: {
  holdings: ExposureHolding[];
  scrolling: boolean;
  tickersAreDisplayValidated: boolean | ReadonlySet<string>;
  weightOfLabel?: string;
}) {
  // H3 t1: which row is drilled in (one at a time; click toggles) — the
  // Holdings tab's pattern, one level in. The key carries the row's position
  // AND its identity, so changing the sector filter — which reshuffles
  // positions — closes the panel instead of reopening it under a different
  // company.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // H4: with a sector filter on, this list becomes a 300px window (below),
  // and a card opened from a row past its fold used to show nothing but its
  // top border. The hook moves the window so the clicked row sits at the top
  // of it, giving the card the rest.
  const anchorRow = useDrillScroll(expandedKey);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      ...(scrolling ? { maxHeight: 300, overflowY: 'auto' as const } : {}),
    }}>
      {holdings.map((h, idx) => {
        const rowKey = `${idx}:${h.name}:${h.ticker ?? ''}`;
        const isExpanded = expandedKey === rowKey;
        return (
          <Fragment key={idx}>
            <div
              ref={anchorRow(rowKey)}
              onClick={() => setExpandedKey(prev => (prev === rowKey ? null : rowKey))}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '2px 0', gap: 8,
                cursor: 'pointer',
              }}
            >
              {/* H2-F1's lesson, carried: the door has to be visible to be a
                  door. Every row opens — including dash rows and rows whose
                  ticker is not vouched, which open the Wikipedia fallback. */}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 8,
                  fontSize: 9,
                  color: theme.colors.textDim,
                  flexShrink: 0,
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              >
                ▸
              </span>
              <span style={{
                fontSize: 11, color: theme.colors.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}>{h.name}</span>
              {h.ticker && (
                <span style={{
                  fontSize: 10, fontFamily: theme.fonts.mono,
                  color: theme.colors.textDim, flexShrink: 0,
                }}>{h.ticker}</span>
              )}
              <span style={{
                fontSize: 10, fontFamily: theme.fonts.mono, fontWeight: 600,
                color: theme.colors.accentBlue, flexShrink: 0, minWidth: 36,
                textAlign: 'right',
              }}>{h.weight.toFixed(1)}%</span>
            </div>
            {isExpanded && (
              <div style={{
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radii.sm,
                overflow: 'hidden',
                margin: '2px 0 6px',
              }}>
                <HoldingCompanyPanel
                  holding={{
                    name: h.name,
                    // Fail closed: an unvouched code is never looked up.
                    ticker: mayLookUpTicker(h.ticker, tickersAreDisplayValidated) ? h.ticker : null,
                    sector: h.sector,
                    // H4: whatever this caller's rows carry. The ?all=1
                    // holdings carry both; the Brief's stored snapshot
                    // carries neither, and its card simply prints one line
                    // fewer rather than an apology.
                    industry: h.industry ?? null,
                    country: h.country ?? null,
                    weight: weightOfLabel
                      ? { text: h.weightText ?? `${h.weight.toFixed(1)}%`, of: weightOfLabel }
                      : null,
                  }}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
