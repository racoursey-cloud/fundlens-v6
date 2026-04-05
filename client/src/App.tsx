/**
 * FundLens v6 — App Router
 *
 * Top-level component that wires together:
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
 *   /briefs           — protected, Investment Brief
 *   /pipeline         — protected, Pipeline status
 *
 * Updated in Session 10: replaced BriefsPlaceholder and PipelinePlaceholder
 * with full implementations.
 *
 * Destination: client/src/App.tsx
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { SetupWizard } from './pages/SetupWizard';
import { AuthCallback } from './pages/AuthCallback';
import { Portfolio } from './pages/Portfolio';
import { Briefs } from './pages/Briefs';
import { Pipeline } from './pages/Pipeline';

export function App() {
  return (
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
            <Route index element={<Portfolio />} />
            <Route path="/briefs" element={<Briefs />} />
            <Route path="/pipeline" element={<Pipeline />} />
          </Route>

          {/* Catch-all → redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
