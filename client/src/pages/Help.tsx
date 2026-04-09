/**
 * FundLens v6 — Help Page
 *
 * Static FAQ content answering common questions about FundLens,
 * plus the Claude Haiku chat section for anything not covered by FAQs.
 *
 * Session 16 deliverable. References: MISSING-9, §6.7.
 * Destination: client/src/pages/Help.tsx
 */

import { useState } from 'react';
import { theme } from '../theme';
import { helpChat, type HelpMessage } from '../api';

// ─── FAQ Data ──────────────────────────────────────────────────────────────

const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'What is FundLens?',
    answer:
      'FundLens scores the funds in your 401(k) plan across four factors and recommends personalized allocations based on your risk tolerance. Think of it as the analysis an institutional investor would run — but built for your retirement account.',
  },
  {
    question: 'How are funds scored?',
    answer:
      'Each fund is scored 0\u2013100 based on four factors: Cost Efficiency (how much it charges), Holdings Quality (financial health of its holdings), Momentum (recent price performance), and Positioning (how well its sectors align with current economic conditions). The four scores are combined into one composite score.',
  },
  {
    question: 'What do the scores mean?',
    answer:
      '75+ (green) is strong, 50\u201374 (blue) is solid, 25\u201349 (amber) is below average, below 25 (red) is weak. These are relative \u2014 a score of 60 means the fund is above average compared to the other funds in your plan.',
  },
  {
    question: 'How are allocations calculated?',
    answer:
      'Your allocation is based on fund scores and your risk tolerance. Higher risk tolerance concentrates more money in top-scoring funds. Lower risk tolerance spreads money more evenly. Any fund that would receive less than 5% is excluded.',
  },
  {
    question: 'What does the risk slider do?',
    answer:
      'It controls how concentrated your allocation is. It does NOT change fund scores \u2014 those are objective. At \u201cVery Conservative,\u201d your money is spread across many funds. At \u201cVery Aggressive,\u201d it\u2019s concentrated in your highest-conviction picks.',
  },
  {
    question: 'What are the factor weight sliders?',
    answer:
      'They let you customize how much each factor matters to you. The defaults (Cost 25%, Quality 30%, Momentum 25%, Positioning 20%) are based on academic research, but you can adjust them. Changing weights instantly updates your scores and allocation.',
  },
  {
    question: 'What is the Investment Brief?',
    answer:
      'A personalized report generated monthly that explains your allocation in plain English. It covers what the economic data shows, what changed since your last Brief, what to watch for, and where your allocation stands.',
  },
  {
    question: 'How often is data updated?',
    answer:
      'The scoring pipeline runs daily. Fund prices are updated from Tiingo. Company fundamentals are cached for 7 days. The macro thesis is regenerated with each pipeline run using the latest FRED economic data and news headlines.',
  },
  {
    question: 'What does \u201cLow Data\u201d mean?',
    answer:
      'A fund marked \u201cLow Data\u201d has too many missing data points to score reliably. It still appears in your fund list but is excluded from allocation recommendations.',
  },
  {
    question: 'Can I trust this?',
    answer:
      'FundLens is a decision-support tool, not financial advice. It democratizes the kind of analysis institutional investors use, but you should always consider your full financial picture. The scores are based on published academic research and real financial data.',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function Help() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const handleAsk = async () => {
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);

    const history: HelpMessage[] = [];
    const res = await helpChat(text, history);

    if (res.data) {
      setAnswer(res.data.reply);
    } else {
      setError('Could not get a response. Please try again.');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: `${theme.spacing.xl} ${theme.spacing.md}`,
      fontFamily: theme.fonts.body,
    }}>
      {/* Page header */}
      <h1 style={{
        fontSize: 24,
        fontWeight: 700,
        color: theme.colors.text,
        margin: `0 0 ${theme.spacing.sm} 0`,
      }}>
        Help
      </h1>
      <p style={{
        fontSize: 14,
        color: theme.colors.textMuted,
        margin: `0 0 ${theme.spacing.xl} 0`,
        lineHeight: 1.5,
      }}>
        Common questions about how FundLens works.
      </p>

      {/* FAQ accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {FAQS.map((faq, i) => (
          <div key={i}>
            <button
              onClick={() => toggleFaq(i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: openFaq === i ? theme.colors.surfaceAlt : theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: openFaq === i ? `${theme.radii.md} ${theme.radii.md} 0 0` : theme.radii.md,
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
              <span>{faq.question}</span>
              <span style={{
                color: theme.colors.textDim,
                fontSize: 16,
                fontWeight: 400,
                marginLeft: 12,
                flexShrink: 0,
                transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}>
                &#9662;
              </span>
            </button>
            {openFaq === i && (
              <div style={{
                padding: '14px 16px',
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderTop: 'none',
                borderRadius: `0 0 ${theme.radii.md} ${theme.radii.md}`,
                color: theme.colors.textMuted,
                fontSize: 13,
                lineHeight: 1.65,
              }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chat section */}
      <div style={{ marginTop: theme.spacing.xxl }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          color: theme.colors.text,
          margin: `0 0 ${theme.spacing.xs} 0`,
        }}>
          Still have questions?
        </h2>
        <p style={{
          fontSize: 13,
          color: theme.colors.textMuted,
          margin: `0 0 ${theme.spacing.md} 0`,
          lineHeight: 1.5,
        }}>
          Ask about anything related to FundLens or your 401(k) funds.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Ask a question about FundLens..."
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={{
              flex: 1,
              height: 42,
              padding: '0 14px',
              background: theme.colors.bg,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.md,
              color: theme.colors.text,
              fontSize: 13,
              fontFamily: theme.fonts.body,
              outline: 'none',
            }}
          />
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            style={{
              padding: '0 20px',
              height: 42,
              borderRadius: theme.radii.md,
              border: 'none',
              background: question.trim() && !loading ? theme.colors.accentBlue : theme.colors.surfaceAlt,
              color: question.trim() && !loading ? '#fff' : theme.colors.textDim,
              cursor: question.trim() && !loading ? 'pointer' : 'default',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: theme.fonts.body,
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        {/* Response area */}
        {answer && (
          <div style={{
            marginTop: theme.spacing.md,
            padding: '14px 16px',
            background: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radii.md,
            color: theme.colors.text,
            fontSize: 13,
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
          }}>
            {answer}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{
            marginTop: theme.spacing.md,
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: theme.radii.md,
            color: theme.colors.error,
            fontSize: 13,
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
