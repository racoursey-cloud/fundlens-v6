/**
 * FundLens — Reference Footer (B3)
 *
 * The educational/not-advice boilerplate, mounted on every reference-tier
 * page (plan §B3, §4: "Disclaimer on every page"). One component so the
 * wording can never drift between pages.
 *
 * COPY STATUS: PLACEHOLDER. Final legal text is supplied/approved by
 * Robert; until then this placeholder states the true position in plain
 * words. Replacing the copy is a one-line-region edit in this file only.
 */

import { theme } from '../theme';

export function ReferenceFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${theme.colors.border}`,
        padding: '20px 24px',
        marginTop: theme.spacing.xxl,
        color: theme.colors.textDim,
        fontSize: '12px',
        lineHeight: 1.6,
        fontFamily: theme.fonts.body,
        textAlign: 'center',
      }}
    >
      {/* ── PLACEHOLDER COPY — pending Robert's approved legal text ── */}
      FundLens Reference is an educational information tool for TerrAscend
      401(k) plan participants. It shows factual, publicly sourced data about
      the funds in the plan — costs, holdings, returns, and where that data
      comes from. It does not provide investment advice, does not recommend
      any fund or mix of funds, and does not suggest buying, selling, or
      holding anything. For advice about your own situation, consult a
      qualified financial adviser.
    </footer>
  );
}
