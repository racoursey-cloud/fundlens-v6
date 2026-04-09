/**
 * FundLens v6 — Settings Page
 *
 * Ported from v5.1's SettingsTab.jsx. Sections:
 *   1. Profile — display name, email (read-only)
 *   2. Scoring Preferences — risk tolerance + factor weights (read-only summary)
 *   3. Fund List — ~18 funds in TerrAscend 401(k) menu, enable/disable
 *   4. Pipeline — admin-only pipeline controls (moved from top-level nav)
 *   5. About — version, help link placeholder
 *
 * Session 11 deliverable. Destination: client/src/pages/Settings.tsx
 * References: v5.1 SettingsTab.jsx, Spec §6.4–§6.5
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchProfile,
  fetchFunds,
  updateProfile,
  fetchPipelineStatus,
  triggerPipeline,
  type UserProfile,
  type Fund,
  type PipelineRun,
} from '../api';
import { theme } from '../theme';

// ─── Helpers ────────────────────────────────────────────────────────────────

const RISK_LABELS: Record<number, string> = {
  1: 'Very Conservative',
  2: 'Conservative',
  3: 'Mod. Conservative',
  4: 'Moderate',
  5: 'Mod. Aggressive',
  6: 'Aggressive',
  7: 'Very Aggressive',
};

function nearestRiskLabel(value: number): string {
  const nearest = Math.round(Math.min(7, Math.max(1, value)));
  return RISK_LABELS[nearest] ?? 'Moderate';
}

// ─── Section header (v5.1 pattern) ──────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: theme.colors.textDim,
      margin: '0 0 20px',
    }}>
      {children}
    </h2>
  );
}

function Divider() {
  return <div style={{ height: 1, background: theme.colors.border, margin: '8px 0 32px' }} />;
}

// ─── Card style ─────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.lg,
  padding: '22px 24px',
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function Settings() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Factor weights + risk (interactive sliders)
  const [factorWeights, setFactorWeights] = useState({
    cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25,
  });
  const [riskTolerance, setRiskTolerance] = useState<number>(4.0);

  // Pipeline state
  const [pipelineStatus, setPipelineStatus] = useState<{
    latestRun: PipelineRun | null;
    isRunning: boolean;
  } | null>(null);
  const [pipelineTriggering, setPipelineTriggering] = useState(false);

  useEffect(() => {
    Promise.all([fetchProfile(), fetchFunds(), fetchPipelineStatus()]).then(([pRes, fRes, psRes]) => {
      if (pRes.data?.profile) {
        setProfile(pRes.data.profile);
        setDisplayName(pRes.data.profile.display_name ?? '');
        setFactorWeights({
          cost: pRes.data.profile.weight_cost,
          quality: pRes.data.profile.weight_quality,
          positioning: pRes.data.profile.weight_positioning,
          momentum: pRes.data.profile.weight_momentum,
        });
        setRiskTolerance(pRes.data.profile.risk_tolerance);
      }
      if (fRes.data?.funds) setFunds(fRes.data.funds);
      if (psRes.data) setPipelineStatus(psRes.data);
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Proportional weight redistribution
  const handleWeightChange = useCallback((key: keyof typeof factorWeights, newVal: number) => {
    setFactorWeights(prev => {
      const others = Object.keys(prev).filter(k => k !== key) as Array<keyof typeof prev>;
      const remaining = 1 - newVal;
      const otherSum = others.reduce((s, k) => s + prev[k], 0);
      const next = { ...prev, [key]: newVal };
      if (otherSum > 0) {
        for (const k of others) next[k] = Math.max(0.05, (prev[k] / otherSum) * remaining);
      } else {
        const share = remaining / others.length;
        for (const k of others) next[k] = share;
      }
      const total = Object.values(next).reduce((s, v) => s + v, 0);
      for (const k of Object.keys(next) as Array<keyof typeof next>) next[k] = next[k] / total;
      return next;
    });
  }, []);

  const handleNameBlur = async () => {
    const trimmed = displayName.trim();
    if (trimmed === (profile?.display_name ?? '')) return;
    setNameSaving(true);
    const res = await updateProfile({ display_name: trimmed } as Partial<UserProfile>);
    if (res.data?.profile) setProfile(res.data.profile);
    setNameSaving(false);
    showToast('Display name updated');
  };

  const handleTriggerPipeline = async () => {
    setPipelineTriggering(true);
    const res = await triggerPipeline();
    setPipelineTriggering(false);
    if (res.error) {
      showToast(`Error: ${res.error}`);
    } else {
      showToast('Analysis started');
      // Refresh status
      const psRes = await fetchPipelineStatus();
      if (psRes.data) setPipelineStatus(psRes.data);
    }
  };

  if (loading) {
    return <div style={{ color: theme.colors.textMuted, padding: 32 }}>Loading settings...</div>;
  }

  const inputStyle: React.CSSProperties = {
    background: '#1c1e23',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    color: theme.colors.text,
    fontSize: 13,
    outline: 'none',
    fontFamily: theme.fonts.body,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 0 64px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20,
          background: '#1c1e23', border: `1px solid ${theme.colors.accentBlue}`,
          color: theme.colors.text, padding: '12px 18px', borderRadius: 8,
          zIndex: 9999, fontSize: 13, maxWidth: 320,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {/* ═══ SECTION 1 — PROFILE ═══ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader>Profile</SectionHeader>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 }}>
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Your name"
            style={inputStyle}
          />
          {nameSaving && (
            <div style={{ fontSize: 11, color: theme.colors.textDim, marginTop: 4 }}>Saving...</div>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 }}>
            Email
          </label>
          <div style={{
            background: theme.colors.surface, border: `1px solid ${theme.colors.border}`,
            borderRadius: 6, padding: '8px 12px',
            color: theme.colors.textDim, fontSize: 13,
            fontFamily: theme.fonts.mono,
          }}>
            {user?.email ?? '\u2014'}
          </div>
        </div>

        <button
          onClick={signOut}
          style={{
            padding: '8px 20px', borderRadius: 6,
            border: `1px solid ${theme.colors.border}`,
            background: 'transparent',
            color: theme.colors.textMuted, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = theme.colors.error; e.currentTarget.style.color = theme.colors.error; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = theme.colors.border; e.currentTarget.style.color = theme.colors.textMuted; }}
        >
          Sign Out
        </button>
      </section>

      <Divider />

      {/* ═══ SECTION 2 — SCORING PREFERENCES (interactive sliders) ═══ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader>Scoring Preferences</SectionHeader>

        {profile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Factor weight sliders */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: theme.colors.textDim,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>Factor Weights</div>

              <WeightSlider label="Cost Efficiency" value={factorWeights.cost}
                onChange={(v) => handleWeightChange('cost', v)} />
              <WeightSlider label="Holdings Quality" value={factorWeights.quality}
                onChange={(v) => handleWeightChange('quality', v)} />
              <WeightSlider label="Momentum" value={factorWeights.momentum}
                onChange={(v) => handleWeightChange('momentum', v)} />
              <WeightSlider label="Positioning" value={factorWeights.positioning}
                onChange={(v) => handleWeightChange('positioning', v)} />

              {/* Weight sum indicator */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
                paddingTop: 4, borderTop: `1px solid ${theme.colors.border}`,
              }}>
                <span style={{ fontSize: 11, color: theme.colors.textDim }}>Total:</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, fontFamily: theme.fonts.mono,
                  color: Math.abs(Object.values(factorWeights).reduce((s, v) => s + v, 0) - 1) < 0.02
                    ? theme.colors.success : theme.colors.error,
                }}>
                  {Math.round(Object.values(factorWeights).reduce((s, v) => s + v, 0) * 100)}%
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setFactorWeights({ cost: 0.25, quality: 0.30, positioning: 0.20, momentum: 0.25 });
                    updateProfile({ weight_cost: 0.25, weight_quality: 0.30, weight_positioning: 0.20, weight_momentum: 0.25 });
                    showToast('Weights reset to defaults');
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: 6,
                    border: `1px solid ${theme.colors.border}`, background: 'transparent',
                    color: theme.colors.textMuted, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', flex: 1,
                  }}
                >Reset to Defaults</button>
                <button
                  onClick={() => {
                    updateProfile({
                      weight_cost: factorWeights.cost,
                      weight_quality: factorWeights.quality,
                      weight_positioning: factorWeights.positioning,
                      weight_momentum: factorWeights.momentum,
                    });
                    showToast('Factor weights saved');
                  }}
                  style={{
                    flex: 1, padding: '8px 16px', borderRadius: 6,
                    border: 'none', background: theme.colors.accentBlue,
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >Save Weights</button>
              </div>
            </div>

            {/* Risk tolerance slider */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: theme.colors.textDim,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>Investment Style</div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: theme.colors.text, fontWeight: 600 }}>
                  {nearestRiskLabel(riskTolerance)}
                </span>
                <span style={{
                  fontSize: 24, fontWeight: 700, color: theme.colors.accentBlue,
                  fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums',
                }}>{riskTolerance.toFixed(1)}</span>
              </div>

              <input
                type="range" min={1} max={7} step={0.1}
                value={riskTolerance}
                onChange={(e) => {
                  const val = Math.round(Number(e.target.value) * 10) / 10;
                  setRiskTolerance(val);
                  updateProfile({ risk_tolerance: val });
                }}
                style={{
                  width: '100%', height: 4,
                  appearance: 'none', WebkitAppearance: 'none',
                  background: `linear-gradient(to right, ${theme.colors.accentBlue} 0%, ${theme.colors.accentBlue} ${((riskTolerance - 1) / 6) * 100}%, ${theme.colors.border} ${((riskTolerance - 1) / 6) * 100}%, ${theme.colors.border} 100%)`,
                  borderRadius: 2, outline: 'none', cursor: 'pointer',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.colors.textDim }}>
                <span>Very Conservative</span>
                <span>Very Aggressive</span>
              </div>

              <div style={{
                marginTop: 4, padding: 14, borderRadius: 8,
                background: 'rgba(59,130,246,0.06)', fontSize: 12, lineHeight: 1.6,
                color: theme.colors.textMuted,
              }}>
                <strong style={{ color: theme.colors.text }}>How this works:</strong> Risk tolerance
                controls how aggressively allocation tilts toward top-scoring funds. Affects
                allocation sizing only — scores do not change.
              </div>
            </div>
          </div>
        )}
      </section>

      <Divider />

      {/* ═══ SECTION 3 — FUND LIST ═══ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader>Fund List</SectionHeader>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
          {funds.length} funds in the TerrAscend 401(k) menu.
        </p>

        <div style={{
          ...cardStyle, padding: 0, overflow: 'hidden',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 20px',
            borderBottom: `1px solid ${theme.colors.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.colors.textDim, minWidth: 60 }}>
                Ticker
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.colors.textDim }}>
                Fund Name
              </span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.colors.textDim, flexShrink: 0, marginLeft: 12 }}>
              Expense Ratio
            </span>
          </div>
          {funds.sort((a, b) => a.ticker.localeCompare(b.ticker)).map((fund, i) => (
            <div key={fund.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 20px',
              borderBottom: i < funds.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{
                  fontFamily: theme.fonts.mono, fontWeight: 700,
                  fontSize: 13, color: theme.colors.accentBlue,
                  minWidth: 60,
                }}>
                  {fund.ticker}
                </span>
                <span style={{
                  fontSize: 13, color: theme.colors.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {fund.name}
                </span>
              </div>
              {fund.expense_ratio != null && (
                <span style={{
                  fontSize: 11, fontFamily: theme.fonts.mono,
                  color: theme.colors.textDim, flexShrink: 0, marginLeft: 12,
                }}>
                  {(fund.expense_ratio * 100).toFixed(2)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ═══ SECTION 4 — ANALYSIS (admin) ═══ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader>Analysis</SectionHeader>
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pipelineStatus && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: theme.colors.textMuted }}>Status</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: pipelineStatus.isRunning ? theme.colors.warning : theme.colors.success,
              }}>
                {pipelineStatus.isRunning ? 'Running' : 'Idle'}
              </span>
            </div>
          )}
          {pipelineStatus?.latestRun && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: theme.colors.textMuted }}>Last Run</span>
              <span style={{ fontSize: 12, fontFamily: theme.fonts.mono, color: theme.colors.textDim }}>
                {pipelineStatus.latestRun.completed_at
                  ? new Date(pipelineStatus.latestRun.completed_at).toLocaleString()
                  : 'In progress'}
              </span>
            </div>
          )}
          <button
            onClick={handleTriggerPipeline}
            disabled={pipelineTriggering || pipelineStatus?.isRunning}
            style={{
              marginTop: 4, padding: '10px 16px', borderRadius: 6,
              border: 'none', background: theme.colors.accentBlue,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: pipelineTriggering ? 'wait' : 'pointer',
              opacity: (pipelineTriggering || pipelineStatus?.isRunning) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {pipelineTriggering ? 'Starting…' : 'Refresh Analysis'}
          </button>
        </div>
      </section>

      <Divider />

      {/* ═══ SECTION 5 — ABOUT ═══ */}
      <section>
        <SectionHeader>About</SectionHeader>
        <div style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            FundLens v6 — 401(k) Fund Scoring & Allocation Platform
          </p>
          <p style={{ margin: 0, fontSize: 12, color: theme.colors.textDim }}>
            Help section coming in Session 12.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Weight Slider ──────────────────────────────────────────────────────────

function WeightSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (val: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text }}>{label}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: theme.colors.accentBlue,
          fontFamily: theme.fonts.mono, fontVariantNumeric: 'tabular-nums',
        }}>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={5} max={60} step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: '100%', accentColor: theme.colors.accentBlue }}
      />
    </div>
  );
}
