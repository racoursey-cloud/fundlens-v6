/**
 * FundLens v6 — Client Theme Constants
 *
 * Dark theme — mandatory, never revert to light theme.
 * Mirrors the server-side THEME constants from engine/constants.ts
 * but without importing server code into the client bundle.
 *
 * Session 8 deliverable. Destination: client/src/theme.ts
 */

export const theme = {
  colors: {
    bg: '#0e0f11',
    surface: '#16181c',
    surfaceHover: '#1c1f24',
    border: '#25282e',
    borderLight: '#32363e',
    accentBlue: '#3b82f6',
    accentBlueHover: '#2563eb',
    text: '#e4e4e7',
    textMuted: '#a1a1aa',
    textDim: '#71717a',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    white: '#ffffff',
  },
  fonts: {
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
} as const;

/** CSS custom properties string — injected into :root */
export const cssVars = `
  :root {
    --bg: ${theme.colors.bg};
    --surface: ${theme.colors.surface};
    --surface-hover: ${theme.colors.surfaceHover};
    --border: ${theme.colors.border};
    --border-light: ${theme.colors.borderLight};
    --accent: ${theme.colors.accentBlue};
    --accent-hover: ${theme.colors.accentBlueHover};
    --text: ${theme.colors.text};
    --text-muted: ${theme.colors.textMuted};
    --text-dim: ${theme.colors.textDim};
    --success: ${theme.colors.success};
    --warning: ${theme.colors.warning};
    --error: ${theme.colors.error};
    --font-body: ${theme.fonts.body};
    --font-mono: ${theme.fonts.mono};
    --radius-sm: ${theme.radii.sm};
    --radius-md: ${theme.radii.md};
    --radius-lg: ${theme.radii.lg};
  }
`;
