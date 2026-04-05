/**
 * FundLens v6 — Investment Brief Email Delivery
 *
 * Sends Investment Briefs to users via Resend SMTP.
 * Resend is already configured for magic link auth emails — this module
 * uses the same API key to also deliver the monthly Brief.
 *
 * The email contains the Brief as styled HTML (converted from Markdown)
 * with a link back to the app to view the full Brief with charts.
 *
 * Session 6 deliverable. Destination: src/services/brief-email.ts
 * References: Master Reference §7 (Delivery).
 */

import { Resend } from 'resend';
import { supaInsert, supaUpdate } from './supabase.js';
import type { BriefDeliveryRow } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SendBriefEmailOptions {
  /** Investment Brief UUID */
  briefId: string;
  /** Recipient user UUID */
  userId: string;
  /** Recipient email address */
  toEmail: string;
  /** Brief title (e.g. "Investment Brief — April 2026") */
  title: string;
  /** Brief content as Markdown */
  contentMd: string;
}

interface SendBriefEmailResult {
  success: boolean;
  deliveryId: string | null;
  resendId: string | null;
  error: string | null;
}

// ─── Markdown → HTML Conversion ─────────────────────────────────────────────

/**
 * Convert Brief Markdown to styled HTML for email.
 *
 * We do this with simple regex replacements rather than importing a
 * Markdown library — the Brief follows a predictable structure defined
 * by the editorial policy, so we know exactly what to expect.
 */
function briefMarkdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 style="color:#e2e8f0;font-size:14px;margin:16px 0 8px;">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#e2e8f0;font-size:16px;margin:20px 0 8px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#e2e8f0;font-size:18px;margin:24px 0 10px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#ffffff;font-size:22px;margin:28px 0 12px;">$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#ffffff;">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;color:#cbd5e1;">$1</li>')
    // Table rows (simple | delimited)
    .replace(/^\|(.+)\|$/gm, (_, content: string) => {
      const cells = content.split('|').map((c: string) => c.trim());
      return '<tr>' + cells.map((c: string) =>
        `<td style="padding:6px 12px;border:1px solid #25282e;color:#cbd5e1;">${c}</td>`
      ).join('') + '</tr>';
    })
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p style="color:#cbd5e1;line-height:1.6;margin:12px 0;">')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br>');

  // Wrap lists
  html = html.replace(/(<li[^>]*>.*?<\/li>(\s*<br>)?)+/g, (match) => {
    return `<ul style="padding-left:20px;margin:8px 0;">${match.replace(/<br>/g, '')}</ul>`;
  });

  // Wrap tables
  html = html.replace(/(<tr>.*?<\/tr>(\s*<br>)?)+/g, (match) => {
    return `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${match.replace(/<br>/g, '')}</table>`;
  });

  return html;
}

/**
 * Build the complete HTML email body with FundLens branding.
 */
function buildEmailHtml(title: string, contentMd: string, appUrl: string): string {
  const briefHtml = briefMarkdownToHtml(contentMd);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0e0f11;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0e0f11;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;background-color:#16181c;border-radius:12px 12px 0 0;border-bottom:1px solid #25282e;">
              <h1 style="margin:0;font-size:20px;color:#3b82f6;font-weight:600;">FundLens</h1>
              <p style="margin:4px 0 0;font-size:14px;color:#64748b;">${title}</p>
            </td>
          </tr>

          <!-- Brief Content -->
          <tr>
            <td style="padding:24px 32px;background-color:#16181c;">
              <p style="color:#cbd5e1;line-height:1.6;margin:12px 0;">
                ${briefHtml}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:16px 32px 24px;background-color:#16181c;text-align:center;">
              <a href="${appUrl}" style="display:inline-block;padding:12px 24px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">
                View Full Brief in FundLens
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#16181c;border-radius:0 0 12px 12px;border-top:1px solid #25282e;">
              <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
                This Brief was generated by FundLens using current market data and your personal factor preferences.
                Past performance does not guarantee future results. This is not financial advice.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#475569;text-align:center;">
                You receive this email because you have an active FundLens account.
                To stop receiving Briefs, update your preferences in the app.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email Delivery ─────────────────────────────────────────────────────────

/**
 * Send an Investment Brief via Resend.
 *
 * Creates a brief_deliveries record to track the send, then calls
 * the Resend API. Updates the delivery record with the result.
 */
export async function sendBriefEmail(
  options: SendBriefEmailOptions
): Promise<SendBriefEmailResult> {
  const { briefId, userId, toEmail, title, contentMd } = options;

  // Create delivery tracking record
  const { data: delivery, error: insertError } = await supaInsert<BriefDeliveryRow>(
    'brief_deliveries',
    {
      brief_id: briefId,
      user_id: userId,
      email_to: toEmail,
      status: 'pending',
    },
    { single: true }
  );

  if (insertError || !delivery) {
    return {
      success: false,
      deliveryId: null,
      resendId: null,
      error: `Failed to create delivery record: ${insertError}`,
    };
  }

  // Check for Resend API key
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await supaUpdate('brief_deliveries', {
      status: 'failed',
      error_message: 'RESEND_API_KEY not configured',
    }, { id: `eq.${delivery.id}` });

    return {
      success: false,
      deliveryId: delivery.id,
      resendId: null,
      error: 'RESEND_API_KEY not configured',
    };
  }

  // Build email HTML
  const appUrl = process.env.APP_URL || 'https://fundlens.app';
  const emailHtml = buildEmailHtml(title, contentMd, appUrl);

  // Send via Resend
  try {
    const resend = new Resend(resendKey);

    const result = await resend.emails.send({
      from: 'FundLens <brief@fundlens.app>',
      to: [toEmail],
      subject: title,
      html: emailHtml,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    // Update delivery record — success
    await supaUpdate('brief_deliveries', {
      status: 'sent',
      resend_id: result.data?.id || null,
      sent_at: new Date().toISOString(),
    }, { id: `eq.${delivery.id}` });

    // Update the Brief status to 'sent'
    await supaUpdate('investment_briefs', {
      status: 'sent',
    }, { id: `eq.${briefId}` });

    // Update user's last_brief_sent_at
    await supaUpdate('user_profiles', {
      last_brief_sent_at: new Date().toISOString(),
    }, { id: `eq.${userId}` });

    console.log(`[brief-email] Sent Brief ${briefId} to ${toEmail} (Resend ID: ${result.data?.id})`);

    return {
      success: true,
      deliveryId: delivery.id,
      resendId: result.data?.id || null,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brief-email] Failed to send Brief ${briefId}: ${msg}`);

    await supaUpdate('brief_deliveries', {
      status: 'failed',
      error_message: msg,
    }, { id: `eq.${delivery.id}` });

    return {
      success: false,
      deliveryId: delivery.id,
      resendId: null,
      error: msg,
    };
  }
}
