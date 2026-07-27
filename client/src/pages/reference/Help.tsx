/**
 * FundLens — Reference Help (B3)
 *
 * FAQ-only help for the reference tier. NO chat UI and NO /api/help/chat
 * calls (plan §B3) — this page makes zero API requests.
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

import { useState } from 'react';
import { theme } from '../../theme';

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
      <p style={{ fontSize: 14, color: theme.colors.textMuted, margin: `0 0 ${theme.spacing.xl}`, lineHeight: 1.5 }}>
        Common questions about FundLens Reference.
      </p>

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
