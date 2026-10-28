import { NextRequest, NextResponse } from "next/server";
import { joinProgramme } from "@/server/services/member";
import { createSession, sessionKindForUser, verifyPassword } from "@/server/auth";
import { isBusinessAccount } from "@/server/auth/portal-access";
import { db } from "@/server/db";
import { users, tenants, memberships } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { setSessionCookie } from "@/server/auth/session-response";
import { checkJoinRateLimit, getClientIp, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

const joinSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  name: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
  locationPublicId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    await checkJoinRateLimit(clientIp);

    const body = await request.json();
    const validated = joinSchema.parse(body);

    // One email is one kind of account: business emails can't become customer cards,
    // and an existing customer proves it's them (password) before adding this shop's card.
    const email = validated.email.toLowerCase().trim();
    const [existing] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let allowExistingUser = false;
    if (existing) {
      if (await isBusinessAccount(existing.id)) {
        return NextResponse.json(
          {
            error: {
              code: "BUSINESS_ACCOUNT",
              message:
                "This email is used for a business account (owner or staff), so it can't be a customer card. Join with a different email.",
            },
          },
          { status: 409 }
        );
      }
      const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, validated.tenantSlug.toLowerCase().trim())).limit(1);
      if (tenant) {
        const [already] = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, existing.id), eq(memberships.tenantId, tenant.id)))
          .limit(1);
        if (already) {
          return NextResponse.json(
            { error: { code: "ACCOUNT_ALREADY_EXISTS", message: "You already have a card at this shop. Sign in instead." } },
            { status: 409 }
          );
        }
      }
      const passwordOk =
        Boolean(existing.passwordHash && validated.password) &&
        (await verifyPassword(validated.password!, existing.passwordHash!));
      if (!passwordOk) {
        return NextResponse.json(
          {
            error: {
              code: "ACCOUNT_ALREADY_EXISTS",
              message:
                "This email already has a customer account. Enter that account's password to add this shop's card.",
            },
          },
          { status: 409 }
        );
      }
      allowExistingUser = true;
    }

    const result = await joinProgramme({ ...validated, allowExistingUser });

    // Create customer session
    const session = await createSession(result.membership.userId, await sessionKindForUser(result.membership.userId));

    const response = NextResponse.json({ data: result });
    setSessionCookie(response, session);

    return response;
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    const msg = err instanceof Error ? err.message : "Failed to join programme";
    const isDuplicate = msg.toLowerCase().includes("already exists");
    return NextResponse.json(
      {
        error: {
          code: isDuplicate ? "ACCOUNT_ALREADY_EXISTS" : "JOIN_FAILED",
          message: msg,
        },
      },
      { status: isDuplicate ? 409 : 400 }
    );
  }
}

