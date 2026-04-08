/**
 * FundLens v6 — Help Chat Panel
 *
 * Slide-up chat panel anchored to a floating "?" button in the
 * bottom-right corner. Sends messages to the Help Agent backend
 * (POST /api/help/chat) and renders the conversation.
 *
 * Project-agnostic — the agent's personality and knowledge are
 * defined entirely by the admin's prompt file on the server.
 *
 * Session 12 deliverable. Destination: client/src/components/HelpChat.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { helpChat, type HelpMessage } from '../api';
import { theme } from '../theme';

// ─── Component ──────────────────────────────────────────────────────────────

export function HelpChat() {
  const [isOpen, setIsOpen] = useState(false);
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

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: HelpMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
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

  // ─── Floating button (always visible) ────────────────────────────────────

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open help chat"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 200,
          width: 48, height: 48, borderRadius: '50%',
          background: '#3b82f6', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          color: '#fff', fontSize: 22, fontWeight: 700,
          fontFamily: theme.fonts.body, lineHeight: 1,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.4)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
        }}
      >
        ?
      </button>
    );
  }

  // ─── Chat panel ──────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      width: 380, maxWidth: 'calc(100vw - 32px)',
      height: 520, maxHeight: 'calc(100vh - 100px)',
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
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
          Help
        </span>
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close help chat"
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
            Ask me anything about how the app works, what the numbers mean, or
            how to get the most out of your analysis.
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
