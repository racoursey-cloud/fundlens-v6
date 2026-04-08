/**
 * FundLens v6 — Shared SVG Donut Chart Component
 *
 * Ported from v5.1's PortfolioTab.jsx and FundDetailSidebar.jsx donut math.
 * Supports:
 *   - Hover tooltips (name + percentage in center)
 *   - Click drill-in (sector → holdings breakdown, fund → open detail)
 *   - Full 360° edge case (two semicircular arcs to avoid SVG bug)
 *   - Configurable inner radius, size, and gap between slices
 *
 * Used by: Portfolio.tsx (dual donuts), FundDetail.tsx (mini sector donut)
 *
 * Session 11 deliverable. Destination: client/src/components/DonutChart.tsx
 * References: Spec §6.7 (SVG-only charts, no canvas, no third-party libraries)
 */

import { useState, useMemo, type CSSProperties } from 'react';
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
}

// ─── Donut Chart ────────────────────────────────────────────────────────────

export function DonutChart({
  slices,
  size = 220,
  innerRadius = 0.6,
  title,
  onSliceClick,
  drillData,
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
      {drillItems && drillItems.length > 0 && (
        <DrillInPanel
          items={drillItems}
          sliceLabel={slices.find(s => s.id === drillSliceId)?.label ?? ''}
          sliceColor={slices.find(s => s.id === drillSliceId)?.color ?? theme.colors.textDim}
          onClose={() => setDrillSliceId(null)}
        />
      )}
    </div>
  );
}

// ─── Drill-In Panel ─────────────────────────────────────────────────────────

function DrillInPanel({ items, sliceLabel, sliceColor, onClose }: {
  items: DonutDrillItem[];
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

// ─── Legend ──────────────────────────────────────────────────────────────────

export function DonutLegend({ items, onItemClick }: {
  items: DonutSlice[];
  onItemClick?: (item: DonutSlice) => void;
}) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center',
    }}>
      {items.map(item => (
        <div
          key={item.id}
          onClick={() => onItemClick?.(item)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            cursor: onItemClick ? 'pointer' : 'default',
          }}
        >
          <div style={{
            width: 10, height: 10, borderRadius: 2,
            background: item.color, flexShrink: 0,
          }} />
          <span style={{ color: theme.colors.textMuted }}>{item.label}</span>
          <span style={{
            color: theme.colors.text, fontWeight: 600,
            fontFamily: theme.fonts.mono,
          }}>
            {item.pct.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Mini Donut (for sidebar) ───────────────────────────────────────────────

interface MiniDonutProps {
  sectors: Array<{ sector: string; weight: number; color: string }>;
  size?: number;
  activeSector?: string | null;
  onSectorClick?: (sector: string) => void;
}

export function MiniDonut({ sectors, size = 220, activeSector, onSectorClick }: MiniDonutProps) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.38;
  const innerR = size * 0.26;
  const totalWeight = sectors.reduce((s, sec) => s + sec.weight, 0);

  if (sectors.length === 0 || totalWeight === 0) return null;

  // Build slices using polar math (v5.1 FundDetailSidebar pattern)
  let cursor = 0;
  const slices = sectors.map(sec => {
    const pct = sec.weight / totalWeight;
    const span = pct * 360;
    const startDeg = cursor;
    const endDeg = cursor + span;

    // Slice path with gap
    const gapDeg = span > 2 ? 0.4 : 0;
    const s = startDeg + gapDeg;
    const e = endDeg - gapDeg;

    let path = '';
    if (e > s) {
      const large = (e - s) > 180 ? 1 : 0;
      const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
      const polar = (r: number, deg: number) => ({
        x: cx + r * Math.cos(toRad(deg)),
        y: cy + r * Math.sin(toRad(deg)),
      });

      const o1 = polar(outerR, s);
      const o2 = polar(outerR, e);
      const i1 = polar(innerR, e);
      const i2 = polar(innerR, s);

      const f = (n: number) => n.toFixed(3);
      path = [
        `M ${f(o1.x)} ${f(o1.y)}`,
        `A ${outerR} ${outerR} 0 ${large} 1 ${f(o2.x)} ${f(o2.y)}`,
        `L ${f(i1.x)} ${f(i1.y)}`,
        `A ${innerR} ${innerR} 0 ${large} 0 ${f(i2.x)} ${f(i2.y)}`,
        'Z',
      ].join(' ');
    }

    cursor += span;
    return { ...sec, pct, path, midDeg: startDeg + span / 2 };
  });

  return (
    <div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', margin: '0 auto' }}
      >
        {slices.map(slice => (
          <path
            key={slice.sector}
            d={slice.path}
            fill={slice.color}
            opacity={activeSector && activeSector !== slice.sector ? 0.25 : 1}
            style={{ cursor: onSectorClick ? 'pointer' : 'default', transition: 'opacity 150ms' }}
            onClick={() => onSectorClick?.(slice.sector)}
          />
        ))}
        {/* Centre label */}
        <text
          x={cx} y={cy - 6} textAnchor="middle"
          style={{ fill: theme.colors.textDim, fontSize: 10, fontFamily: theme.fonts.body }}
        >
          Sector
        </text>
        <text
          x={cx} y={cy + 12} textAnchor="middle"
          style={{ fill: theme.colors.text, fontSize: 12, fontFamily: theme.fonts.body, fontWeight: 600 }}
        >
          Exposure
        </text>
      </svg>
    </div>
  );
}
