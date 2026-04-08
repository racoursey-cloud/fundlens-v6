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

      {/* ═══ SECTION 2 — SCORING PREFERENCES (read-only summary) ═══ */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader>Scoring Preferences</SectionHeader>

        {profile && (
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Risk tolerance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: theme.colors.textMuted }}>Risk Tolerance</span>
              <span style={{
                fontSize: 14, fontWeight: 700, color: theme.colors.text,
                fontFamily: theme.fonts.mono,
              }}>
                {profile.risk_tolerance.toFixed(1)} — {nearestRiskLabel(profile.risk_tolerance)}
              </span>
            </div>

            {/* Factor weights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <WeightRow label="Cost Efficiency" value={profile.weight_cost} />
              <WeightRow label="Holdings Quality" value={profile.weight_quality} />
              <WeightRow label="Momentum" value={profile.weight_momentum} />
              <WeightRow label="Positioning" value={profile.weight_positioning} />
            </div>

            <p style={{
              fontSize: 12, color: theme.colors.textDim, margin: 0, lineHeight: 1.5,
            }}>
              Adjust weights and risk from the Portfolio page using the sliders.
            </p>
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

// ─── Weight Row ─────────────────────────────────────────────────────────────

function WeightRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: theme.colors.textMuted }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 80, height: 4, borderRadius: 2,
          background: theme.colors.border, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: theme.colors.accentBlue,
            width: `${Math.round(value * 100)}%`,
            transition: 'width 0.3s',
          }} />
        </div>
        <span style={{
          fontSize: 13, fontFamily: theme.fonts.mono, fontWeight: 600,
          color: theme.colors.text, minWidth: 36, textAlign: 'right',
        }}>
          {Math.round(value * 100)}%
        </span>
      </div>
    </div>
  );
}
