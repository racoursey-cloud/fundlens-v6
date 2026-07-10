/**
 * FundLens v6 — Shared SVG Donut Chart Component
 *
 * Ported from v5.1's PortfolioTab.jsx donut math.
 * Supports:
 *   - Hover tooltips (name + percentage in center)
 *   - Click drill-in (per-slice item list, note line, and empty state)
 *   - Full 360° edge case (two semicircular arcs to avoid SVG bug)
 *   - Configurable inner radius and size
 *
 * Used by: Research.tsx (dual donuts with drill-in + BarBreakdown),
 * FundLens.tsx and YourBrief.tsx (allocation donuts, no drill).
 *
 * Session 11 deliverable. Destination: client/src/components/DonutChart.tsx
 * References: Spec §6.7 (SVG-only charts, no canvas, no third-party libraries)
 */

import { useState, useMemo } from 'react';
import { theme } from '../theme';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DonutSlice {
  id: string;
  label: string;
  pct: number;       // percentage (0–100)
  color: string;
}

export interface DonutDrillItem {
  name: string;
  ticker?: string | null;
  weight: number;     // percentage
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  innerRadius?: number;   // 0–1, default 0.6
  title?: string;
  onSliceClick?: (slice: DonutSlice) => void;
  /** Drill-in data: when a slice is clicked, show these items below */
  drillData?: Map<string, DonutDrillItem[]>;
  /** Per-slice note shown under the drill panel header (e.g. "+4.2 pts vs market") */
  drillNotes?: Map<string, string>;
  /** Shown in the drill panel when a clicked slice has no drill items */
  drillEmptyMessage?: string;
}

// ─── Donut Chart ────────────────────────────────────────────────────────────

export function DonutChart({
  slices,
  size = 220,
  innerRadius = 0.6,
  title,
  onSliceClick,
  drillData,
  drillNotes,
  drillEmptyMessage,
}: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [drillSliceId, setDrillSliceId] = useState<string | null>(null);
  const r = size / 2;
  const ir = r * innerRadius;

  // Build arc paths — v5.1 pattern with full-ring edge case
  const arcs = useMemo(() => {
    const result: Array<DonutSlice & { d: string; midAngle: number }> = [];
    const R = r * 0.95;
    let cumulative = 0;

    for (const s of slices) {
      const startAngle = cumulative * 2 * Math.PI;
      cumulative += s.pct / 100;
      const endAngle = cumulative * 2 * Math.PI;

      let d: string;
      if (s.pct >= 99.5) {
        // Full ring — two semicircular arcs to avoid SVG 360° bug
        const top    = { ox: r, oy: r - R,  ix: r, iy: r - ir };
        const bottom = { ox: r, oy: r + R,  ix: r, iy: r + ir };
        d = [
          `M ${top.ox} ${top.oy}`,
          `A ${R} ${R} 0 1 1 ${bottom.ox} ${bottom.oy}`,
          `A ${R} ${R} 0 1 1 ${top.ox} ${top.oy}`,
          `L ${top.ix} ${top.iy}`,
          `A ${ir} ${ir} 0 1 0 ${bottom.ix} ${bottom.iy}`,
          `A ${ir} ${ir} 0 1 0 ${top.ix} ${top.iy}`,
          'Z',
        ].join(' ');
      } else {
        const x1  = r + R  * Math.sin(startAngle);
        const y1  = r - R  * Math.cos(startAngle);
        const x2  = r + R  * Math.sin(endAngle);
        const y2  = r - R  * Math.cos(endAngle);
        const ix1 = r + ir * Math.sin(endAngle);
        const iy1 = r - ir * Math.cos(endAngle);
        const ix2 = r + ir * Math.sin(startAngle);
        const iy2 = r - ir * Math.cos(startAngle);
        const large = s.pct > 50 ? 1 : 0;
        d = [
          `M ${x1} ${y1}`,
          `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
          `L ${ix1} ${iy1}`,
          `A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2}`,
          'Z',
        ].join(' ');
      }
      result.push({ ...s, d, midAngle: (startAngle + endAngle) / 2 });
    }
    return result;
  }, [slices, r, ir]);

  const hoveredSlice = hovered !== null ? arcs[hovered] : null;
  const drillItems = drillSliceId && drillData ? drillData.get(drillSliceId) : null;
  // A clicked slice with no drill items still opens the panel when an
  // empty-state message is provided, so the absence of data is stated
  // plainly instead of the click doing nothing.
  const showDrillPanel = drillSliceId !== null && drillData !== undefined
    && ((drillItems?.length ?? 0) > 0 || !!drillEmptyMessage);

  const handleSliceClick = (slice: DonutSlice) => {
    if (drillData) {
      // Toggle drill-in
      setDrillSliceId(prev => prev === slice.id ? null : slice.id);
    }
    if (onSliceClick) {
      onSliceClick(slice);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {title && (
        <div style={{
          fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {title}
        </div>
      )}

      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((arc, i) => (
            <path
              key={arc.id}
              d={arc.d}
              fill={arc.color}
              opacity={hovered === null || hovered === i ? 1 : 0.35}
              style={{
                cursor: (onSliceClick || drillData) ? 'pointer' : 'default',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleSliceClick(arc)}
            />
          ))}
        </svg>

        {/* Center label — hover tooltip */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {hoveredSlice ? (
            <>
              <div style={{
                fontSize: 18, fontWeight: 700, color: theme.colors.text,
                fontFamily: theme.fonts.mono,
              }}>
                {hoveredSlice.pct.toFixed(1)}%
              </div>
              <div style={{
                fontSize: 11, color: theme.colors.textMuted,
                maxWidth: size * 0.45, lineHeight: 1.3,
              }}>
                {hoveredSlice.label}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: theme.colors.textDim }}>
              Hover for detail
            </div>
          )}
        </div>
      </div>

      {/* Drill-in panel (expandable holdings list for selected slice) */}
      {showDrillPanel && (
        <DrillInPanel
          items={drillItems ?? []}
          note={drillSliceId ? drillNotes?.get(drillSliceId) : undefined}
          emptyMessage={drillEmptyMessage}
          sliceLabel={slices.find(s => s.id === drillSliceId)?.label ?? ''}
          sliceColor={slices.find(s => s.id === drillSliceId)?.color ?? theme.colors.textDim}
          onClose={() => setDrillSliceId(null)}
        />
      )}
    </div>
  );
}

// ─── Drill-In Panel ─────────────────────────────────────────────────────────

function DrillInPanel({ items, note, emptyMessage, sliceLabel, sliceColor, onClose }: {
  items: DonutDrillItem[];
  note?: string;
  emptyMessage?: string;
  sliceLabel: string;
  sliceColor: string;
  onClose: () => void;
}) {
  return (
    <div style={{
      width: '100%', marginTop: 4,
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii.md,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.colors.border}`,
        background: `${sliceColor}10`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: sliceColor,
          }} />
          <span style={{
            fontSize: 12, fontWeight: 600, color: theme.colors.text,
          }}>
            {sliceLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: theme.colors.textDim,
            cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Per-slice note (e.g. delta vs market baseline) */}
      {note && (
        <div style={{
          padding: '6px 12px', fontSize: 11,
          color: theme.colors.textMuted,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          {note}
        </div>
      )}

      {/* Empty state — the slice has no drill data and the panel says so */}
      {items.length === 0 && emptyMessage && (
        <div style={{
          padding: '10px 12px', fontSize: 12,
          color: theme.colors.textDim, fontStyle: 'italic',
        }}>
          {emptyMessage}
        </div>
      )}

      {/* Holdings list */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {items.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 12px', gap: 8,
              borderBottom: idx < items.length - 1
                ? `1px solid ${theme.colors.border}` : 'none',
            }}
          >
            <span style={{
              fontSize: 12, color: theme.colors.text, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.name}
            </span>
            {item.ticker && (
              <span style={{
                fontSize: 11, fontFamily: theme.fonts.mono,
                color: theme.colors.textDim, flexShrink: 0,
              }}>
                {item.ticker}
              </span>
            )}
            <span style={{
              fontSize: 11, fontFamily: theme.fonts.mono,
              color: theme.colors.textMuted, flexShrink: 0, minWidth: 44,
              textAlign: 'right',
            }}>
              {item.weight.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal Bar Breakdown ───────────────────────────────────────────────
// Replaces the wrapped-label legend with a sorted horizontal bar chart.
// Items are sorted descending by percentage, label on left, bar + pct on right.

export function BarBreakdown({ items, onItemClick }: {
  items: DonutSlice[];
  onItemClick?: (item: DonutSlice) => void;
}) {
  const sorted = [...items].sort((a, b) => b.pct - a.pct);
  const maxPct = Math.max(...sorted.map(s => s.pct), 1);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.map(item => (
        <div
          key={item.id}
          onClick={() => onItemClick?.(item)}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 48px',
            alignItems: 'center',
            gap: 8,
            cursor: onItemClick ? 'pointer' : 'default',
            padding: '3px 0',
          }}
        >
          {/* Label */}
          <span style={{
            fontSize: 11, color: theme.colors.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: theme.fonts.body,
          }}>
            {item.label}
          </span>

          {/* Bar */}
          <div style={{
            height: 8, borderRadius: 4,
            background: theme.colors.surfaceAlt, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: item.color,
              width: `${(item.pct / maxPct) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Percentage */}
          <span style={{
            fontSize: 11, fontWeight: 600,
            fontFamily: theme.fonts.mono,
            color: theme.colors.text,
            textAlign: 'right',
          }}>
            {item.pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

