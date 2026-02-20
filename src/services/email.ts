/**
 * @fileoverview Email service using Resend for transactional emails
 */

import { Resend } from "resend";
import { getEnv } from "../lib/env-helper";

const apiKey = getEnv("RESEND_API_KEY");
const senderEmail = getEnv("RESEND_SENDER_EMAIL", "onboarding@resend.dev");
const senderName = getEnv("RESEND_SENDER_NAME", "Whisperly");
const appUrl = getEnv("APP_URL", "http://localhost:5173");

let resend: Resend | null = null;

if (apiKey) {
  resend = new Resend(apiKey);
} else {
  console.warn("RESEND_API_KEY not set — invitation emails will not be sent");
}

interface InvitationEmailParams {
  recipientEmail: string;
  entityName: string;
}

export async function sendInvitationEmail({
  recipientEmail,
  entityName,
}: InvitationEmailParams): Promise<void> {
  if (!resend) {
    console.warn("Skipping invitation email — Resend not configured");
    return;
  }

  const dashboardUrl = `${appUrl}/en/dashboard?redirect=/invitations`;

  const { error } = await resend.emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: recipientEmail,
    subject: `You've been invited to join ${entityName} on Whisperly`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin-bottom: 16px;">You're invited!</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.5;">
          You've been invited to join <strong>${entityName}</strong> on Whisperly.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.5;">
          Sign in to your Whisperly account to accept the invitation:
        </p>
        <a href="${dashboardUrl}"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px; margin: 16px 0;">
          Go to Dashboard
        </a>
        <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 24px;">
          This invitation will expire in 14 days. If you don't have an account yet, sign up at
          <a href="${appUrl}" style="color: #111;">${appUrl}</a> using this email address
          and the invitation will be automatically accepted.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
