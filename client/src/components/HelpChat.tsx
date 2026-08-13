/**
 * FundLens — Global Chat Modal (Session 12; rehomed by U1-A)
 *
 * The chat surface behind the shell's header icon. U1 ruling 1 retired the
 * full-tier Help PAGE in favour of one global affordance: a small icon,
 * top-right of the shell, opening a modal reachable from every module.
 *
 * What changed in U1-A: this component no longer owns its own trigger. It was
 * a floating "?" button pinned bottom-right that opened a corner panel — and
 * it was mounted by no page, so no account could reach it. The shell now owns
 * the icon and the open/closed state; this file renders the conversation and
 * closes itself on request (backdrop click, Escape, or the × button).
 *
 * Unchanged: the thread, the input, the typing indicator, and the call to
 * POST /api/help/chat. That route is requireAuth + requireFullTier with the
 * standard 20-questions-per-hour limit, and answers from the shared Help chat
 * seat (CLAUDE.HELP_CHAT_MODEL — Opus, CB-S ruling 4). Ruling 1's "no fence"
 * describes exactly that existing arrangement: this is a full/admin surface,
 * so no reference fence applies, and none was added or removed.
 *
 * Destination: client/src/components/HelpChat.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { helpChat, type HelpMessage } from '../api';
import { theme } from '../theme';

// ─── Component ──────────────────────────────────────────────────────────────

export function HelpChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus the input as soon as the modal mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes — standard modal behaviour
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: HelpMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const res = await helpChat(text, messages);

    if (res.data) {
      setMessages(prev => [...prev, { role: 'assistant', content: res.data!.reply }]);
    } else {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't connect. Please try again." },
      ]);
    }
    setIsLoading(false);
  }, [input, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Modal ───────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="FundLens chat"
        style={{
          width: 560, maxWidth: '100%',
          height: 560, maxHeight: 'calc(100vh - 32px)',
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: theme.colors.text,
            fontFamily: theme.fonts.body,
          }}>
            Ask FundLens
          </span>
          <button
            onClick={onClose}
            aria-label="Close chat"
            style={{
              background: 'none', border: 'none', color: theme.colors.textDim,
              cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1,
              fontFamily: theme.fonts.body,
            }}
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto',
            padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {messages.length === 0 && !isLoading && (
            <div style={{
              textAlign: 'center', padding: '32px 16px',
              color: theme.colors.textDim, fontSize: 13,
              lineHeight: 1.6, fontFamily: theme.fonts.body,
            }}>
              Ask about the funds in the plan, what a number means, or how any
              part of the app works.
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '9px 13px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user'
                  ? 'rgba(59,130,246,0.2)'
                  : theme.colors.surfaceAlt,
                border: `1px solid ${msg.role === 'user'
                  ? 'rgba(59,130,246,0.3)'
                  : theme.colors.border}`,
                color: theme.colors.text,
                fontSize: 13, lineHeight: 1.55,
                fontFamily: theme.fonts.body,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 16px',
                borderRadius: '14px 14px 14px 4px',
                background: theme.colors.surfaceAlt,
                border: `1px solid ${theme.colors.border}`,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={dotStyle(0)} />
                <span style={dotStyle(1)} />
                <span style={dotStyle(2)} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 12px',
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex', gap: 8,
          flexShrink: 0,
        }}>
          <style>{`
            @keyframes fl-dot-bounce {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
              30% { transform: translateY(-4px); opacity: 1; }
            }
            .fl-help-input::placeholder {
              color: ${theme.colors.textDim};
            }
            .fl-help-input:focus {
              border-color: #3b82f6;
              outline: none;
            }
          `}</style>
          <input
            ref={inputRef}
            className="fl-help-input"
            type="text"
            placeholder="Ask a question…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            style={{
              flex: 1, height: 38,
              padding: '0 12px',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 10,
              color: theme.colors.text,
              fontSize: 13,
              fontFamily: theme.fonts.body,
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            style={{
              width: 38, height: 38, flexShrink: 0,
              borderRadius: 10, border: 'none',
              background: input.trim() && !isLoading ? '#3b82f6' : theme.colors.surfaceAlt,
              color: input.trim() && !isLoading ? '#fff' : theme.colors.textDim,
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dotStyle(index: number): React.CSSProperties {
  return {
    width: 6, height: 6, borderRadius: '50%',
    background: theme.colors.textDim,
    display: 'inline-block',
    animation: `fl-dot-bounce 1.2s ease-in-out ${index * 0.15}s infinite`,
  };
}
