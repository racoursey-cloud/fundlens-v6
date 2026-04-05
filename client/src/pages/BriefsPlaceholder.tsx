/**
 * FundLens v6 — Briefs Placeholder
 *
 * Placeholder for the Investment Brief tab. Full implementation
 * comes in Session 10.
 *
 * Session 8 deliverable. Destination: client/src/pages/BriefsPlaceholder.tsx
 */

import { theme } from '../theme';

export function BriefsPlaceholder() {
  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
        Investment Brief
      </h1>
      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        padding: '48px 32px',
        textAlign: 'center',
        marginTop: '24px',
      }}>
        <p style={{ color: theme.colors.textMuted, margin: 0 }}>
          Your personalized Investment Brief will appear here once the pipeline
          has run and scored your funds. Coming in Session 10.
        </p>
      </div>
    </div>
  );
}
