/**
 * FundLens v6 — Setup Wizard
 *
 * Three-step onboarding flow for new users:
 *   1. Select funds — pick which 401(k) funds to track
 *   2. Risk tolerance — conservative / moderate / aggressive
 *   3. Factor weights — adjust the 4 scoring factors (or keep defaults)
 *
 * On completion, calls POST /api/profile/setup and redirects to
 * the main Portfolio view.
 *
 * Session 8 deliverable. Destination: client/src/pages/SetupWizard.tsx
 * References: Master Reference §4 (Scoring Model), §9 (UI).
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchFunds, completeSetup, type Fund } from '../api';
import { theme } from '../theme';

// ─── Types ─────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface Weights {
  costEfficiency: number;
  holdingsQuality: number;
  positioning: number;
  momentum: number;
}

const DEFAULT_WEIGHTS: Weights = {
  costEfficiency: 0.25,
  holdingsQuality: 0.30,
  positioning: 0.25,
  momentum: 0.20,
};

/** Labels for the 1–9 risk tolerance scale */
const RISK_LABELS: Record<number, string> = {
  1: 'Very Conservative',
  2: 'Conservative',
  3: 'Moderately Conservative',
  4: 'Moderate-Low',
  5: 'Moderate',
  6: 'Moderate-High',
  7: 'Moderately Aggressive',
  8: 'Aggressive',
  9: 'Very Aggressive',
};

const RISK_DESCRIPTIONS: Record<number, string> = {
  1: 'Maximum diversification. Include nearly all funds to spread risk as widely as possible.',
  2: 'Broad diversification. Include most above-average funds.',
  3: 'Lean toward safety. Include funds with solid scores, favoring breadth over concentration.',
  4: 'Slightly conservative. Balanced with a tilt toward more fund inclusion.',
  5: 'Balanced approach. Include funds that clearly stand out without over-concentrating.',
  6: 'Slightly aggressive. Balanced with a tilt toward higher-conviction picks.',
  7: 'Lean toward concentration. Favor higher-scoring funds, accept narrower exposure.',
  8: 'Concentrated. Only clearly above-average funds make the cut.',
  9: 'Maximum conviction. Only statistical outliers. Highly concentrated in top scorers.',
};

// ─── Main Component ────────────────────────────────────────────────────────

export function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [risk, setRisk] = useState<number>(5);
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load available funds
  useEffect(() => {
    fetchFunds().then(({ data, error: err }) => {
      if (data?.funds) {
        setFunds(data.funds);
        // Select all funds by default
        setSelectedIds(data.funds.map(f => f.id));
      }
      if (err) setError(err);
      setLoading(false);
    });
  }, []);

  // Toggle fund selection
  const toggleFund = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  // Factor weight slider handler with proportional redistribution
  const handleWeightChange = useCallback((factor: keyof Weights, newValue: number) => {
    setWeights(prev => {
      const clamped = Math.max(0.05, Math.min(0.85, newValue));
      const others = (Object.keys(prev) as Array<keyof Weights>).filter(k => k !== factor);
      const otherSum = others.reduce((sum, k) => sum + prev[k], 0);
      const remaining = 1.0 - clamped;

      const updated = { ...prev, [factor]: clamped };

      // Proportionally redistribute remaining weight among other factors
      if (otherSum > 0) {
        for (const k of others) {
          updated[k] = Math.max(0.05, (prev[k] / otherSum) * remaining);
        }
      } else {
        // Edge case: all others are 0 — split evenly
        for (const k of others) {
          updated[k] = remaining / others.length;
        }
      }

      // Normalize to exactly 1.0
      const total = Object.values(updated).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 1.0) > 0.001) {
        const scale = 1.0 / total;
        for (const k of Object.keys(updated) as Array<keyof Weights>) {
          updated[k] = updated[k] * scale;
        }
      }

      return updated;
    });
  }, []);

  // Submit wizard
  const handleComplete = async () => {
    if (selectedIds.length === 0) {
      setError('Select at least one fund');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error: err } = await completeSetup({
      weights,
      riskTolerance: risk,
      selectedFundIds: selectedIds,
    });

    if (err) {
      setError(err);
      setSubmitting(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  if (loading) {
    return (
      <WizardShell>
        <p style={{ color: theme.colors.textMuted }}>Loading funds...</p>
      </WizardShell>
    );
  }

  return (
    <WizardShell>
      {/* Progress indicator */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '32px',
      }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            background: s <= step ? theme.colors.accentBlue : theme.colors.border,
            transition: 'background 0.2s',
          }} />
        ))}
      </div>

      {/* Step 1: Fund Selection */}
      {step === 1 && (
        <div>
          <h2 style={headingStyle}>Select your funds</h2>
          <p style={subStyle}>
            Choose which 401(k) funds you want FundLens to score and track.
            You can change this later.
          </p>

          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
          }}>
            <button
              onClick={() => setSelectedIds(funds.map(f => f.id))}
              style={chipButton}
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedIds([])}
              style={chipButton}
            >
              Clear
            </button>
          </div>

          <div style={{
            maxHeight: '360px',
            overflowY: 'auto',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
          }}>
            {funds.map(fund => {
              const selected = selectedIds.includes(fund.id);
              return (
                <button
                  key={fund.id}
                  onClick={() => toggleFund(fund.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '12px 16px',
                    background: selected ? `${theme.colors.accentBlue}12` : 'transparent',
                    border: 'none',
                    borderBottom: `1px solid ${theme.colors.border}`,
                    color: theme.colors.text,
                    fontSize: '14px',
                    fontFamily: theme.fonts.body,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: `2px solid ${selected ? theme.colors.accentBlue : theme.colors.border}`,
                    background: selected ? theme.colors.accentBlue : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: '#fff',
                    flexShrink: 0,
                  }}>
                    {selected && '✓'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{fund.ticker}</div>
                    <div style={{
                      fontSize: '12px',
                      color: theme.colors.textMuted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {fund.name}
                    </div>
                  </div>
                  {fund.expense_ratio !== null && (
                    <span style={{
                      fontSize: '12px',
                      color: theme.colors.textDim,
                      fontFamily: theme.fonts.mono,
                    }}>
                      {(fund.expense_ratio * 100).toFixed(2)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p style={{
            fontSize: '13px',
            color: theme.colors.textMuted,
            marginTop: '12px',
          }}>
            {selectedIds.length} of {funds.length} funds selected
          </p>
        </div>
      )}

      {/* Step 2: Risk Tolerance */}
      {step === 2 && (
        <div>
          <h2 style={headingStyle}>Set your risk tolerance</h2>
          <p style={subStyle}>
            This controls how many funds make the cut for your allocation.
            Higher risk means fewer, higher-conviction picks.
          </p>

          <div style={{ marginTop: '32px' }}>
            {/* Current value display */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                fontSize: '48px',
                fontWeight: 700,
                color: theme.colors.accentBlue,
                fontFamily: theme.fonts.mono,
                lineHeight: 1,
              }}>
                {risk}
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                color: theme.colors.text,
                marginTop: '8px',
              }}>
                {RISK_LABELS[risk]}
              </div>
              <div style={{
                fontSize: '13px',
                color: theme.colors.textMuted,
                marginTop: '6px',
                lineHeight: 1.5,
                maxWidth: '380px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}>
                {RISK_DESCRIPTIONS[risk]}
              </div>
            </div>

            {/* Slider */}
            <div style={{ padding: '0 8px' }}>
              <input
                type="range"
                min={1}
                max={9}
                step={1}
                value={risk}
                onChange={(e) => setRisk(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '6px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: `linear-gradient(to right, ${theme.colors.accentBlue} 0%, ${theme.colors.accentBlue} ${(risk - 1) / 8 * 100}%, ${theme.colors.border} ${(risk - 1) / 8 * 100}%, ${theme.colors.border} 100%)`,
                  borderRadius: '3px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              />
              {/* Scale labels */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '8px',
                fontSize: '11px',
                color: theme.colors.textDim,
                fontFamily: theme.fonts.mono,
              }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <span key={n} style={{
                    color: n === risk ? theme.colors.accentBlue : theme.colors.textDim,
                    fontWeight: n === risk ? 700 : 400,
                  }}>
                    {n}
                  </span>
                ))}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '4px',
                fontSize: '11px',
                color: theme.colors.textDim,
              }}>
                <span>Conservative</span>
                <span>Aggressive</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Factor Weights */}
      {step === 3 && (
        <div>
          <h2 style={headingStyle}>Adjust factor weights</h2>
          <p style={subStyle}>
            These control how much each factor contributes to a fund&apos;s overall score.
            Drag the sliders to match what matters most to you. The defaults work well for most people.
          </p>

          <div style={{ marginTop: '24px' }}>
            {([
              { key: 'costEfficiency' as keyof Weights, label: 'Cost Efficiency', desc: 'Expense ratio relative to category' },
              { key: 'holdingsQuality' as keyof Weights, label: 'Holdings Quality', desc: 'Financial health of underlying companies' },
              { key: 'positioning' as keyof Weights, label: 'Positioning', desc: 'Sector alignment with macro thesis' },
              { key: 'momentum' as keyof Weights, label: 'Momentum', desc: 'Recent price performance trends' },
            ]).map(factor => (
              <div key={factor.key} style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '6px',
                }}>
                  <div>
                    <span style={{ fontWeight: 500, fontSize: '14px' }}>{factor.label}</span>
                    <span style={{
                      fontSize: '12px',
                      color: theme.colors.textDim,
                      marginLeft: '8px',
                    }}>
                      {factor.desc}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: '14px',
                    fontWeight: 500,
                    color: theme.colors.accentBlue,
                    minWidth: '40px',
                    textAlign: 'right',
                  }}>
                    {(weights[factor.key] * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={85}
                  value={Math.round(weights[factor.key] * 100)}
                  onChange={(e) => handleWeightChange(factor.key, parseInt(e.target.value) / 100)}
                  style={{
                    width: '100%',
                    accentColor: theme.colors.accentBlue,
                  }}
                />
              </div>
            ))}

            <button
              onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
              style={{
                ...chipButton,
                marginTop: '8px',
              }}
            >
              Reset to defaults (25 / 30 / 25 / 20)
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: theme.colors.error, fontSize: '13px', marginTop: '12px' }}>
          {error}
        </p>
      )}

      {/* Navigation buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '32px',
        gap: '12px',
      }}>
        {step > 1 ? (
          <button
            onClick={() => setStep((step - 1) as Step)}
            style={{
              ...primaryButton,
              background: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.textMuted,
            }}
          >
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <button
            onClick={() => setStep((step + 1) as Step)}
            disabled={step === 1 && selectedIds.length === 0}
            style={{
              ...primaryButton,
              opacity: (step === 1 && selectedIds.length === 0) ? 0.5 : 1,
            }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={submitting}
            style={{
              ...primaryButton,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Start using FundLens'}
          </button>
        )}
      </div>
    </WizardShell>
  );
}

// ─── Wizard Shell ──────────────────────────────────────────────────────────

function WizardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.colors.bg,
      fontFamily: theme.fonts.body,
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.xl,
        padding: '40px',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  color: theme.colors.text,
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 8px',
};

const subStyle: React.CSSProperties = {
  color: theme.colors.textMuted,
  fontSize: '14px',
  lineHeight: 1.5,
  margin: '0 0 8px',
};

const chipButton: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.sm,
  color: theme.colors.textMuted,
  fontSize: '12px',
  fontFamily: theme.fonts.body,
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  padding: '10px 24px',
  background: theme.colors.accentBlue,
  border: 'none',
  borderRadius: theme.radii.md,
  color: '#fff',
  fontSize: '14px',
  fontWeight: 500,
  fontFamily: theme.fonts.body,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
};
