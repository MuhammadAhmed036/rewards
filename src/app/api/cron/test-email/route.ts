import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { env } from "@/lib/env";
import { getMailTransporter } from "@/server/services/email";

export const maxDuration = 30;

/** Sends one real test email and returns the exact SMTP error, so a broken mail setup can be diagnosed. */
async function handleRequest(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const to = request.nextUrl.searchParams.get("to");
  if (!to) return NextResponse.json({ error: "Add ?to=you@example.com" }, { status: 400 });

  const config = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    hasPassword: Boolean(env.SMTP_PASS),
    from: env.EMAIL_FROM_TRANSACTIONAL,
  };
  const started = Date.now();
  try {
    const transporter = getMailTransporter();
    await transporter.verify();
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM_TRANSACTIONAL?.includes("example.com") ? env.SMTP_USER : env.EMAIL_FROM_TRANSACTIONAL || env.SMTP_USER,
      to,
      subject: "Test email",
      text: "If you can read this, email sending works.",
    });
    return NextResponse.json({ ok: true, ms: Date.now() - started, accepted: info.accepted, rejected: info.rejected, config });
  } catch (err) {
    const e = err as Error & { code?: string; response?: string; command?: string };
    return NextResponse.json(
      { ok: false, ms: Date.now() - started, code: e.code, command: e.command, response: e.response, message: e.message, config },
      { status: 500 }
    );
  }
}

export { handleRequest as GET, handleRequest as POST };
