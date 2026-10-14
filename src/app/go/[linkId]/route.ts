import { NextRequest, NextResponse } from "next/server";
import { recordLinkClick } from "@/server/services/links";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { sessions, memberships } from "@/server/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ linkId: string }> }
) {
  const params = await props.params;
  const linkId = params.linkId;

  try {
    // Check if customer session cookie exists
    const cookieStore = await cookies();
    const token = cookieStore.get("loyalty_session")?.value;
    let membershipId: string | undefined = undefined;

    if (token) {
      const now = new Date();
      const sessionRows = await db
        .select({
          userId: sessions.userId,
        })
        .from(sessions)
        .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
        .limit(1);

      if (sessionRows.length > 0) {
        const memberRows = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.userId, sessionRows[0].userId))
          .limit(1);
        if (memberRows.length > 0) {
          membershipId = memberRows[0].id;
        }
      }
    }

    const rawUserAgent = request.headers.get("user-agent") || undefined;

    // Record click and retrieve stored target URL
    const destinationUrl = await recordLinkClick(linkId, {
      membershipId,
      rawUserAgent,
    });

    // 302 Redirect with Referrer-Policy: no-referrer per Section 11.3
    const response = NextResponse.redirect(destinationUrl, { status: 302 });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Link Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; }
            .card { background: white; padding: 2rem; border-radius: 1rem; border: 1px solid #e2e8f0; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
            p { font-size: 0.95rem; color: #64748b; margin-bottom: 1.5rem; }
            a { display: inline-block; background: #0f172a; color: white; padding: 0.75rem 1.5rem; border-radius: 0.75rem; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Link Not Found</h1>
            <p>This business link is either disabled or no longer available.</p>
            <a href="/">Return Home</a>
          </div>
        </body>
      </html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

