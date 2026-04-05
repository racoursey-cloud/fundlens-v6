/**
 * FundLens v6 — App Shell
 *
 * Main layout wrapper with sidebar navigation. All authenticated pages
 * render inside this shell. Dark theme, Inter font, no light mode.
 *
 * Navigation:
 *   - Portfolio (default view — Sessions 9-10)
 *   - Investment Brief (Session 10)
 *   - Pipeline Status (Session 10)
 *
 * Session 8 deliverable. Destination: client/src/components/AppShell.tsx
 * References: Master Reference §9 (UI).
 */

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

export function AppShell() {
  const { user, signOut } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = sidebarCollapsed ? '64px' : '240px';

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: theme.colors.bg,
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
    }}>
      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <nav style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        borderRight: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Logo / Brand */}
        <div style={{
          padding: '20px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: theme.radii.md,
            background: theme.colors.accentBlue,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '14px',
            color: '#fff',
            flexShrink: 0,
          }}>
            FL
          </div>
          {!sidebarCollapsed && (
            <span style={{ fontWeight: 600, fontSize: '16px', whiteSpace: 'nowrap' }}>
              FundLens
            </span>
          )}
        </div>

        {/* Nav Links */}
        <div style={{ padding: '12px 8px', flex: 1 }}>
          <NavItem to="/" icon="◉" label="Portfolio" collapsed={sidebarCollapsed} />
          <NavItem to="/briefs" icon="◈" label="Investment Brief" collapsed={sidebarCollapsed} />
          <NavItem to="/pipeline" icon="◎" label="Pipeline" collapsed={sidebarCollapsed} />
        </div>

        {/* Bottom: collapse toggle + user */}
        <div style={{
          padding: '12px 8px',
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              ...navButtonBase,
              marginBottom: '8px',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>
              {sidebarCollapsed ? '▸' : '◂'}
            </span>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>

          <button
            onClick={signOut}
            style={{
              ...navButtonBase,
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}
            title="Sign out"
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⏻</span>
            {!sidebarCollapsed && (
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user?.email?.split('@')[0] || 'Sign out'}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ─── Main Content ────────────────────────────────────── */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '32px',
      }}>
        <Outlet />
      </main>
    </div>
  );
}

// ─── Nav Item Component ────────────────────────────────────────────────────

const navButtonBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '10px 12px',
  border: 'none',
  borderRadius: theme.radii.md,
  background: 'transparent',
  color: theme.colors.textMuted,
  fontSize: '14px',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 0.15s, color 0.15s',
};

function NavItem({ to, icon, label, collapsed }: {
  to: string;
  icon: string;
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        ...navButtonBase,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background: isActive ? theme.colors.surface : 'transparent',
        color: isActive ? theme.colors.text : theme.colors.textMuted,
        fontWeight: isActive ? 500 : 400,
        marginBottom: '4px',
      })}
      title={label}
    >
      <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}
