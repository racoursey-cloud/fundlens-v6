/**
 * FundLens v6 — Admin Alert Emails
 *
 * Sends operational alert emails to admins when something goes wrong:
 *   - Pipeline run failures
 *   - Brief delivery failures
 *   - Stale pipeline runs detected
 *
 * Uses the same Resend integration as brief-email.ts.
 * Alerts are fire-and-forget — failures to SEND the alert are logged
 * but never block the calling code.
 *
 * Session 21 deliverable.
 */

import { Resend } from 'resend';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Admin email recipients for operational alerts */
const ADMIN_EMAILS = ['rcoursey@gmail.com'];

/** Sender address for alert emails */
const FROM_ADDRESS = 'FundLens Ops <alerts@fundlens.app>';

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
