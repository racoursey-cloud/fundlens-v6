/**
 * FundLens — Reference Help (B3; chat added in B10 c10; Ask moved first
 * in B10-F1 f3, operator direction F1-e)
 *
 * B3's FAQ and glossary stay exactly as ratified, below the chat. The
 * Help chat (ruling 8: AI-driven, grounded, fenced in code) renders
 * first — the full-tier HelpChat interaction pattern (message thread,
 * input, send) restyled inline to the reference shell. The FAQ heading
 * carries one line of furniture text so the seam reads deliberately.
 * Calls POST /api/reference-help/ask only; the legacy /api/help/chat is
 * full-tier-only (B10 c4).
 *
 * Honesty rule on labeling: the "written by AI" our-voice label sits ONLY
 * on generated replies (outcome 'answered'). The standing refusal, trouble
 * copy, and maintenance line are served from code, not composed by the
 * model — labeling them AI-written would be a falsehood, so they render as
 * muted system lines instead.
 *
 * Kill switch: REFERENCE_HELP_AI_ENABLED below mirrors the server flag
 * (src/engine/constants.ts, B10 c3). Flipped false, the chat section is
 * absent and the rendered page is equivalent to B3's FAQ-only state.
 *
 * Content ruling (Robert, B3 Evidence Gate, July 27, 2026): the full-tier
 * FAQ set is CURATED here, not reused verbatim — eight of its ten entries
 * describe scores, sliders, allocations, and Briefs that reference
 * accounts do not have. This page keeps only what applies, reworded
 * factually, and adds the plan's four plain-language glossary entries
 * (expense ratio, diversification, index vs. active, concentration).
 *
 * The accordion visual pattern mirrors pages/Help.tsx.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { askReferenceHelp, type HelpMessage, type ReferenceHelpOutcome } from '../../api';
import { theme } from '../../theme';

// ─── Kill switch (B10 c3 mirror) ───────────────────────────────────────────
// Mirrors REFERENCE_HELP_AI_ENABLED in src/engine/constants.ts — the client
// cannot import server code (B4 mirror pattern). Both flags flip together,
// by Robert's deliberate edit: server false → the ask route serves the
// maintenance line; client false → this section is absent entirely.

const REFERENCE_HELP_AI_ENABLED = true;

// ─── FAQ data ──────────────────────────────────────────────────────────────

const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'What is FundLens Reference?',
    answer:
      'A factual reference for the funds in the TerrAscend 401(k) plan. For each fund it shows what it costs, what it holds, how it has performed, and where that data comes from. It does not score funds, rank them, or recommend anything — the funds are simply listed alphabetically, and any sorting you see is sorting you did yourself.',
  },
  {
    question: 'Where does the data come from?',
    answer:
      'Public sources. Holdings come from each fund’s N-PORT filing with the SEC (the same disclosure every mutual fund must file), prices from published fund NAVs, and expenses from fund disclosures. Every fund shows the dates its data speaks as of, and how much of the fund’s assets the data actually covers.',
  },
  {
    question: 'How current is the data?',
    answer:
      'The data refreshes on a regular automated schedule, and each fund shows its own "data as-of" dates: the date of the SEC filing its holdings come from, and the date its prices were last updated. SEC holdings filings are published on a delay set by the SEC, so holdings are typically a few months behind — that is a property of the public record, not an error.',
  },
  {
    question: 'Is this investment advice?',
    answer:
      'No. FundLens Reference is an educational information tool. It shows facts about the plan’s funds and never tells you what to pick, how to weigh a fund, or whether a number is good or bad. For advice about your own situation, consult a qualified financial adviser.',
  },
];

// ─── Glossary (plan §B3: the four plain-language entries) ──────────────────

const GLOSSARY: Array<{ term: string; definition: string }> = [
  {
    term: 'Expense ratio',
    definition:
      'What a fund charges you each year to own it, as a percentage of your money. An expense ratio of 0.50% costs about $50 a year on a $10,000 balance; 0.05% costs about $5. It is deducted from the fund automatically — you never see a bill, which is exactly why it is worth knowing.',
  },
  {
    term: 'Diversification',
    definition:
      'Spreading money across many different investments so no single company or industry can sink you on its own. A fund holding 500 stocks across every industry is more diversified than one holding 30 stocks in a single sector.',
  },
  {
    term: 'Index vs. active',
    definition:
      'An index fund simply buys everything in a published list (like the S&P 500) and holds it — no manager picks stocks, which is why index funds tend to cost very little. An active fund pays managers to choose investments they believe will do better, and charges more for the attempt.',
  },
  {
    term: 'Concentration',
    definition:
      'How much of a fund is riding on its biggest positions or a single sector. The concentration label in the funds table comes from a standard measure (the Herfindahl-Hirschman Index) computed from the fund’s sector weights — "Diversified" means spread out, "Concentrated" means a few areas dominate. Neither is good or bad by itself; it depends on what you want the fund to do.',
  },
];

// ─── Shared accordion row ──────────────────────────────────────────────────

function AccordionRow({
  title,
  body,
  open,
  onToggle,
}: {
  title: string;
  body: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: open ? theme.colors.surfaceAlt : theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: open ? `${theme.radii.md} ${theme.radii.md} 0 0` : theme.radii.md,
          cursor: 'pointer',
          textAlign: 'left',
          color: theme.colors.text,
          fontSize: 14,
          fontWeight: 600,
          fontFamily: theme.fonts.body,
          lineHeight: 1.4,
          transition: 'background 0.15s',
        }}
      >
        <span>{title}</span>
        <span
          style={{
            color: theme.colors.textDim,
            fontSize: 16,
            fontWeight: 400,
            marginLeft: 12,
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          &#9662;
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: '14px 16px',
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderTop: 'none',
            borderRadius: `0 0 ${theme.radii.md} ${theme.radii.md}`,
            color: theme.colors.textMuted,
            fontSize: 13,
            lineHeight: 1.65,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
}

// ─── Help chat (B10 c10) ───────────────────────────────────────────────────

/** One rendered turn. outcome is present on assistant turns only. */
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  outcome?: ReferenceHelpOutcome | 'network-error';
}

/** The our-voice label (assignment c10) — generated replies only. */
const AI_VOICE_LABEL = 'FundLens Help — written by AI, reviewed rules apply';

/** Disclosure line (ruling 5) — sits under the input. */
const DISCLOSURE_LINE =
  'Answers are written by AI and can be imperfect. Questions and answers ' +
  'are recorded to improve Help. This is education, not investment advice.';

function HelpAskSection() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest turn (HelpChat pattern)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, isLoading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // History is the thread as the member saw it — roles and text only.
    const history: HelpMessage[] = turns.map(t => ({ role: t.role, content: t.content }));

    setTurns(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsLoading(true);

    const res = await askReferenceHelp(text, history);

    if (res.data) {
      const { reply, outcome } = res.data;
      setTurns(prev => [...prev, { role: 'assistant', content: reply, outcome }]);
    } else {
      setTurns(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't connect. Please try again.",
          outcome: 'network-error',
        },
      ]);
    }
    setIsLoading(false);
  }, [input, isLoading, turns]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: `0 0 ${theme.spacing.xs}` }}>
        Ask a question
      </h2>
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.md}`, lineHeight: 1.5 }}>
        Ask about the app, the funds' listed facts, or what an investing term means.
      </p>

      <div
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.md,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Thread */}
        <div
          ref={scrollRef}
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {turns.length === 0 && !isLoading && (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 16px',
                color: theme.colors.textDim,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Ask about the app, a fund's listed facts, or what an investing term means.
            </div>
          )}

          {turns.map((turn, i) => {
            const isUser = turn.role === 'user';
            const isGenerated = turn.outcome === 'answered';
            // Code-served lines (refusal, trouble, maintenance, connection
            // trouble) render muted — they are system copy, not AI text.
            const isSystemLine = !isUser && !isGenerated;
            return (
              <div
                key={i}
                style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '9px 13px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser ? 'rgba(59,130,246,0.2)' : theme.colors.surfaceAlt,
                    border: `1px solid ${isUser ? 'rgba(59,130,246,0.3)' : theme.colors.border}`,
                    color: isSystemLine ? theme.colors.textMuted : theme.colors.text,
                    fontStyle: isSystemLine ? 'italic' : 'normal',
                    fontSize: 13,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {turn.content}
                </div>
                {isGenerated && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: theme.colors.textDim,
                      lineHeight: 1.4,
                    }}
                  >
                    {AI_VOICE_LABEL}
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator (HelpChat pattern) */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: '14px 14px 14px 4px',
                  background: theme.colors.surfaceAlt,
                  border: `1px solid ${theme.colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={dotStyle(0)} />
                <span style={dotStyle(1)} />
                <span style={dotStyle(2)} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div
          style={{
            padding: '10px 12px',
            borderTop: `1px solid ${theme.colors.border}`,
            display: 'flex',
            gap: 8,
          }}
        >
          <style>{`
            @keyframes fl-ref-dot-bounce {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
              30% { transform: translateY(-4px); opacity: 1; }
            }
            .fl-ref-help-input::placeholder {
              color: ${theme.colors.textDim};
            }
            .fl-ref-help-input:focus {
              border-color: ${theme.colors.accentBlue};
              outline: none;
            }
          `}</style>
          <input
            className="fl-ref-help-input"
            type="text"
            placeholder="Ask a question…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            maxLength={2000}
            style={{
              flex: 1,
              height: 38,
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
            aria-label="Send question"
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 10,
              border: 'none',
              background: input.trim() && !isLoading ? theme.colors.accentBlue : theme.colors.surfaceAlt,
              color: input.trim() && !isLoading ? '#fff' : theme.colors.textDim,
              cursor: input.trim() && !isLoading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Disclosure line (ruling 5) */}
      <p
        style={{
          fontSize: 11,
          color: theme.colors.textDim,
          margin: `${theme.spacing.xs} 0 0`,
          lineHeight: 1.5,
        }}
      >
        {DISCLOSURE_LINE}
      </p>
    </div>
  );
}

function dotStyle(index: number): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: theme.colors.textDim,
    display: 'inline-block',
    animation: `fl-ref-dot-bounce 1.2s ease-in-out ${index * 0.15}s infinite`,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function ReferenceHelp() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openTerm, setOpenTerm] = useState<number | null>(null);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: `${theme.spacing.xl} ${theme.spacing.md}`,
        fontFamily: theme.fonts.body,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.colors.text, margin: `0 0 ${theme.spacing.sm}` }}>
        Help
      </h1>

      {/* B10-F1 f3 (F1-e): the Ask section renders FIRST. Flag false →
          the chat is absent and the page renders B3's FAQ-only layout,
          original intro line included. */}
      {REFERENCE_HELP_AI_ENABLED ? (
        <>
          <HelpAskSection />
          {/* The FAQ heading with its one line of furniture text, so the
              seam between the chat and the fixed answers reads deliberately */}
          <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: `${theme.spacing.xxl} 0 ${theme.spacing.xs}` }}>
            Common questions
          </h2>
          <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.md}`, lineHeight: 1.5 }}>
            Common questions, answered the same way every time.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 14, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.xl}`, lineHeight: 1.5 }}>
          Common questions about FundLens Reference.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FAQS.map((faq, i) => (
          <AccordionRow
            key={i}
            title={faq.question}
            body={faq.answer}
            open={openFaq === i}
            onToggle={() => setOpenFaq(openFaq === i ? null : i)}
          />
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.colors.text, margin: `${theme.spacing.xxl} 0 ${theme.spacing.xs}` }}>
        Plain-language glossary
      </h2>
      <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.md}`, lineHeight: 1.5 }}>
        The terms the funds table uses, in normal words.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {GLOSSARY.map((entry, i) => (
          <AccordionRow
            key={i}
            title={entry.term}
            body={entry.definition}
            open={openTerm === i}
            onToggle={() => setOpenTerm(openTerm === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
}
