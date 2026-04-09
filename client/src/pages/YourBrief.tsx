/**
 * FundLens v6 — Your Brief Page
 *
 * Primary landing page — the product. Layout (top to bottom):
 *   1. Header row with title + Generate / Generate & Email buttons
 *   2. Allocation donut card (full-width, with fund highlights table + risk slider)
 *   3. Brief narrative (full-width, 4 W-structure sections)
 *   4. Brief history rows (natural table at bottom)
 *
 * Session 19 redesign — donut on top, history at bottom as rows, full-width.
 * References: Spec §6.1, §7.1–§7.9, editorial-policy.md
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  fetchBriefs,
  fetchBrief,
  generateBrief,
  fetchScores,
  fetchProfile,
  updateProfile,
  type Brief,
  type FundScore,
  type UserProfile,
} from '../api';
import { theme } from '../theme';
import { DonutChart, DonutLegend, type DonutSlice } from '../components/DonutChart';
import { computeClientAllocations, type ClientAllocationInput } from '../engine/allocation';

// ─── Shared Utilities ─────────────────────────────────────────────────────

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const absZ = Math.abs(z);
  const x = absZ / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);
  const result = 0.5 * (1.0 + erf);
  return z >= 0 ? result : 1.0 - result;
}

const MAD_CONSISTENCY = 0.6745;
const MM_TICKERS = new Set(['FDRXX', 'ADAXX']);

const TIER_BADGES = [
  { tier: 'Breakaway', zMin: 2.0, color: '#F59E0B' },
  { tier: 'Strong',    zMin: 1.2, color: '#10B981' },
  { tier: 'Solid',     zMin: 0.3, color: '#3B82F6' },
  { tier: 'Neutral',   zMin: -0.5, color: '#6B7280' },
  { tier: 'Weak',      zMin: -Infinity, color: '#EF4444' },
] as const;

function clientMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[mid]!;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function computeClientTier(
  ticker: string, composite: number,
  allComposites: { ticker: string; composite: number }[]
): { tier: string; tierColor: string } {
  if (MM_TICKERS.has(ticker)) return { tier: 'MM', tierColor: '#4B5563' };
  const nonMM = allComposites.filter(f => !MM_TICKERS.has(f.ticker));
  if (nonMM.length === 0) return { tier: 'Neutral', tierColor: '#6B7280' };
  const scores = nonMM.map(f => f.composite);
  const med = clientMedian(scores);
  const mad = clientMedian(scores.map(s => Math.abs(s - med)));
  const safeMad = mad > 0 ? mad : 1e-9;
  const modZ = MAD_CONSISTENCY * (composite - med) / safeMad;
  for (const badge of TIER_BADGES) {
    if (modZ >= badge.zMin) return { tier: badge.tier, tierColor: badge.color };
  }
  return { tier: 'Weak', tierColor: '#EF4444' };
}

const FUND_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a78bfa',
  '#fb923c', '#84cc16',
];

const RISK_ANCHORS: Array<{ level: number; label: string }> = [
  { level: 1, label: 'Very Conservative' },
  { level: 2, label: 'Conservative' },
  { level: 3, label: 'Mod. Conservative' },
  { level: 4, label: 'Moderate' },
  { level: 5, label: 'Mod. Aggressive' },
  { level: 6, label: 'Aggressive' },
  { level: 7, label: 'Very Aggressive' },
];

function nearestRiskLabel(value: number): string {
  const nearest = Math.round(Math.min(7, Math.max(1, value)));
  return RISK_ANCHORS.find(a => a.level === nearest)?.label ?? 'Moderate';
}

// ─── Stale Brief Detection (Option B) ──────────────────────────────────────

function extractBriefRisk(brief: Brief | null): number | null {
  if (!brief?.data_packet) return null;
  const dp = brief.data_packet as { user?: { riskTolerance?: string } };
  const rtStr = dp?.user?.riskTolerance;
  if (!rtStr) return null;
  const match = rtStr.match(/\((\d+\.?\d*)\/7\)/);
  return match?.[1] ? parseFloat(match[1]) : null;
}

// ─── Brief Section Parsing & Rendering ─────────────────────────────────────

interface BriefSection {
  title: string;
  body: string;
  index: number;
}

const W_SECTION_TITLES = [
  'Where the Numbers Point',
  'What Happened',
  "What We're Watching",
  'Where We Stand',
];

const SECTION_ACCENTS = [
  theme.colors.accentBlue,
  theme.colors.success,
  theme.colors.warning,
  theme.colors.accentBlue,
];

function parseBriefSections(md: string): { preamble: string; sections: BriefSection[] } {
  const lines = md.split('\n');
  let preamble = '';
  const sections: BriefSection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const flushSection = () => {
    if (currentTitle) {
      const canonicalIndex = W_SECTION_TITLES.findIndex(
        (t) => currentTitle.toLowerCase().includes(t.toLowerCase())
      );
      sections.push({
        title: currentTitle,
        body: currentLines.join('\n').trim(),
        index: canonicalIndex >= 0 ? canonicalIndex + 1 : sections.length + 1,
      });
    } else if (currentLines.length > 0) {
      preamble = currentLines.join('\n').trim();
    }
  };

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      flushSection();
      currentTitle = h2Match[1]?.trim() ?? '';
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flushSection();
  return { preamble, sections };
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const htmlParts: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { htmlParts.push('</ul>'); inUl = false; }
    if (inOl) { htmlParts.push('</ol>'); inOl = false; }
  };

  const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const inlineFormat = (text: string): string => {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${theme.colors.text};font-weight:600">$1</strong>`)
      .replace(/\*(.+?)\*/g, `<em>$1</em>`)
      .replace(/`(.+?)`/g, `<code style="font-family:${theme.fonts.mono};font-size:13px;background:${theme.colors.surface};padding:2px 6px;border-radius:4px">$1</code>`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^---+$/.test(line.trim())) { closeList(); htmlParts.push(`<hr style="border:none;border-top:1px solid ${theme.colors.border};margin:24px 0" />`); continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { closeList(); htmlParts.push(`<h3 style="font-family:${theme.fonts.serif};font-size:16px;font-weight:600;color:${theme.colors.text};margin:28px 0 12px;line-height:1.4">${inlineFormat(h3[1] ?? '')}</h3>`); continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { closeList(); htmlParts.push(`<h2 style="font-family:${theme.fonts.serif};font-size:18px;font-weight:700;color:${theme.colors.text};margin:32px 0 12px;line-height:1.4">${inlineFormat(h2[1] ?? '')}</h2>`); continue; }
    const h1 = line.match(/^# (.+)/);
    if (h1) { closeList(); htmlParts.push(`<h1 style="font-family:${theme.fonts.serif};font-size:22px;font-weight:700;color:${theme.colors.text};margin:32px 0 16px;line-height:1.3">${inlineFormat(h1[1] ?? '')}</h1>`); continue; }
    const ul = line.match(/^[-*] (.+)/);
    if (ul) { if (inOl) { htmlParts.push('</ol>'); inOl = false; } if (!inUl) { htmlParts.push(`<ul style="margin:8px 0;padding-left:24px;color:${theme.colors.textMuted};line-height:1.8">`); inUl = true; } htmlParts.push(`<li>${inlineFormat(ul[1] ?? '')}</li>`); continue; }
    const ol = line.match(/^\d+\. (.+)/);
    if (ol) { if (inUl) { htmlParts.push('</ul>'); inUl = false; } if (!inOl) { htmlParts.push(`<ol style="margin:8px 0;padding-left:24px;color:${theme.colors.textMuted};line-height:1.8">`); inOl = true; } htmlParts.push(`<li>${inlineFormat(ol[1] ?? '')}</li>`); continue; }
    if (line.trim() === '') { closeList(); continue; }
    closeList();
    htmlParts.push(`<p style="margin:0 0 16px;color:${theme.colors.textMuted};line-height:1.7;font-size:14px">${inlineFormat(line)}</p>`);
  }
  closeList();
  return DOMPurify.sanitize(htmlParts.join('\n'), {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'hr'],
    ALLOWED_ATTR: ['style'],
  });
}

// ─── Sub-Components ────────────────────────────────────────────────────────

function BriefSectionCard({ section }: { section: BriefSection }) {
  const accent = SECTION_ACCENTS[section.index - 1] ?? theme.colors.accentBlue;
  return (
    <div style={{
      background: theme.colors.surfaceAlt,
      border: `1px solid ${theme.colors.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: theme.radii.md,
      padding: '20px 24px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '24px', height: '24px', borderRadius: '50%',
          background: `${accent}20`, color: accent,
          fontSize: '12px', fontWeight: 700, fontFamily: theme.fonts.mono, flexShrink: 0,
        }}>{section.index}</span>
        <h2 style={{
          fontFamily: theme.fonts.serif, fontSize: '18px', fontWeight: 700,
          color: theme.colors.text, margin: 0, lineHeight: 1.4,
        }}>{section.title}</h2>
      </div>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }} />
    </div>
  );
}

function BriefBody({ contentMd }: { contentMd: string }) {
  const { preamble, sections } = parseBriefSections(contentMd);
  if (sections.length === 0) {
    return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentMd) }} />;
  }
  return (
    <div>
      {preamble && (
        <div style={{ marginBottom: '20px' }}>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(preamble) }} />
        </div>
      )}
      {sections.map((section, i) => <BriefSectionCard key={i} section={section} />)}
    </div>
  );
}

function StatusBadge({ status }: { status: Brief['status'] }) {
  const colorMap: Record<string, string> = {
    generated: theme.colors.success,
    sent: theme.colors.accentBlue,
    failed: theme.colors.error,
  };
  const color = colorMap[status] ?? theme.colors.textDim;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: theme.radii.sm,
      fontSize: '11px', fontWeight: 600, fontFamily: theme.fonts.mono,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      color, background: `${color}18`,
    }}>{status}</span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function YourBrief() {
  // Brief state
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null);
  const [loadingBriefs, setLoadingBriefs] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState('');
  const [genError, setGenError] = useState('');

  // Score + profile state (for allocation donut + risk slider)
  const [scores, setScores] = useState<FundScore[]>([]);
  const [_profile, setProfile] = useState<UserProfile | null>(null);
  const [risk, setRisk] = useState<number>(4.0);
  const [weights, setWeights] = useState({ cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25 });
  const [loadingScores, setLoadingScores] = useState(true);

  // ── Data fetching ─────────────────────────────────────────────────────

  const loadBriefs = useCallback(async () => {
    const { data, error } = await fetchBriefs();
    if (data && !error) {
      setBriefs(data.briefs);
      if (data.briefs.length > 0) {
        const latest = data.briefs[0];
        if (latest) {
          const { data: fullBrief } = await fetchBrief(latest.id);
          setSelectedBrief(fullBrief?.brief ?? latest);
        }
      }
    }
    setLoadingBriefs(false);
  }, []);

  useEffect(() => { loadBriefs(); }, [loadBriefs]);

  useEffect(() => {
    Promise.all([fetchScores(), fetchProfile()]).then(([scoresRes, profileRes]) => {
      if (scoresRes.data?.scores) setScores(scoresRes.data.scores);
      if (profileRes.data?.profile) {
        const p = profileRes.data.profile;
        setProfile(p);
        setWeights({
          cost: p.weight_cost, quality: p.weight_quality,
          positioning: p.weight_positioning, momentum: p.weight_momentum,
        });
        setRisk(p.risk_tolerance);
      }
      setLoadingScores(false);
    });
  }, []);

  // ── Brief actions ─────────────────────────────────────────────────────

  const handleSelectBrief = async (id: string) => {
    const { data, error } = await fetchBrief(id);
    if (data && !error) setSelectedBrief(data.brief);
  };

  const handleGenerate = async (sendEmail: boolean) => {
    setGenerating(true);
    setGenMessage('');
    setGenError('');
    const { data, error } = await generateBrief(sendEmail);
    if (error) { setGenError(error); }
    else { setGenMessage(data?.message ?? 'Brief generation started'); setTimeout(() => loadBriefs(), 3000); }
    setGenerating(false);
  };

  // ── Risk slider ───────────────────────────────────────────────────────

  const handleRiskChange = useCallback((val: number) => {
    setRisk(val);
    updateProfile({ risk_tolerance: val });
  }, []);

  // ── Client-side rescore + allocation ──────────────────────────────────

  const rankedScores = useMemo(() => {
    const withComposites = scores.map(s => {
      const zComposite =
        (s.z_cost_efficiency ?? 0) * weights.cost +
        (s.z_holdings_quality ?? 0) * weights.quality +
        (s.z_positioning ?? 0) * weights.positioning +
        (s.z_momentum ?? 0) * weights.momentum;
      const composite = Math.round(Math.max(0, Math.min(100, 100 * normalCDF(zComposite))));
      return { ...s, userComposite: composite };
    });
    const allComposites = withComposites.map(s => ({
      ticker: s.funds?.ticker || s.fund_id, composite: s.userComposite,
    }));
    return withComposites
      .map(s => {
        const ticker = s.funds?.ticker || s.fund_id;
        const tierInfo = computeClientTier(ticker, s.userComposite, allComposites);
        return { ...s, userTier: tierInfo.tier, userTierColor: tierInfo.tierColor };
      })
      .sort((a, b) => {
        const aIsMM = MM_TICKERS.has(a.funds?.ticker || a.fund_id);
        const bIsMM = MM_TICKERS.has(b.funds?.ticker || b.fund_id);
        if (aIsMM && !bIsMM) return 1;
        if (!aIsMM && bIsMM) return -1;
        return b.userComposite - a.userComposite;
      });
  }, [scores, weights]);

  const allocations = useMemo(() => {
    const inputs: ClientAllocationInput[] = rankedScores.map(s => ({
      ticker: s.funds?.ticker || s.fund_id,
      compositeScore: s.userComposite,
      isMoneyMarket: MM_TICKERS.has(s.funds?.ticker || s.fund_id),
      fallbackCount: (s.factor_details as Record<string, unknown>)?.fallbackCount as number ?? 0,
    }));
    return computeClientAllocations(inputs, risk);
  }, [rankedScores, risk]);

  const allocMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      if (a.allocationPct > 0) map.set(a.ticker, a.allocationPct);
    }
    return map;
  }, [allocations]);

  const fundSlices = useMemo((): DonutSlice[] => {
    return allocations
      .filter(a => a.allocationPct > 0)
      .map((a, i) => ({
        id: a.ticker, label: a.ticker, pct: a.allocationPct,
        color: FUND_PALETTE[i % FUND_PALETTE.length]!,
      }));
  }, [allocations]);

  // ── Stale indicator (Option B) ────────────────────────────────────────

  const briefRisk = extractBriefRisk(selectedBrief);
  const isStale = briefRisk !== null && Math.abs(risk - briefRisk) >= 0.1;

  // ── Helpers ───────────────────────────────────────────────────────────

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (loadingBriefs && loadingScores) {
    return (
      <div style={{ color: theme.colors.textMuted, padding: '32px' }}>
        <div style={spinnerStyle} />
        <p style={{ textAlign: 'center', marginTop: 16 }}>Loading...</p>
      </div>
    );
  }

  // ── Empty state (no briefs yet) ───────────────────────────────────────

  if (briefs.length === 0 && !generating) {
    return (
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
          Your Brief
        </h1>
        <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: '0 0 24px' }}>
          Your personalized investment brief.
        </p>
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, padding: '48px 32px', textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: '16px' }}>
            <rect x="8" y="4" width="32" height="40" rx="4" stroke={theme.colors.border} strokeWidth="2" fill="none" />
            <line x1="14" y1="16" x2="34" y2="16" stroke={theme.colors.border} strokeWidth="2" />
            <line x1="14" y1="22" x2="34" y2="22" stroke={theme.colors.border} strokeWidth="2" />
            <line x1="14" y1="28" x2="26" y2="28" stroke={theme.colors.border} strokeWidth="2" />
          </svg>
          <p style={{ fontFamily: theme.fonts.serif, color: theme.colors.text, margin: '0 0 8px', fontSize: '17px', fontWeight: 700 }}>
            Run Analysis to generate your first Investment Brief
          </p>
          <p style={{ color: theme.colors.textDim, margin: '0 0 24px', fontSize: '13px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Your personalized investment brief covers fund recommendations, market narrative, risks, and sector outlook.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={() => handleGenerate(false)} disabled={generating} style={primaryBtnStyle(generating)}>
              {generating ? 'Generating...' : 'Generate Brief'}
            </button>
            <button onClick={() => handleGenerate(true)} disabled={generating} style={secondaryBtnStyle(generating)}>
              Generate & Email
            </button>
          </div>
          {genError && <p style={{ color: theme.colors.error, fontSize: '13px', marginTop: '12px' }}>{genError}</p>}
          {genMessage && <p style={{ color: theme.colors.success, fontSize: '13px', marginTop: '12px' }}>{genMessage}</p>}
        </div>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
            Your Brief
          </h1>
          <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: 0 }}>
            Your personalized investment brief.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button onClick={() => handleGenerate(false)} disabled={generating} style={primaryBtnStyle(generating)}>
            {generating ? 'Generating...' : 'Generate Brief'}
          </button>
          <button onClick={() => handleGenerate(true)} disabled={generating} style={secondaryBtnStyle(generating)}>
            Generate & Email
          </button>
        </div>
      </div>

      {/* Feedback messages */}
      {genError && (
        <div style={{
          background: `${theme.colors.error}15`, border: `1px solid ${theme.colors.error}40`,
          borderRadius: theme.radii.md, padding: '10px 16px',
          fontSize: '13px', color: theme.colors.error,
        }}>{genError}</div>
      )}
      {genMessage && (
        <div style={{
          background: `${theme.colors.success}15`, border: `1px solid ${theme.colors.success}40`,
          borderRadius: theme.radii.md, padding: '10px 16px',
          fontSize: '13px', color: theme.colors.success,
        }}>{genMessage}</div>
      )}

      {/* Stale brief indicator (Option B) */}
      {isStale && selectedBrief && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: theme.radii.md, padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: '#fbbf24' }}>
            Your risk setting has changed since this brief was generated.
          </span>
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.4)',
              background: 'rgba(245,158,11,0.12)', color: '#fbbf24',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              fontFamily: theme.fonts.body,
            }}
          >
            Refresh Brief
          </button>
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={spinnerStyle} />
          <p style={{ color: theme.colors.text, margin: '16px 0 4px', fontWeight: 500, fontSize: '15px' }}>
            Generating your Investment Brief...
          </p>
          <p style={{ color: theme.colors.textDim, margin: 0, fontSize: '13px' }}>
            Analyzing your portfolio. This may take 30–60 seconds.
          </p>
        </div>
      )}

      {/* ═══ ALLOCATION CARD (donut + table + risk slider) — TOP ═══════════ */}
      {!loadingScores && scores.length > 0 && (
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 24px', borderBottom: `1px solid ${theme.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: theme.colors.textMuted,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>Your Allocation</span>
            <span style={{ fontSize: 12, color: theme.colors.textDim }}>
              Risk: {nearestRiskLabel(risk)} ({risk.toFixed(1)})
            </span>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Donut + Fund highlights — side by side */}
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Donut + legend */}
              {fundSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <DonutChart slices={fundSlices} size={200} title="Recommended Allocation" />
                  <DonutLegend items={fundSlices} />
                </div>
              )}

              {/* Fund highlights table */}
              <div style={{ flex: 1, minWidth: 300, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                      {['Fund', 'Name', 'Allocation', 'Score', 'Tier'].map((h, idx) => (
                        <th key={h} style={{
                          padding: '8px 12px', textAlign: idx < 2 ? 'left' : 'center',
                          fontWeight: 600, color: theme.colors.textDim, fontSize: 11,
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rankedScores
                      .filter(s => allocMap.has(s.funds?.ticker || s.fund_id))
                      .map((s, i) => {
                        const ticker = s.funds?.ticker || s.fund_id.slice(0, 8);
                        const name = s.funds?.name || '';
                        const alloc = allocMap.get(ticker);
                        return (
                          <tr key={s.id} style={{
                            borderBottom: i < allocMap.size - 1 ? `1px solid ${theme.colors.border}` : 'none',
                          }}>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                fontWeight: 700, color: theme.colors.accentBlue,
                                fontFamily: theme.fonts.mono, letterSpacing: '0.02em',
                              }}>{ticker}</span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                fontSize: 12, color: theme.colors.textMuted,
                                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap', display: 'inline-block',
                              }}>{name}</span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                fontWeight: 700, fontFamily: theme.fonts.mono,
                                color: theme.colors.text, fontSize: 14,
                              }}>{alloc}%</span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                fontWeight: 600, fontFamily: theme.fonts.mono, fontSize: 13,
                                color: theme.colors.text,
                              }}>{s.userComposite}</span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                padding: '3px 8px', borderRadius: 4, fontSize: 11,
                                fontWeight: 600, letterSpacing: '0.03em',
                                color: s.userTierColor,
                                background: `${s.userTierColor}18`,
                                border: `1px solid ${s.userTierColor}40`,
                              }}>{s.userTier}</span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Compact risk slider */}
            <div style={{
              borderTop: `1px solid ${theme.colors.border}`,
              paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Risk Setting
                </span>
                <span style={{
                  fontSize: 18, fontWeight: 700, color: theme.colors.accentBlue,
                  fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums',
                }}>{risk.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1} max={7} step={0.1}
                value={risk}
                onChange={(e) => handleRiskChange(Math.round(Number(e.target.value) * 10) / 10)}
                style={{
                  width: '100%', height: 4,
                  appearance: 'none', WebkitAppearance: 'none',
                  background: `linear-gradient(to right, ${theme.colors.accentBlue} 0%, ${theme.colors.accentBlue} ${((risk - 1) / 6) * 100}%, ${theme.colors.border} ${((risk - 1) / 6) * 100}%, ${theme.colors.border} 100%)`,
                  borderRadius: 2, outline: 'none', cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.colors.textDim }}>
                <span>Very Conservative</span>
                <span>{nearestRiskLabel(risk)}</span>
                <span>Very Aggressive</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BRIEF NARRATIVE (full-width) ═══════════════════════════════════ */}
      {selectedBrief ? (
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.colors.border}` }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: theme.colors.text, margin: '0 0 8px' }}>
              {selectedBrief.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: theme.colors.textDim }}>
              <span>{fmtDateTime(selectedBrief.generated_at)}</span>
              <StatusBadge status={selectedBrief.status} />
            </div>
          </div>
          <div style={{ padding: '24px', fontFamily: theme.fonts.body }}>
            {selectedBrief.content_md ? (
              <BriefBody contentMd={selectedBrief.content_md} />
            ) : (
              <p style={{ color: theme.colors.textDim, fontStyle: 'italic', margin: 0 }}>
                Brief content not available.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, padding: '48px 32px', textAlign: 'center',
        }}>
          <p style={{ color: theme.colors.textDim, margin: 0 }}>
            Select a Brief from history to view it.
          </p>
        </div>
      )}

      {/* ═══ BRIEF HISTORY (rows at bottom) ═════════════════════════════════ */}
      {briefs.length > 0 && (
        <div style={{
          background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg, overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 24px', borderBottom: `1px solid ${theme.colors.border}`,
            fontSize: '12px', fontWeight: 600, color: theme.colors.textDim,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Brief History ({briefs.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                {['Title', 'Generated', 'Status', ''].map((h, idx) => (
                  <th key={idx} style={{
                    padding: '8px 24px', textAlign: 'left',
                    fontWeight: 600, color: theme.colors.textDim, fontSize: 11,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {briefs.map((b, i) => {
                const isActive = selectedBrief?.id === b.id;
                return (
                  <tr
                    key={b.id}
                    onClick={() => handleSelectBrief(b.id)}
                    style={{
                      cursor: 'pointer',
                      background: isActive ? theme.colors.surfaceHover : 'transparent',
                      borderBottom: i < briefs.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = theme.colors.surfaceHover; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{
                      padding: '12px 24px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? theme.colors.text : theme.colors.textMuted,
                    }}>{b.title}</td>
                    <td style={{
                      padding: '12px 24px',
                      fontSize: '12px', color: theme.colors.textDim, fontFamily: theme.fonts.mono,
                    }}>{fmtDate(b.generated_at)}</td>
                    <td style={{ padding: '12px 24px' }}>
                      <StatusBadge status={b.status} />
                    </td>
                    <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                      {isActive && (
                        <span style={{ fontSize: 11, color: theme.colors.accentBlue, fontWeight: 600 }}>
                          VIEWING
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const spinnerStyle: React.CSSProperties = {
  width: '32px', height: '32px',
  border: `3px solid ${theme.colors.border}`,
  borderTopColor: theme.colors.accentBlue,
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto',
};

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 20px', background: disabled ? theme.colors.border : theme.colors.accentBlue,
  border: 'none', borderRadius: theme.radii.md, color: theme.colors.white,
  fontSize: '14px', fontWeight: 500, fontFamily: theme.fonts.body,
  cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.15s ease',
});

const secondaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 20px', background: 'transparent',
  border: `1px solid ${disabled ? theme.colors.border : theme.colors.borderLight}`,
  borderRadius: theme.radii.md,
  color: disabled ? theme.colors.textDim : theme.colors.textMuted,
  fontSize: '14px', fontWeight: 500, fontFamily: theme.fonts.body,
  cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease',
});
