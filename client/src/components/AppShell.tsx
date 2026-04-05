/**
 * FundLens v6 — App Shell (Responsive)
 *
 * Main layout wrapper with sidebar navigation. All authenticated pages
 * render inside this shell. Dark theme, Inter font, no light mode.
 *
 * Responsive breakpoints:
 *   - < 768px:  bottom tab bar (3 icons), no sidebar
 *   - 768–1024: collapsed sidebar (64px icon-only)
 *   - > 1024:   expanded sidebar (240px, full labels)
 *
 * Navigation:
 *   - Portfolio ◉ (default view)
 *   - Investment Brief ◈
 *   - Pipeline ◎
 *
 * Session 8 deliverable, updated Session 11 (responsive layout).
 * Destination: client/src/components/AppShell.tsx
 * References: Master Reference §9 (UI).
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';

type LayoutMode = 'mobile' | 'tablet' | 'desktop';

function getLayoutMode(): LayoutMode {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(getLayoutMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleResize = useCallback(() => {
    setLayoutMode(getLayoutMode());
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // On tablet, sidebar is always icon-only; on desktop, user can toggle
  const isCollapsed = layoutMode === 'tablet' ? true : sidebarCollapsed;
  const sidebarWidth = isCollapsed ? '64px' : '240px';
  const isMobile = layoutMode === 'mobile';
  const mainPadding = isMobile ? '16px' : '32px';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      minHeight: '100vh',
      background: theme.colors.bg,
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
    }}>
      {/* ─── Sidebar (tablet + desktop only) ───────────────────── */}
      {!isMobile && (
        <nav style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          borderRight: `1px solid ${theme.colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease, min-width 0.2s ease',
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
            {!isCollapsed && (
              <span style={{ fontWeight: 600, fontSize: '16px', whiteSpace: 'nowrap' }}>
                FundLens
              </span>
            )}
          </div>

          {/* Nav Links */}
          <div style={{ padding: '12px 8px', flex: 1 }}>
            <SidebarNavItem to="/" icon="◉" label="Portfolio" collapsed={isCollapsed} />
            <SidebarNavItem to="/briefs" icon="◈" label="Investment Brief" collapsed={isCollapsed} />
            <SidebarNavItem to="/pipeline" icon="◎" label="Pipeline" collapsed={isCollapsed} />
          </div>

          {/* Bottom: collapse toggle + user */}
          <div style={{
            padding: '12px 8px',
            borderTop: `1px solid ${theme.colors.border}`,
          }}>
            {/* Only show collapse toggle on desktop (tablet is always collapsed) */}
            {layoutMode === 'desktop' && (
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{
                  ...navButtonBase,
                  marginBottom: '8px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                }}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>
                  {isCollapsed ? '▸' : '◂'}
                </span>
                {!isCollapsed && <span>Collapse</span>}
              </button>
            )}

            <button
              onClick={signOut}
              style={{
                ...navButtonBase,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
              }}
              title="Sign out"
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⏻</span>
              {!isCollapsed && (
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {user?.email?.split('@')[0] ?? 'Sign out'}
                </span>
              )}
            </button>
          </div>
        </nav>
      )}

      {/* ─── Main Content ────────────────────────────────────── */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: mainPadding,
        paddingBottom: isMobile ? '72px' : mainPadding,
      }}>
        <Outlet />
      </main>

      {/* ─── Mobile Bottom Tab Bar ─────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '56px',
          background: theme.colors.surface,
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
        }}>
          <MobileTabItem to="/" icon="◉" label="Portfolio" />
          <MobileTabItem to="/briefs" icon="◈" label="Brief" />
          <MobileTabItem to="/pipeline" icon="◎" label="Pipeline" />
        </nav>
      )}
    </div>
  );
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

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

// ─── Sidebar Nav Item (tablet + desktop) ──────────────────────────────────────

function SidebarNavItem({ to, icon, label, collapsed }: {
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

// ─── Mobile Tab Item ──────────────────────────────────────────────────────────

function MobileTabItem({ to, icon, label }: {
  to: string;
  icon: string;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flex: 1,
        height: '100%',
        textDecoration: 'none',
        color: isActive ? theme.colors.accentBlue : theme.colors.textMuted,
        transition: 'color 0.15s',
      })}
    >
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <span style={{ fontSize: '10px', fontWeight: 500 }}>{label}</span>
    </NavLink>
  );
}
