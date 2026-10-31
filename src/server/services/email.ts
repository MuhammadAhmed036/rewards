import { db } from "../db";
import { emailOutbox } from "../db/schema";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { logger } from "@/lib/logger";
import { eq, and, lte, or, inArray, asc } from "drizzle-orm";
import { isSuppressed, recordEmailEvent, suppressEmail } from "./email-events";
import nodemailer, { type SendMailOptions } from "nodemailer";

export type EmailTemplate =
  | "magic_link"
  | "staff_invitation"
  | "welcome"
  | "reward_unlocked"
  | "redemption_receipt"
  | "feedback_received"
  | "data_export_ready"
  | "owner_business_registered"
  | "email_verification"
  | "password_reset"
  | "security_code"
  | "campaign"
  | "points_expiring";

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

/** Footer for emails about a customer's card: why they got it and a one-click way to stop them. */
function footerHtml(payload: Record<string, unknown>) {
  const businessName = String(payload.businessName || "this shop");
  return payload.unsubscribeUrl
    ? `You're getting this because you have a ${businessName} loyalty card. <a href="${String(payload.unsubscribeUrl)}" style="color:#495e57;">Stop these emails</a>.`
    : `You're getting this because you have a ${businessName} loyalty card.`;
}
function footerText(payload: Record<string, unknown>) {
  return payload.unsubscribeUrl ? `\n\nStop these emails: ${String(payload.unsubscribeUrl)}` : "";
}

/** A plain, single-button email in the platform's colours. */
function buttonEmail(title: string, body: string, button: string, url: string, footnote: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #26302d;">
      <h2 style="margin: 0 0 12px;">${title}</h2>
      <p style="line-height: 1.5; font-size: 16px; color: #45474b;">${body}</p>
      <p style="margin: 28px 0;">
        <a href="${url}" style="background: #495e57; color: #ffffff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; display: inline-block;">${button}</a>
      </p>
      <p style="font-size: 13px; color: #6c7476;">${footnote}<br/>If the button doesn't work, copy this link: <span style="color: #495e57;">${url}</span></p>
    </div>
  `;
}

/**
 * Queue an email and send it straight away. `sent` says whether it actually went out;
 * if not, the outbox keeps it and retries later.
 */
export async function sendEmailNow(options: QueueEmailOptions) {
  const entry = await queueEmail(options);
  let sent = false;
  try {
    const result = await processOutbox(1, { ids: [entry.id] });
    sent = result.sent > 0;
  } catch (err) {
    logger.error({ err }, "Immediate email send crashed; queued for retry");
  }
  // The mail server is answering, so use this moment to clear a few emails an earlier hiccup left waiting.
  // (Scheduled retries only run once a day on this hosting plan.)
  if (sent) {
    await processOutbox(3).catch((err) => logger.warn({ err }, "Clearing waiting emails failed"));
    // Same idea for offers scheduled for a time that has now passed
    const { runDueCampaigns } = await import("./campaigns");
    await runDueCampaigns().catch((err) => logger.warn({ err }, "Sending due offers failed"));
  }
  return { ...entry, sent };
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Text a shop owner or customer typed is made harmless for the HTML version; the links we build ourselves are left alone. */
function escapePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = typeof value === "string" && !/url$/i.test(key) ? escapeHtml(value) : value;
  }
  return out;
}

/**
 * Builds the subject, plain text and HTML of an email. The plain text and subject use the words as typed; the
 * HTML version escapes them first, so a business named `<a href=...>` can't put its own links or markup
 * into an email we send to its customers.
 */
export function renderEmailTemplate(
  template: EmailTemplate,
  payload: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const plain = renderEmailRaw(template, payload);
  // Offers escape their own text while building the page, so they are not escaped twice
  if (template === "campaign") return plain;
  return { ...plain, html: renderEmailRaw(template, escapePayload(payload)).html };
}

function renderEmailRaw(
  template: EmailTemplate,
  payload: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const appName = env.NEXT_PUBLIC_APP_NAME || "Loyalty Platform";
  const appUrl = getBaseUrl();

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
    case "email_verification": {
      const url = String(payload.url || "#");
      return {
        subject: `Confirm your email for ${appName}`,
        text: `Confirm your email address by opening this link:

${url}

The link works for 24 hours. If you didn't create an account, ignore this email.`,
        html: buttonEmail(
          "Confirm your email",
          "Tap the button to confirm this is your email address. The link works for 24 hours.",
          "Confirm my email",
          url,
          "If you didn't create an account, you can ignore this email."
        ),
      };
    }
    case "password_reset": {
      const url = String(payload.url || "#");
      return {
        subject: `Reset your ${appName} password`,
        text: `Someone asked to reset the password for this email address. To choose a new password, open:

${url}

The link works for 30 minutes and only once. If it wasn't you, ignore this email and your password stays the same.`,
        html: buttonEmail(
          "Reset your password",
          "Someone asked to reset the password for this email address. The link works for 30 minutes and only once.",
          "Choose a new password",
          url,
          "If it wasn't you, ignore this email. Your password stays the same."
        ),
      };
    }
    case "security_code": {
      const code = String(payload.code || "");
      const reason =
        payload.purpose === "login" ? "sign in" : payload.purpose === "mfa_enable" ? "turn on sign-in codes" : "confirm a sensitive action";
      return {
        subject: `Your ${appName} code: ${code}`,
        text: `Your code to ${reason} is ${code}.

It works once, for 10 minutes. If you didn't ask for it, ignore this email and consider changing your password.`,
        html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #26302d;">
      <h2 style="margin: 0 0 12px;">Your code</h2>
      <p style="line-height: 1.5; font-size: 16px; color: #45474b;">Use this code to ${reason}. It works once, for 10 minutes.</p>
      <p style="margin: 24px 0; font-size: 34px; letter-spacing: 8px; font-weight: 700; color: #495e57;">${code}</p>
      <p style="font-size: 13px; color: #6c7476;">If you didn't ask for it, ignore this email and consider changing your password.</p>
    </div>
  `,
      };
    }
    case "staff_invitation": {
      const businessName = String(payload.businessName || "your business");
      const role = String(payload.role || "staff");
      const url = String(payload.url || `${appUrl}/login`);
      const isNewAccount = payload.isNewAccount !== false;
      const roleWord = role === "manager" ? "a manager" : role === "marketing" ? "the marketing team" : "staff";
      return {
        subject: `${businessName} added you as ${roleWord}`,
        text: isNewAccount
          ? `${businessName} wants you to use their loyalty scanner as ${roleWord}. Choose your password here (the link works for 7 days):\n\n${url}`
          : `${businessName} added you as ${roleWord}. Sign in with your usual email and password:\n\n${url}`,
        html: buttonEmail(
          `Join ${businessName}`,
          isNewAccount
            ? `${businessName} wants you to use their loyalty scanner as ${roleWord}: scan customers' cards, add points and hand out rewards. Choose a password to get started. The link works for 7 days.`
            : `${businessName} added you as ${roleWord}. Sign in with the email and password you already use.`,
          isNewAccount ? "Choose my password" : "Sign in",
          url,
          "If you weren't expecting this, you can ignore this email."
        ),
      };
    }
    case "welcome": {
      const businessName = String(payload.businessName || "the shop");
      const url = String(payload.hubUrl || appUrl);
      const rule = payload.earningRule ? ` You get ${String(payload.earningRule)}.` : "";
      return {
        subject: `Your ${businessName} loyalty card is ready`,
        text: `Welcome! Your card for ${businessName} is ready.${rule} Show the QR code on your card when you pay:\n\n${url}\n\nYour customer ID is ${String(payload.memberNumber || "")}.${footerText(payload)}`,
        html: buttonEmail(
          `Your ${businessName} card is ready`,
          `Show the QR code on your card when you pay, or tell staff your customer ID: <strong>${String(payload.memberNumber || "")}</strong>.${rule}`,
          "Open my card",
          url,
          footerHtml(payload)
        ),
      };
    }
    case "owner_business_registered": {
      const ownerName = String(payload.ownerName || "Business Owner");
      const businessName = String(payload.businessName || "Your Store");
      const category = String(payload.category || "Commercial");
      const storeUrl = String(payload.storeUrl || `${appUrl}`);

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
    case "points_expiring": {
      const businessName = String(payload.businessName || "the shop");
      const unit = String(payload.unit || "points");
      const url = String(payload.hubUrl || appUrl);
      const when = new Date(String(payload.expiresOn)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      return {
        subject: `Your ${businessName} ${unit} expire on ${when}`,
        text: `You have ${String(payload.balance)} ${unit} at ${businessName}. They'll expire on ${when} unless you visit before then. Any visit that earns or spends ${unit} keeps them.\n\n${url}${footerText(payload)}`,
        html: buttonEmail(
          `Your ${unit} expire on ${when}`,
          `You have <strong>${String(payload.balance)} ${unit}</strong> at ${businessName}. Visit before ${when} and earn or spend something to keep them.`,
          "See what I can get",
          url,
          footerHtml(payload)
        ),
      };
    }
    case "campaign": {
      const businessName = String(payload.businessName || "the shop");
      const subject = String(payload.subject || `News from ${businessName}`);
      const body = String(payload.body || "");
      // clickUrl is a tracked link to the same place (added when the email is sent)
      const url = String(payload.clickUrl || payload.hubUrl || appUrl);
      const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const paragraphs = escape(body)
        .split(/\n{2,}/)
        .map((p) => `<p style="line-height:1.5;font-size:16px;color:#45474b;">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
      const optOut = payload.unsubscribeUrl
        ? `<a href="${String(payload.unsubscribeUrl)}" style="color:#495e57;">${String(payload.unsubscribeLabel || "Stop these emails")}</a>`
        : "";
      return {
        subject,
        text: `${body}

Open your card: ${url}

You're getting this because you said yes to offers from ${businessName}.${payload.unsubscribeUrl ? ` Stop offers: ${String(payload.unsubscribeUrl)}` : ""}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #26302d;">
            <p style="font-size:13px;color:#6c7476;margin:0 0 8px;">${escape(businessName)}</p>
            <h2 style="margin: 0 0 12px;">${escape(subject)}</h2>
            ${paragraphs}
            <p style="margin: 28px 0;"><a href="${url}" style="background:#495e57;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Open my card</a></p>
            <p style="font-size:13px;color:#6c7476;">You're getting this because you said yes to offers from ${escape(businessName)}. ${optOut}</p>
          </div>
        `,
      };
    }
    case "reward_unlocked": {
      const businessName = String(payload.businessName || "the shop");
      const title = String(payload.rewardTitle || "a reward");
      const url = String(payload.hubUrl || appUrl);
      return {
        subject: `You can now get ${title} at ${businessName}`,
        text: `You have ${String(payload.balance)} ${String(payload.unit || "points")} at ${businessName}, enough for ${title}. Claim it on your card next time you visit:\n\n${url}${footerText(payload)}`,
        html: buttonEmail(
          `${title} is yours to claim`,
          `You have <strong>${String(payload.balance)} ${String(payload.unit || "points")}</strong> at ${businessName}, enough for ${title}. Claim it on your card, or just ask the staff next time you visit.`,
          "See my card",
          url,
          footerHtml(payload)
        ),
      };
    }
    case "redemption_receipt": {
      const businessName = String(payload.businessName || "the shop");
      const title = String(payload.rewardTitle || "your reward");
      const url = String(payload.hubUrl || appUrl);
      const unit = String(payload.unit || "points");
      return {
        subject: `Receipt: ${title} at ${businessName}`,
        text: `You used ${String(payload.costPoints)} ${unit} on ${title} at ${businessName}. You have ${String(payload.newBalance ?? "")} ${unit} left. If this wasn't you, tell the shop from your card:\n\n${url}${footerText(payload)}`,
        html: buttonEmail(
          `Enjoy your ${title}`,
          `You used <strong>${String(payload.costPoints)} ${unit}</strong> at ${businessName} and have <strong>${String(payload.newBalance ?? "")}</strong> left. If this wasn't you, use &ldquo;Something not right?&rdquo; on your card.`,
          "See my card",
          url,
          footerHtml(payload)
        ),
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
            <p style="color: #64748b; font-size: 13px;">You can download your export file at any time from your account settings at <a href="${appUrl}/me" style="color: #4f46e5;">${appUrl}/me</a>.</p>
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

/** A refused login or address won't get better by trying again; a dropped connection or timeout might. */
function isTemporarySmtpError(err: unknown) {
  const e = err as { code?: string; responseCode?: number };
  if (e.code === "EAUTH" || e.code === "EENVELOPE") return false;
  if (typeof e.responseCode === "number" && e.responseCode >= 500 && e.responseCode < 600) return false;
  return true;
}

/** The mail server said this address does not exist or refuses mail: retrying will never help. */
function isHardBounce(err: unknown) {
  const e = err as { responseCode?: number };
  return typeof e.responseCode === "number" && [550, 551, 553, 554].includes(e.responseCode);
}

/** One quick second try for a temporary hiccup, so a blip doesn't push an email to the next retry run. */
async function sendMailWithRetry(transporter: ReturnType<typeof nodemailer.createTransport>, message: SendMailOptions) {
  try {
    return await transporter.sendMail(message);
  } catch (err) {
    if (!isTemporarySmtpError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await transporter.sendMail(message);
  }
}

/**
 * Creates SMTP transport targeting local Mailpit or configured SMTP server
 */
export function getMailTransporter() {
  const smtpHost = env.SMTP_HOST?.trim();
  const host = !smtpHost || smtpHost === "localhost" ? "127.0.0.1" : smtpHost;
  const smtpUser = env.SMTP_USER?.trim();
  // Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of the password
  const smtpPass = (env.SMTP_PASS ?? "").replace(/\s+/g, "");

  const port = env.SMTP_PORT || 1025;
  // If port is 465, secure is true by default; for 587 or 25, STARTTLS (secure = false)
  const isSecure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    ignoreTLS: !smtpUser && host === "127.0.0.1",
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

/**
 * Worker to process queued emails in batches per Section 10 & 16
 */
export async function processOutbox(
  batchSize: number = 20,
  options: { ids?: string[] } = {}
): Promise<{
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
        lte(emailOutbox.attempts, 5), // Max 5 retries before dead-letter
        // "Send this now" targets specific emails, so a backlog can't delay a password reset
        options.ids?.length ? inArray(emailOutbox.id, options.ids) : undefined
      )
    )
    .orderBy(asc(emailOutbox.createdAt)) // oldest first, so nothing waits forever
    .limit(batchSize);

  if (rows.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const transporter = getMailTransporter();
  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    // Offers never go to an address that bounced or complained before
    if (row.kind === "marketing" && (await isSuppressed(row.toEmail))) {
      await db.update(emailOutbox).set({ status: "dead", lastError: "Address is on the suppression list" }).where(eq(emailOutbox.id, row.id));
      const { emitEvent } = await import("./events");
      await emitEvent(row.tenantId, "campaign.suppressed", { campaignId: (row.payload as { campaignId?: string }).campaignId ?? null, reason: "suppression_list" });
      continue;
    }
    const payload = row.template === "campaign" ? { ...(row.payload as Record<string, unknown>), clickUrl: `${getBaseUrl()}/e/c/${row.id}` } : (row.payload as Record<string, unknown>);
    const rendered = renderEmailTemplate(row.template as EmailTemplate, payload);

    try {
      const fromEmail =
        env.EMAIL_FROM_TRANSACTIONAL && !env.EMAIL_FROM_TRANSACTIONAL.includes("example.com")
          ? env.EMAIL_FROM_TRANSACTIONAL.trim()
          : env.SMTP_USER?.trim() || "no-reply@rewards-program-xi.vercel.app";

      await sendMailWithRetry(transporter, {
        from: fromEmail,
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
          // A sign-in code has done its job once emailed; don't keep it readable in the outbox
          ...(row.template === "security_code" ? { payload: { purpose: (row.payload as { purpose?: string }).purpose } } : {}),
        })
        .where(eq(emailOutbox.id, row.id));

      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "SMTP Send Error";
      const newAttempts = row.attempts + 1;
      const hardBounce = isHardBounce(err);
      const isDead = newAttempts >= 5 || hardBounce;
      if (hardBounce) {
        await suppressEmail(row.toEmail, "bounce");
        await recordEmailEvent({
          type: "bounce",
          tenantId: row.tenantId,
          outboxId: row.id,
          campaignId: (row.payload as { campaignId?: string }).campaignId ?? null,
          detail: errorMsg,
        });
      }

      // Exponential backoff: 1, 2, 4, 8 minutes
      const nextAttempt = new Date(Date.now() + Math.pow(2, newAttempts - 1) * 60 * 1000);

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
