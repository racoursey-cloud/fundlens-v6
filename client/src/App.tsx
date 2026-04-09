/**
 * FundLens v6 — App Router
 *
 * Top-level component that wires together:
 *   - ErrorBoundary (catches render errors with fallback UI)
 *   - AuthProvider (session management)
 *   - React Router (page navigation)
 *   - ProtectedRoute (auth guard)
 *   - AppShell (sidebar layout)
 *
 * Route structure:
 *   /login            — public, magic link auth
 *   /auth/callback    — Supabase redirect handler
 *   /setup            — protected, setup wizard
 *   /                 — protected, Portfolio (default)
 *   /thesis           — protected, Macro Thesis + Sector Scorecard
 *   /briefs           — protected, Investment Brief
 *   /settings         — protected, Settings
 *   /pipeline         — protected, Pipeline status (admin)
 *
 * Updated Session 11: added Thesis and Settings routes, moved Pipeline
 * out of primary navigation.
 *
 * Destination: client/src/App.tsx
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { SetupWizard } from './pages/SetupWizard';
import { AuthCallback } from './pages/AuthCallback';
import { YourBrief } from './pages/YourBrief';
import { Research } from './pages/Research';
import { Settings } from './pages/Settings';
import { Pipeline } from './pages/Pipeline';
import { Help } from './pages/Help';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Setup wizard (protected, but outside AppShell) */}
            <Route path="/setup" element={
              <ProtectedRoute>
                <SetupWizard />
              </ProtectedRoute>
            } />

            {/* Main app (protected, inside AppShell) */}
            <Route element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }>
              <Route index element={<YourBrief />} />
              <Route path="/research" element={<Research />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
              <Route path="/pipeline" element={<Pipeline />} />
              {/* Redirects for old bookmarked URLs */}
              <Route path="/thesis" element={<Navigate to="/research" replace />} />
              <Route path="/briefs" element={<Navigate to="/" replace />} />
            </Route>

            {/* Catch-all → redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
