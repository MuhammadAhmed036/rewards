import { db } from "../db";
import { emailOutbox } from "../db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { eq, and, lte, or } from "drizzle-orm";
import nodemailer from "nodemailer";

export type EmailTemplate =
  | "magic_link"
  | "staff_invitation"
  | "welcome"
  | "reward_unlocked"
  | "redemption_receipt"
  | "feedback_received"
  | "data_export_ready"
  | "owner_business_registered";

export interface QueueEmailOptions {
  toEmail: string;
  template: EmailTemplate;
  payload: Record<string, unknown>;
  kind?: "transactional" | "marketing";
  tenantId?: string;
}

/**
 * Queues an email into the transactional or marketing outbox per Section 10 & 14.6
 */
export async function queueEmail(options: QueueEmailOptions) {
  const [entry] = await db
    .insert(emailOutbox)
    .values({
      toEmail: options.toEmail.toLowerCase().trim(),
      template: options.template,
      payload: options.payload,
      kind: options.kind || "transactional",
      tenantId: options.tenantId || null,
      status: "queued",
      attempts: 0,
      nextAttemptAt: new Date(),
    })
    .returning();

  return entry;
}

export function renderEmailTemplate(
  template: EmailTemplate,
  payload: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const appName = env.NEXT_PUBLIC_APP_NAME || "Loyalty Platform";

  switch (template) {
    case "magic_link": {
      const url = String(payload.url || "#");
      return {
        subject: `Sign in to ${appName}`,
        text: `Click the link below to sign in:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a; margin-bottom: 16px;">Sign in to ${appName}</h2>
            <p style="color: #334155; line-height: 1.5; font-size: 16px;">Click the button below to authenticate your account. This one-time link expires in 10 minutes.</p>
            <div style="margin: 28px 0;">
              <a href="${url}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Sign in to your account</a>
            </div>
            <p style="color: #64748b; font-size: 13px;">If the button does not work, copy and paste this URL into your browser:<br/><span style="color: #4f46e5;">${url}</span></p>
          </div>
        `,
      };
    }
    case "staff_invitation": {
      const businessName = String(payload.businessName || "Your Business");
      const role = String(payload.role || "staff");
      const tempPass = payload.temporaryPassword ? String(payload.temporaryPassword) : null;
      const loginUrl = `${env.APP_URL}/staff`;

      return {
        subject: `You've been invited to join ${businessName} on ${appName}`,
        text: `You have been added as ${role} for ${businessName}.\n\nLog in here: ${loginUrl}${
          tempPass ? `\nTemporary Password: ${tempPass}` : ""
        }`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a;">Welcome to ${businessName}</h2>
            <p style="color: #334155; font-size: 16px;">You have been invited to join the staff team as <strong>${role}</strong>.</p>
            ${
              tempPass
                ? `<div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Temporary Password</div>
                    <div style="font-family: monospace; font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 4px;">${tempPass}</div>
                   </div>`
                : ""
            }
            <div style="margin: 24px 0;">
              <a href="${loginUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Open Staff Terminal</a>
            </div>
          </div>
        `,
      };
    }
    case "welcome": {
      const businessName = String(payload.businessName || "Our Business");
      const memberNumber = String(payload.memberNumber || "");
      const hubUrl = String(payload.hubUrl || `${env.APP_URL}`);

      return {
        subject: `Welcome to ${businessName} Loyalty Programme!`,
        text: `Thank you for joining ${businessName}!\n\nYour Member Number: ${memberNumber}\n\nView your points and rewards: ${hubUrl}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a;">Welcome to ${businessName}!</h2>
            <p style="color: #334155; font-size: 16px;">You are now a member of our loyalty programme. Show your Member QR on every visit to earn points and unlock rewards.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; margin: 20px 0; text-align: center;">
              <div style="font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase;">Your Member Number</div>
              <div style="font-size: 28px; font-weight: 800; font-family: monospace; letter-spacing: 2px; color: #4f46e5; margin-top: 4px;">${memberNumber}</div>
            </div>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${hubUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">View My Rewards & QR</a>
            </div>
          </div>
        `,
      };
    }
    case "owner_business_registered": {
      const ownerName = String(payload.ownerName || "Business Owner");
      const businessName = String(payload.businessName || "Your Store");
      const category = String(payload.category || "Commercial");
      const storeUrl = String(payload.storeUrl || `${env.APP_URL}`);

      return {
        subject: `🎉 Congratulations! Your business "${businessName}" is registered on ${appName}`,
        text: `Hello ${ownerName},\n\nCongratulations! Your business "${businessName}" (${category}) has been successfully registered on ${appName}.\n\nYour Dedicated Store Website:\n${storeUrl}\n\nStatus: Pending Super Admin Approval.\nOnce our platform team approves your account, you will be able to log in to your owner dashboard directly at your store link above.\n\nThank you for choosing ${appName}!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 36px;">🎉</span>
              <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 8px 0 4px 0;">Welcome to ${appName}!</h1>
              <p style="color: #64748b; font-size: 14px; margin: 0;">Your business account has been created successfully.</p>
            </div>

            <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #cbd5e1; border-radius: 14px; padding: 20px; margin: 24px 0;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Registered Store</div>
              <div style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">${businessName}</div>
              <div style="font-size: 13px; color: #475569; margin-top: 2px;">Category: ${category}</div>

              <div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Your Store Website URL</div>
                <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: #4f46e5; margin-top: 4px; word-break: break-all;">${storeUrl}</div>
              </div>
            </div>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${storeUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">Visit Your Store Page →</a>
            </div>

            <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 14px; margin-top: 24px;">
              <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.5;">
                <strong>Next Step:</strong> Your store is currently pending review by the platform Super Admin. As soon as approval is granted, you can sign in directly at your store link to configure rewards, staff accounts, and daily promotions.
              </p>
            </div>

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px;">
              ${appName} • Enterprise Customer Loyalty Infrastructure
            </div>
          </div>
        `,
      };
    }
    case "reward_unlocked": {
      const businessName = String(payload.businessName || "Your Business");
      const rewardTitle = String(payload.rewardTitle || "Reward");
      const balance = payload.balance || 0;

      return {
        subject: `You have unlocked "${rewardTitle}" at ${businessName}!`,
        text: `Congratulations! You have enough points (${balance} pts) to claim "${rewardTitle}" at ${businessName}. Show your code on your next visit!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #15803d;">Reward Unlocked! 🎉</h2>
            <p style="color: #334155; font-size: 16px;">You have accumulated enough points at <strong>${businessName}</strong> to redeem <strong>${rewardTitle}</strong>!</p>
            <p style="color: #64748b; font-size: 14px;">Visit us anytime and tap "Redeem" on your loyalty hub when ordering.</p>
          </div>
        `,
      };
    }
    case "redemption_receipt": {
      const businessName = String(payload.businessName || "Your Business");
      const rewardTitle = String(payload.rewardTitle || "Reward");
      const costPoints = payload.costPoints || 0;
      const dateStr = new Date().toLocaleDateString("en-GB");

      return {
        subject: `Receipt: You redeemed "${rewardTitle}" at ${businessName}`,
        text: `Redemption Receipt:\n\nReward: ${rewardTitle}\nPoints Used: ${costPoints}\nBusiness: ${businessName}\nDate: ${dateStr}\n\nThank you for being a loyal customer!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a;">Redemption Receipt</h2>
            <p style="color: #334155; font-size: 15px;">Your reward has been successfully confirmed at <strong>${businessName}</strong>.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Reward:</span>
                <span style="font-weight: 600; color: #0f172a;">${rewardTitle}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Points Deducted:</span>
                <span style="font-weight: 600; color: #e11d48;">-${costPoints} pts</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Date:</span>
                <span style="color: #0f172a;">${dateStr}</span>
              </div>
            </div>
            <p style="color: #94a3b8; font-size: 12px;">This is a transactional confirmation for your records.</p>
          </div>
        `,
      };
    }
    case "feedback_received": {
      const businessName = String(payload.businessName || "Your Business");
      const customerEmail = String(payload.customerEmail || "Anonymous Member");
      const message = String(payload.message || "");

      return {
        subject: `New Customer Message: ${businessName}`,
        text: `New private feedback received from ${customerEmail}:\n\n"${message}"\n\nLog in to your dashboard to review and respond.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a;">New Customer Feedback</h2>
            <p style="color: #64748b; font-size: 14px;">From: <strong>${customerEmail}</strong></p>
            <div style="background-color: #f1f5f9; padding: 16px; border-left: 4px solid #4f46e5; border-radius: 4px; margin: 16px 0; font-size: 15px; color: #1e293b; line-height: 1.5;">
              "${message}"
            </div>
            <p style="color: #64748b; font-size: 13px;">You can view and mark this message as resolved in your Owner Dashboard.</p>
          </div>
        `,
      };
    }
    case "data_export_ready": {
      return {
        subject: `Your Personal Data Export from ${appName}`,
        text: `Your requested personal data export is attached or available in your profile. Under UK GDPR, you have the right to inspect your stored information.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #0f172a;">Your Data Export is Ready</h2>
            <p style="color: #334155; font-size: 15px;">In accordance with your Subject Access Request (UK GDPR Article 15), your personal loyalty records have been compiled into machine-readable JSON format.</p>
            <p style="color: #64748b; font-size: 13px;">You can download your export file at any time from your account settings at <a href="${env.APP_URL}/me" style="color: #4f46e5;">${env.APP_URL}/me</a>.</p>
          </div>
        `,
      };
    }
    default:
      return {
        subject: `Notification from ${appName}`,
        text: `You have received a new notification from ${appName}.`,
        html: `<p>You have received a new notification from ${appName}.</p>`,
      };
  }
}

/**
 * Creates SMTP transport targeting local Mailpit or configured SMTP server
 */
export function getMailTransporter() {
  const host =
    !env.SMTP_HOST || env.SMTP_HOST === "localhost"
      ? "127.0.0.1"
      : env.SMTP_HOST;

  return nodemailer.createTransport({
    host,
    port: env.SMTP_PORT || 1025,
    secure: false, // Port 1025 for Mailpit does not require TLS
    ignoreTLS: true,
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000,
  });
}

/**
 * Worker to process queued emails in batches per Section 10 & 16
 */
export async function processOutbox(batchSize: number = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();

  // Find eligible queued or retrying rows
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        or(eq(emailOutbox.status, "queued"), eq(emailOutbox.status, "failed")),
        lte(emailOutbox.nextAttemptAt, now),
        lte(emailOutbox.attempts, 5) // Max 5 retries before dead-letter
      )
    )
    .limit(batchSize);

  if (rows.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const transporter = getMailTransporter();
  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const rendered = renderEmailTemplate(
      row.template as EmailTemplate,
      row.payload as Record<string, unknown>
    );

    try {
      await transporter.sendMail({
        from: env.EMAIL_FROM_TRANSACTIONAL,
        to: row.toEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      await db
        .update(emailOutbox)
        .set({
          status: "sent",
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(emailOutbox.id, row.id));

      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "SMTP Send Error";
      const newAttempts = row.attempts + 1;
      const isDead = newAttempts >= 5;

      // Exponential backoff: 2^attempts minutes
      const nextAttempt = new Date(Date.now() + Math.pow(2, newAttempts) * 60 * 1000);

      await db
        .update(emailOutbox)
        .set({
          status: isDead ? "dead" : "failed",
          attempts: newAttempts,
          nextAttemptAt: nextAttempt,
          lastError: errorMsg,
        })
        .where(eq(emailOutbox.id, row.id));

      failedCount++;
      logger.error({ emailId: row.id, errorMsg, attempts: newAttempts }, "Failed to send email");
    }
  }

  return { processed: rows.length, sent: sentCount, failed: failedCount };
}
