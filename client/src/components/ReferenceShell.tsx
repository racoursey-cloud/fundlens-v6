/**
 * FundLens — Reference Shell (B3)
 *
 * The layout every reference-tier account lives in: a plain header, three
 * tabs — Funds | My Mix | Help — the routed page, and the disclaimer
 * footer on every page.
 *
 * Deliberately absent (plan §B3): the Refresh Analysis button, the source
 * badge, and all pipeline polling. Reference accounts see facts, not the
 * machinery — this shell makes no /api/pipeline/* calls at all.
 *
 */

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { ReferenceFooter } from './ReferenceFooter';

// ─── Tabs ──────────────────────────────────────────────────────────────────

const TABS = [
  { path: '/', label: 'Funds', end: true },
  { path: '/mymix', label: 'My Mix', end: false },
  { path: '/help', label: 'Help', end: false },
];

// ─── Shell ─────────────────────────────────────────────────────────────────

export function ReferenceShell() {
  const { user, signOut } = useAuth();

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    'User';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.bg,
        fontFamily: theme.fonts.body,
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: theme.radii.md,
              background: theme.colors.accentBlue,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              color: '#fff',
            }}
          >
            FL
          </div>
          <div>
            <span style={{ color: theme.colors.text, fontWeight: 600, fontSize: 16 }}>
              FundLens
            </span>
            <span
              style={{
                marginLeft: 8,
                color: theme.colors.textMuted,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Reference
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: theme.colors.textMuted, fontSize: 13 }}>{displayName}</span>
          <button
            onClick={() => void signOut()}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.md,
              color: theme.colors.textMuted,
              fontSize: 12,
              fontFamily: theme.fonts.body,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <nav
        style={{
          display: 'flex',
          gap: 4,
          padding: '0 24px',
          borderBottom: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
        }}
      >
        {TABS.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            style={({ isActive }) => ({
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              color: isActive ? theme.colors.text : theme.colors.textMuted,
              borderBottom: isActive
                ? `2px solid ${theme.colors.accentBlue}`
                : '2px solid transparent',
              marginBottom: -1,
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Routed page ── */}
      <main style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto' }}>
        <Outlet />
      </main>

      <ReferenceFooter />
    </div>
  );
}
