/**
 * FundLens v6 — Pipeline Progress Overlay
 *
 * Full-screen blocking overlay shown during pipeline execution.
 * Ported from v5.1's PipelineOverlay.jsx visual design.
 *
 * v6 runs the pipeline server-side, so we don't have per-step callbacks.
 * Instead, shows an animated progress bar and step descriptions as
 * informational context. When the server adds current_step to the DB,
 * this component can poll and show real step-by-step progress.
 *
 * Session 12 deliverable. Destination: client/src/components/PipelineOverlay.tsx
 */

import { useEffect, useState } from 'react';
import { theme } from '../theme';

// ─── Pipeline step labels (informational — matches server pipeline.ts) ──────

// Must match server pipeline.ts progress() calls exactly (steps 1–14)
const PIPELINE_STEPS = [
  'Loading fund list',                   // 1
  'Fetching holdings from EDGAR',        // 2
  'Resolving holdings',                  // 3
  'Fetching company fundamentals',       // 4
  'Classifying holdings by sector',      // 5
  'Scoring holdings quality',            // 6
  'Scoring cost efficiency',             // 7
  'Fetching price data',                 // 8
  'Scoring momentum',                    // 9
  'Fetching news & macro data',          // 10
  'Generating investment brief',         // 11
  'Evaluating sector positioning',       // 12
  'Computing composite scores',          // 13
  'Saving results',                      // 14
];

interface Props {
  isRunning: boolean;
  /** Real step from server polling (null = use simulated) */
  currentStep?: number | null;
  /** Step message from server */
  stepMessage?: string | null;
}

// ─── Step indicator ─────────────────────────────────────────────────────────

function StepDot({ status, index }: { status: 'done' | 'active' | 'pending'; index: number }) {
  if (status === 'done') {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: '#059669',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 12, color: '#fff', fontWeight: 700,
      }}>
        ✓
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        border: '2.5px solid rgba(59,130,246,0.30)',
        borderTopColor: '#3b82f6',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        animation: 'fl-spin 0.75s linear infinite',
      }} />
    );
  }
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%',
      background: '#25282e',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: 11, fontWeight: 700,
      color: '#4b5563', fontFamily: theme.fonts.body,
    }}>
      {index + 1}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PipelineOverlay({ isRunning, currentStep, stepMessage }: Props) {
  // Use real step from server if available, otherwise simulate
  const [simulatedStep, setSimulatedStep] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setSimulatedStep(0);
      return;
    }
    setSimulatedStep(1);
    const interval = setInterval(() => {
      setSimulatedStep(prev => {
        if (prev >= PIPELINE_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning) return null;

  // Prefer real step data from server, fall back to simulated
  const activeStep = currentStep ?? simulatedStep;
  const currentIndex = Math.max(0, activeStep - 1);
  const progressPct = Math.min(95, (activeStep / PIPELINE_STEPS.length) * 100);

  return (
    <>
      <style>{`
        @keyframes fl-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(14,15,17,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}>
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 16, padding: '32px 36px',
          width: '100%', maxWidth: 520,
          boxShadow: '0 24px 64px rgba(0,0,0,0.60)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              border: '2.5px solid rgba(59,130,246,0.25)',
              borderTopColor: '#3b82f6',
              display: 'inline-block',
              animation: 'fl-spin 0.75s linear infinite',
              flexShrink: 0,
            }} />
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              color: '#f9fafb', fontFamily: theme.fonts.body,
              letterSpacing: '-0.01em',
            }}>
              Analyzing Your Funds
            </h2>
          </div>

          {/* Progress bar */}
          <div style={{
            width: '100%', height: 5,
            background: '#25282e', borderRadius: 99,
            overflow: 'hidden', marginBottom: 28,
          }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: '#3b82f6', borderRadius: 99,
              transition: 'width 0.6s ease',
            }} />
          </div>

          {/* Step list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 400, overflowY: 'auto' }}>
            {PIPELINE_STEPS.map((label, i) => {
              let status: 'done' | 'active' | 'pending';
              if (i < currentIndex) status = 'done';
              else if (i === currentIndex) status = 'active';
              else status = 'pending';

              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                  borderBottom: i < PIPELINE_STEPS.length - 1 ? '1px solid #1c1e23' : 'none',
                }}>
                  <StepDot index={i} status={status} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{
                      fontSize: 13, fontFamily: theme.fonts.body,
                      fontWeight: status === 'active' ? 700 : 400,
                      color: status === 'done' ? '#059669'
                           : status === 'active' ? '#f9fafb'
                           : '#6b7280',
                      transition: 'color 0.2s',
                      letterSpacing: '0.005em',
                    }}>
                      {label}
                    </span>
                    {status === 'active' && stepMessage && (
                      <span style={{
                        fontSize: 11, color: '#6b7280',
                        fontFamily: theme.fonts.body, lineHeight: 1.4,
                      }}>
                        {stepMessage}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
