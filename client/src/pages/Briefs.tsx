/**
 * FundLens v6 — Investment Brief Page
 *
 * Displays the user's personalized Investment Brief with history.
 * Supports on-demand Brief generation (calls Claude Opus via server).
 *
 * Features:
 *   - Latest Brief rendered as styled HTML (from markdown)
 *   - Brief history sidebar — all past Briefs, click to view
 *   - "Generate Brief" and "Generate & Email" buttons
 *   - Loading/generating states
 *   - Empty state when no Briefs exist
 *
 * Session 10 deliverable. Destination: client/src/pages/Briefs.tsx
 */

import { useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  fetchBriefs,
  fetchBrief,
  generateBrief,
  type Brief,
} from '../api';
import { theme } from '../theme';

// ─── Markdown → HTML Renderer ──────────────────────────────────────────────

/**
 * Converts simple markdown to styled HTML. Handles: headings (h1-h3),
 * bold, italic, unordered/ordered lists, paragraphs, horizontal rules.
 * No external library needed — Brief markdown is straightforward.
 */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const htmlParts: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { htmlParts.push('</ul>'); inUl = false; }
    if (inOl) { htmlParts.push('</ol>'); inOl = false; }
  };

  /** Escape HTML entities BEFORE any markdown-to-HTML conversion */
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const inlineFormat = (text: string): string => {
    // Escape HTML first, then apply markdown formatting
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${theme.colors.text};font-weight:600">$1</strong>`)
      .replace(/\*(.+?)\*/g, `<em>$1</em>`)
      .replace(/`(.+?)`/g, `<code style="font-family:${theme.fonts.mono};font-size:13px;background:${theme.colors.surface};padding:2px 6px;border-radius:4px">$1</code>`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      htmlParts.push(`<hr style="border:none;border-top:1px solid ${theme.colors.border};margin:24px 0" />`);
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    if (h3) {
      closeList();
      htmlParts.push(`<h3 style="font-family:${theme.fonts.serif};font-size:16px;font-weight:600;color:${theme.colors.text};margin:28px 0 12px;line-height:1.4">${inlineFormat(h3[1] ?? '')}</h3>`);
      continue;
    }
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      closeList();
      htmlParts.push(`<h2 style="font-family:${theme.fonts.serif};font-size:18px;font-weight:700;color:${theme.colors.text};margin:32px 0 12px;line-height:1.4">${inlineFormat(h2[1] ?? '')}</h2>`);
      continue;
    }
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      closeList();
      htmlParts.push(`<h1 style="font-family:${theme.fonts.serif};font-size:22px;font-weight:700;color:${theme.colors.text};margin:32px 0 16px;line-height:1.3">${inlineFormat(h1[1] ?? '')}</h1>`);
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*] (.+)/);
    if (ul) {
      if (inOl) { htmlParts.push('</ol>'); inOl = false; }
      if (!inUl) { htmlParts.push(`<ul style="margin:8px 0;padding-left:24px;color:${theme.colors.textMuted};line-height:1.8">`); inUl = true; }
      htmlParts.push(`<li>${inlineFormat(ul[1] ?? '')}</li>`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+\. (.+)/);
    if (ol) {
      if (inUl) { htmlParts.push('</ul>'); inUl = false; }
      if (!inOl) { htmlParts.push(`<ol style="margin:8px 0;padding-left:24px;color:${theme.colors.textMuted};line-height:1.8">`); inOl = true; }
      htmlParts.push(`<li>${inlineFormat(ol[1] ?? '')}</li>`);
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Paragraph
    closeList();
    htmlParts.push(`<p style="margin:0 0 16px;color:${theme.colors.textMuted};line-height:1.7;font-size:14px">${inlineFormat(line)}</p>`);
  }

  closeList();
  // Sanitize final HTML output to prevent XSS from any source
  return DOMPurify.sanitize(htmlParts.join('\n'), {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'hr'],
    ALLOWED_ATTR: ['style'],
  });
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Brief['status'] }) {
  const colorMap: Record<string, string> = {
    generated: theme.colors.success,
    sent: theme.colors.accentBlue,
    failed: theme.colors.error,
  };
  const color = colorMap[status] ?? theme.colors.textDim;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: theme.radii.sm,
      fontSize: '11px',
      fontWeight: 600,
      fontFamily: theme.fonts.mono,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color,
      background: `${color}18`,
    }}>
      {status}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function Briefs() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState('');
  const [genError, setGenError] = useState('');

  // ── Load all briefs ────────────────────────────────────────────────────
  const loadBriefs = useCallback(async () => {
    const { data, error } = await fetchBriefs();
    if (data && !error) {
      setBriefs(data.briefs);
      // Auto-select the latest brief
      if (data.briefs.length > 0) {
        const latest = data.briefs[0];
        if (latest) {
          setSelectedBrief(latest);
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  // ── Select a specific brief ────────────────────────────────────────────
  const handleSelectBrief = async (id: string) => {
    const { data, error } = await fetchBrief(id);
    if (data && !error) {
      setSelectedBrief(data.brief);
    }
  };

  // ── Generate brief ─────────────────────────────────────────────────────
  const handleGenerate = async (sendEmail: boolean) => {
    setGenerating(true);
    setGenMessage('');
    setGenError('');

    const { data, error } = await generateBrief(sendEmail);

    if (error) {
      setGenError(error);
    } else {
      setGenMessage(data?.message ?? 'Brief generation started');
      // Reload briefs after a short delay (generation is async on server)
      setTimeout(() => {
        loadBriefs();
      }, 3000);
    }
    setGenerating(false);
  };

  // ── Format date ────────────────────────────────────────────────────────
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
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
          <div style={spinnerStyle} />
          <p style={{ color: theme.colors.textMuted, margin: '16px 0 0' }}>Loading briefs...</p>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (briefs.length === 0 && !generating) {
    return (
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
          Investment Brief
        </h1>
        <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: '0 0 24px' }}>
          Your personalized research document, written by Claude Opus.
        </p>

        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '48px 32px',
          textAlign: 'center',
        }}>
          {/* Empty icon */}
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: '16px' }}>
            <rect x="8" y="4" width="32" height="40" rx="4" stroke={theme.colors.border} strokeWidth="2" fill="none" />
            <line x1="14" y1="16" x2="34" y2="16" stroke={theme.colors.border} strokeWidth="2" />
            <line x1="14" y1="22" x2="34" y2="22" stroke={theme.colors.border} strokeWidth="2" />
            <line x1="14" y1="28" x2="26" y2="28" stroke={theme.colors.border} strokeWidth="2" />
          </svg>
          <p style={{ fontFamily: theme.fonts.serif, color: theme.colors.text, margin: '0 0 8px', fontSize: '17px', fontWeight: 700 }}>
            Run Analysis to generate your first Investment Brief
          </p>
          <p style={{ color: theme.colors.textDim, margin: '0 0 24px', fontSize: '13px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            Your personalized research document, written by Claude Opus. Covers fund recommendations, market narrative, risks, and sector outlook.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              style={primaryButtonStyle(generating)}
            >
              {generating ? 'Generating...' : 'Generate Brief'}
            </button>
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              style={secondaryButtonStyle(generating)}
            >
              Generate & Email
            </button>
          </div>

          {genError && (
            <p style={{ color: theme.colors.error, fontSize: '13px', marginTop: '12px' }}>{genError}</p>
          )}
          {genMessage && (
            <p style={{ color: theme.colors.success, fontSize: '13px', marginTop: '12px' }}>{genMessage}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Main view (brief selected) ─────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px', color: theme.colors.text }}>
            Investment Brief
          </h1>
          <p style={{ fontSize: '14px', color: theme.colors.textMuted, margin: 0 }}>
            Your personalized research document, written by Claude Opus.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button
            onClick={() => handleGenerate(false)}
            disabled={generating}
            style={primaryButtonStyle(generating)}
          >
            {generating ? 'Generating...' : 'Generate Brief'}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating}
            style={secondaryButtonStyle(generating)}
          >
            Generate & Email
          </button>
        </div>
      </div>

      {/* Feedback messages */}
      {genError && (
        <div style={{
          background: `${theme.colors.error}15`,
          border: `1px solid ${theme.colors.error}40`,
          borderRadius: theme.radii.md,
          padding: '10px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.colors.error,
        }}>
          {genError}
        </div>
      )}
      {genMessage && (
        <div style={{
          background: `${theme.colors.success}15`,
          border: `1px solid ${theme.colors.success}40`,
          borderRadius: theme.radii.md,
          padding: '10px 16px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.colors.success,
        }}>
          {genMessage}
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: '48px 32px',
          textAlign: 'center',
          marginBottom: '16px',
        }}>
          <div style={spinnerStyle} />
          <p style={{ color: theme.colors.text, margin: '16px 0 4px', fontWeight: 500, fontSize: '15px' }}>
            Generating your Investment Brief...
          </p>
          <p style={{ color: theme.colors.textDim, margin: 0, fontSize: '13px' }}>
            Claude Opus is analyzing your portfolio. This may take 30–60 seconds.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* History sidebar */}
        <div style={{
          width: '240px',
          flexShrink: 0,
        }}>
          <div style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.lg,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.colors.border}`,
              fontSize: '12px',
              fontWeight: 600,
              color: theme.colors.textDim,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              History ({briefs.length})
            </div>
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {briefs.map((b) => {
                const isActive = selectedBrief?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBrief(b.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 16px',
                      background: isActive ? theme.colors.surfaceHover : 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: theme.fonts.body,
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = theme.colors.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? theme.colors.text : theme.colors.textMuted,
                      marginBottom: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {b.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11px',
                        color: theme.colors.textDim,
                        fontFamily: theme.fonts.mono,
                      }}>
                        {fmtDate(b.generated_at)}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Brief content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedBrief ? (
            <div style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg,
              overflow: 'hidden',
            }}>
              {/* Brief header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: theme.colors.text,
                  margin: '0 0 8px',
                }}>
                  {selectedBrief.title}
                </h2>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  fontSize: '12px',
                  color: theme.colors.textDim,
                }}>
                  <span>{fmtDateTime(selectedBrief.generated_at)}</span>
                  <span style={{ fontFamily: theme.fonts.mono }}>
                    {selectedBrief.model_used}
                  </span>
                  <StatusBadge status={selectedBrief.status} />
                </div>
              </div>

              {/* Brief body */}
              <div style={{
                padding: '24px',
                fontFamily: theme.fonts.body,
              }}>
                {selectedBrief.content_md ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(selectedBrief.content_md),
                    }}
                  />
                ) : (
                  <p style={{
                    color: theme.colors.textDim,
                    fontStyle: 'italic',
                    margin: 0,
                  }}>
                    Brief content not available.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.lg,
              padding: '48px 32px',
              textAlign: 'center',
            }}>
              <p style={{ color: theme.colors.textDim, margin: 0 }}>
                Select a Brief from the history to view it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────

const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: `3px solid ${theme.colors.border}`,
  borderTopColor: theme.colors.accentBlue,
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto',
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  background: disabled ? theme.colors.border : theme.colors.accentBlue,
  border: 'none',
  borderRadius: theme.radii.md,
  color: theme.colors.white,
  fontSize: '14px',
  fontWeight: 500,
  fontFamily: theme.fonts.body,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s ease',
});

const secondaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '10px 20px',
  background: 'transparent',
  border: `1px solid ${disabled ? theme.colors.border : theme.colors.borderLight}`,
  borderRadius: theme.radii.md,
  color: disabled ? theme.colors.textDim : theme.colors.textMuted,
  fontSize: '14px',
  fontWeight: 500,
  fontFamily: theme.fonts.body,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s ease',
});
