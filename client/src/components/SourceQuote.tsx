/**
 * FundLens — Voice-separation primitives (B-series B9 c8)
 *
 * One place styles both voices forever (voice-separation convention,
 * Fabio ruling under delegated authority, July 31, 2026 — app-wide in the
 * reference tier):
 *
 *   <SourceQuote>  — verbatim source material: semantic <blockquote>,
 *                    upright type, hairline left rule, slight indent, and
 *                    a small attribution line naming source and date,
 *                    linking the EDGAR filing.
 *   <OurVoice>     — anything we author: italic type with an explicit
 *                    label (e.g. "Translation — plain English").
 *
 * At least two signals always (typography + structure/label), never color
 * alone. Rule of construction: inside a quote block with attribution =
 * untouched source; anything else = ours and says so.
 *
 * The EDGAR link uses the accession-number search URL — it lands on the
 * filing without needing the fund's CIK (which the reference payload does
 * not carry).
 */

import type { ReactNode } from 'react';
import { theme } from '../theme';

// ─── EDGAR filing link ─────────────────────────────────────────────────────

/** EDGAR full-text search pinned to one accession number — resolves to the
 *  filing itself without needing a CIK. */
export function edgarFilingUrl(accession: string): string {
  return `https://www.sec.gov/edgar/search/#/q=%22${encodeURIComponent(accession)}%22`;
}

// ─── SourceQuote: verbatim source material ─────────────────────────────────

export function SourceQuote({
  children,
  accession,
  filingDate,
}: {
  /** The verbatim text (rendered pre-wrap so filed paragraph breaks hold) */
  children: ReactNode;
  /** SEC accession number for the attribution link */
  accession: string;
  /** Prospectus date (YYYY-MM-DD) for the attribution line */
  filingDate: string;
}) {
  return (
    <blockquote
      style={{
        margin: 0,
        padding: '2px 0 2px 14px',
        borderLeft: `1px solid ${theme.colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: theme.colors.text,
          lineHeight: 1.65,
          fontStyle: 'normal',
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: theme.colors.textDim }}>
        From the fund&apos;s{' '}
        <a
          href={edgarFilingUrl(accession)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: theme.colors.textDim, textDecoration: 'underline' }}
        >
          prospectus, filed with the SEC
        </a>
        {' '}— {filingDate}
      </div>
    </blockquote>
  );
}

// ─── VendorQuote: verbatim third-party text that is not an SEC filing ──────
// H2: the FMP company description is source material we did not write, so the
// convention governs it — same construction as SourceQuote (blockquote,
// hairline rule, upright type, attribution line), different attribution.
// It lives here rather than in the page because the convention above is
// explicit that one place styles the voices; a second quote block styled
// inside a page is how two of them start to drift.

export function VendorQuote({
  children,
  attribution,
}: {
  /** The verbatim vendor text (pre-wrap, so any paragraph breaks hold) */
  children: ReactNode;
  /** Attribution line naming the source, e.g. "Company data: Financial
   *  Modeling Prep". Required — a quote block without attribution reads as
   *  our own voice, which is the one thing this convention forbids. */
  attribution: ReactNode;
}) {
  return (
    <blockquote
      style={{
        margin: 0,
        padding: '2px 0 2px 14px',
        borderLeft: `1px solid ${theme.colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: theme.colors.text,
          lineHeight: 1.65,
          fontStyle: 'normal',
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: theme.colors.textDim }}>
        {attribution}
      </div>
    </blockquote>
  );
}

// ─── OurVoice: anything the app authors ────────────────────────────────────

export function OurVoice({
  children,
  label,
}: {
  children: ReactNode;
  /** Explicit label naming the voice, e.g. "Translation — plain English" */
  label: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.colors.textMuted,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: theme.colors.text,
          lineHeight: 1.65,
          fontStyle: 'italic',
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
    </div>
  );
}
