/**
 * FundLens v6 — Error Boundary
 *
 * React error boundary that catches rendering errors across the app.
 * Displays a styled fallback UI with the error message, a "Try Again"
 * button (reloads page), and a "Go Home" link.
 *
 * Must be a class component — React error boundaries require
 * componentDidCatch / getDerivedStateFromError.
 *
 * Session 11 deliverable. Destination: client/src/components/ErrorBoundary.tsx
 * References: Master Reference §9 (UI), §16 (Standing Rules).
 */

import React from 'react';
import { theme } from '../theme';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console for debugging — no external error reporting service yet
    console.error('[FundLens ErrorBoundary]', error, errorInfo.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: theme.colors.bg,
        fontFamily: theme.fonts.body,
        padding: '24px',
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '40px 32px',
          textAlign: 'center',
        }}>
          {/* Error icon */}
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: `${theme.colors.error}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '24px',
            color: theme.colors.error,
          }}>
            ✕
          </div>

          <h1 style={{
            color: theme.colors.text,
            fontSize: '20px',
            fontWeight: 600,
            margin: '0 0 8px',
          }}>
            Something went wrong
          </h1>

          <p style={{
            color: theme.colors.textMuted,
            fontSize: '14px',
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}>
            {this.state.errorMessage}
          </p>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
          }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 24px',
                background: theme.colors.accentBlue,
                color: theme.colors.white,
                border: 'none',
                borderRadius: theme.radii.md,
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: theme.fonts.body,
              }}
            >
              Try Again
            </button>

            <button
              onClick={this.handleGoHome}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: theme.colors.textMuted,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radii.md,
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: theme.fonts.body,
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
