/**
 * FundLens v6 — Admin Alert Emails
 *
 * Sends operational alert emails to admins when something goes wrong:
 *   - Pipeline run failures (full or partial)
 *   - Brief delivery failures
 *   - Stale pipeline runs detected and cleaned up
 *
 * Uses the same Resend integration as brief-email.ts.
 * Alerts are fire-and-forget — failures to SEND the alert are logged
 * but never block the calling code.
 *
 * Session 21 deliverable.
 */

import { Resend } from 'resend';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Admin email recipients for operational alerts.
 *  A2 Task 3: corrected from 'rcoursey@gmail.com' (typo — not Robert's address);
 *  alerts sent before this fix never reached him. */
const ADMIN_EMAILS = ['racoursey@gmail.com'];

/** Sender address for alert emails.
 *  A5 follow-up (Robert, July 5, 2026): the Resend-verified sending domain
 *  is updates.fundlens.app — a subdomain, deliberately (subdomain sending
 *  is deliverability best practice). Resend verification is exact-match
 *  per domain; the root domain was never verified, which silently killed
 *  every alert email until July 5. */
const FROM_ADDRESS = 'FundLens Ops <alerts@updates.fundlens.app>';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send an operational alert email to all admins.
 *
 * Fire-and-forget: errors are logged but never thrown.
 * Safe to call from catch blocks without try/catch wrapping.
 *
 * @param subject - Email subject line (keep it short and scannable)
 * @param body - Plain text or simple HTML body describing the issue
 */
export async function sendAdminAlert(
  subject: string,
  body: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[admin-alert] RESEND_API_KEY not configured — skipping alert email');
    return;
  }

  try {
    const resend = new Resend(resendKey);

    const html = buildAlertHtml(subject, body);

    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAILS,
      subject: `⚠ FundLens: ${subject}`,
      html,
    });

    if (result.error) {
      console.error(`[admin-alert] Resend error: ${result.error.message}`);
      return;
    }

    console.log(`[admin-alert] Alert sent: "${subject}" (Resend ID: ${result.data?.id})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin-alert] Failed to send alert: ${msg}`);
  }
}

// ─── Pre-built Alert Helpers ────────────────────────────────────────────────

/** Alert: pipeline run failed */
export async function alertPipelineFailure(
  runId: string,
  errorMessage: string
): Promise<void> {
  await sendAdminAlert(
    'Pipeline run failed',
    `Pipeline run <strong>${runId}</strong> failed.\n\n` +
    `<strong>Error:</strong>\n${escapeHtml(errorMessage)}\n\n` +
    `Check the <code>pipeline_runs</code> table for full details.`
  );
}

/** Alert: pipeline run had partial errors (completed but some funds failed) */
export async function alertPipelineErrors(
  runId: string,
  errors: Array<{ fund: string; step: string; error: string }>
): Promise<void> {
  if (errors.length === 0) return;

  const errorList = errors
    .slice(0, 20) // Cap at 20 to keep email readable
    .map(e => `• <strong>${e.fund}</strong> (${e.step}): ${escapeHtml(e.error)}`)
    .join('\n');

  const suffix = errors.length > 20
    ? `\n\n...and ${errors.length - 20} more errors.`
    : '';

  await sendAdminAlert(
    `Pipeline completed with ${errors.length} error${errors.length === 1 ? '' : 's'}`,
    `Pipeline run <strong>${runId}</strong> completed but encountered errors:\n\n` +
    `${errorList}${suffix}`
  );
}

/** Alert: brief delivery had failures */
export async function alertBriefFailures(
  totalEligible: number,
  sent: number,
  errors: Array<{ userId: string; step: string; error: string }>
): Promise<void> {
  if (errors.length === 0) return;

  const errorList = errors
    .slice(0, 10)
    .map(e => `• User ${e.userId.slice(0, 8)}... (${e.step}): ${escapeHtml(e.error)}`)
    .join('\n');

  const suffix = errors.length > 10
    ? `\n\n...and ${errors.length - 10} more errors.`
    : '';

  await sendAdminAlert(
    `Brief delivery: ${errors.length} failure${errors.length === 1 ? '' : 's'}`,
    `Brief delivery run: ${sent}/${totalEligible} sent successfully, ` +
    `${errors.length} failed.\n\n${errorList}${suffix}`
  );
}

// ─── Claude API Failure Alerts (A2 Task 3, Founding Principle 1) ───────────
// A Claude API error in Brief generation, Help chat, or sector classification
// must reach Robert as an email — silent gaps are worse than visible failures.
// Rate-limited: at most ONE alert per (feature, error type) per 24 hours, so a
// recurring nightly failure produces one email, not 193.
//
// The rate-limit memory is in-process. A server restart resets it, which at
// worst means one extra email — acceptable for an alerting path.

/** How long to suppress repeat alerts for the same feature + error type */
const ALERT_SUPPRESS_MS = 24 * 60 * 60 * 1000;

/** Last-sent timestamp per "feature:errorType" key */
const lastAlertSentAt = new Map<string, number>();

/**
 * Classify a Claude API error message into a coarse error type, and pick a
 * one-line plain-English hint for the alert email.
 */
function classifyClaudeError(errorMessage: string): { errorType: string; hint: string } {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('credit balance')) {
    return {
      errorType: 'credit-balance',
      hint: 'Credit balance errors are fixed at console.anthropic.com → Billing (add credits).',
    };
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return {
      errorType: 'rate-limit',
      hint: 'Rate limit errors usually pass on their own; if they persist, check usage at console.anthropic.com.',
    };
  }
  if (lower.includes('authentication') || lower.includes('invalid x-api-key') || lower.includes('401')) {
    return {
      errorType: 'auth',
      hint: 'Authentication errors mean the API key is wrong or revoked — check the key at console.anthropic.com and the Railway variables.',
    };
  }
  if (lower.includes('overloaded') || lower.includes('529')) {
    return {
      errorType: 'overloaded',
      hint: 'The Claude API is temporarily overloaded on Anthropic’s side; this usually resolves within minutes.',
    };
  }
  return {
    errorType: 'other',
    hint: 'Unrecognized error — check the Railway logs around this timestamp for context.',
  };
}

/**
 * Alert: a Claude API call failed in an engine feature.
 *
 * Fire-and-forget and rate-limited (one email per feature + error type per
 * 24 hours). Safe to call from any catch block without wrapping.
 *
 * @param feature - Which feature failed (e.g. "Brief generation", "Help chat", "Sector classification")
 * @param errorMessage - The API error message, verbatim
 */
export async function alertClaudeApiFailure(
  feature: string,
  errorMessage: string
): Promise<void> {
  const { errorType, hint } = classifyClaudeError(errorMessage);

  const key = `${feature}:${errorType}`;
  const now = Date.now();
  const lastSent = lastAlertSentAt.get(key);

  if (lastSent !== undefined && now - lastSent < ALERT_SUPPRESS_MS) {
    console.log(`[admin-alert] Suppressing repeat Claude API alert (${key}) — last sent ${Math.round((now - lastSent) / 60000)}m ago`);
    return;
  }

  lastAlertSentAt.set(key, now);

  await sendAdminAlert(
    `Claude API failure — ${feature}`,
    `A Claude API call failed in <strong>${escapeHtml(feature)}</strong>.\n\n` +
    `<strong>Error (verbatim):</strong>\n<code>${escapeHtml(errorMessage)}</code>\n\n` +
    `<strong>Hint:</strong> ${escapeHtml(hint)}\n\n` +
    `Repeat failures of this type are suppressed for 24 hours — ` +
    `you will get at most one email per feature per error type per day.`
  );
}

// ─── Dossier Gate Alerts (A3 Task 4, Founding Principle 2) ─────────────────

/**
 * Alert: one or more funds failed the Dossier data-quality gate
 * (ratified thresholds: 90% NAV resolved / 95% classified).
 *
 * ONE summary email per run listing every failing fund — never one email
 * per fund. Rate-limited with the same 24-hour suppression as the Claude
 * API alerts so the nightly run produces at most one email per day.
 */
export async function alertDossierGateFailures(
  runId: string,
  failures: Array<{ ticker: string; reasons: string[] }>
): Promise<void> {
  if (failures.length === 0) return;

  const key = 'dossier-gate:failures';
  const now = Date.now();
  const lastSent = lastAlertSentAt.get(key);
  if (lastSent !== undefined && now - lastSent < ALERT_SUPPRESS_MS) {
    console.log(`[admin-alert] Suppressing repeat Dossier gate alert — last sent ${Math.round((now - lastSent) / 60000)}m ago`);
    return;
  }
  lastAlertSentAt.set(key, now);

  const list = failures
    .map(f => `• <strong>${escapeHtml(f.ticker)}</strong>: ${escapeHtml(f.reasons.join('; '))}`)
    .join('\n');

  await sendAdminAlert(
    `Dossier gate: ${failures.length} fund${failures.length === 1 ? '' : 's'} below data-quality thresholds`,
    `Pipeline run <strong>${escapeHtml(runId)}</strong> completed, but these funds ` +
    `failed the ratified data-quality gate (90% of NAV resolved / 95% classified):\n\n` +
    `${list}\n\n` +
    `Details are on the Pipeline tab (Fund Data Quality section) and in the ` +
    `<code>fund_dossiers</code> table. Their scores are built on incomplete data ` +
    `and should be read accordingly. At most one of these emails is sent per 24 hours.`
  );
}

/** Alert: stale pipeline run detected and cleaned up */
export async function alertStaleRun(
  runId: string,
  startedAt: string
): Promise<void> {
  await sendAdminAlert(
    'Stale pipeline run cleaned up',
    `Pipeline run <strong>${runId}</strong> was stuck in "running" status ` +
    `since ${startedAt} and has been marked as failed.\n\n` +
    `This usually means the server restarted mid-pipeline or the process crashed.`
  );
}

// ─── Email Template ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildAlertHtml(subject: string, body: string): string {
  // Convert newlines to <br> for plain text bodies
  const htmlBody = body.replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 24px auto; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; overflow: hidden; }
    .header { background: #dc2626; color: white; padding: 16px 24px; font-size: 16px; font-weight: 600; }
    .body { padding: 24px; font-size: 14px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
    .footer { padding: 16px 24px; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${escapeHtml(subject)}</div>
    <div class="body">${htmlBody}</div>
    <div class="footer">FundLens operational alert &middot; ${new Date().toISOString()}</div>
  </div>
</body>
</html>`.trim();
}
