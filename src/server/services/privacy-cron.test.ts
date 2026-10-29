import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { createSession, sessionLookupKey } from "../auth";
import { env } from "@/lib/env";
import { db } from "../db";
import { users, sessions, emailOutbox } from "../db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import {
  getCustomerPrivacyData,
  updateMarketingConsent,
  exportUserDataJson,
  deleteAndAnonymiseAccount,
} from "./privacy";
import { queueEmail, processOutbox } from "./email";

import { POST as expireCronRoute } from "@/app/api/cron/expire-redemptions/route";
import { POST as outboxCronRoute } from "@/app/api/cron/send-outbox/route";
import { POST as reconcileCronRoute } from "@/app/api/cron/reconcile-balances/route";
import { POST as retentionCronRoute } from "@/app/api/cron/retention/route";

describe("Privacy Compliance, Email Outbox & Maintenance Crons (M9)", () => {
  it("enforces UK GDPR privacy rights, marketing consent withdrawal, and data anonymisation", async () => {
    const slug = `privacy-biz-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `privacy-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Pam",
      businessName: "Pam's Pottery",
      slug,
      programmeType: "points",
    });
    expect(business.tenant.id).toBeDefined();

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `gdpr-customer-${Date.now()}@test.com`,
      name: "David Miller",
      marketingOptIn: true,
    });

    const userId = member.membership.userId;
    const membershipId = member.membership.id;

    // 1. Fetch privacy data
    const privacyData = await getCustomerPrivacyData(userId);
    expect(privacyData.user.email).toContain("gdpr-customer");
    expect(privacyData.memberships.length).toBe(1);
    expect(privacyData.memberships[0].marketingOptIn).toBe(true);
    expect(privacyData.consents.length).toBeGreaterThanOrEqual(1);

    // 2. Withdraw marketing consent
    const updatedMembership = await updateMarketingConsent(userId, {
      membershipId,
      granted: false,
      source: "privacy_test",
    });
    expect(updatedMembership.marketingOptIn).toBe(false);

    const reloadedPrivacy = await getCustomerPrivacyData(userId);
    expect(reloadedPrivacy.memberships[0].marketingOptIn).toBe(false);

    // 3. Subject Access Request Export (JSON)
    const exportData = await exportUserDataJson(userId);
    expect(exportData.regulations).toContain("UK GDPR");
    expect(
      (exportData.memberships as Array<{ memberNumber: string }>)[0].memberNumber
    ).toBe(member.membership.memberNumber);

    // 4. Create active session to test session invalidation on deletion
    const userSession = await createSession(userId);
    const [sessionBefore] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, (await sessionLookupKey(userSession.token))!));
    expect(sessionBefore).toBeDefined();

    // 5. Account deletion and anonymisation
    const deleteResult = await deleteAndAnonymiseAccount(userId);
    expect(deleteResult.success).toBe(true);

    const [userAfter] = await db.select().from(users).where(eq(users.id, userId));
    expect(userAfter.name).toBe("Anonymised Customer");
    expect(userAfter.email).toMatch(/^deleted-[a-f0-9]+@anonymised\.local$/);
    expect(userAfter.passwordHash).toBeNull();

    // Sessions invalidated immediately
    const [sessionAfter] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, (await sessionLookupKey(userSession.token))!));
    expect(sessionAfter).toBeUndefined();
  });

  it("queues and processes email outbox via SMTP", async () => {
    // 1. Queue an email
    const email = await queueEmail({
      toEmail: "test-recipient@example.com",
      template: "welcome",
      payload: {
        businessName: "Test Bakery",
        memberNumber: "ABCD1234",
        hubUrl: "http://localhost:3000/b/test-bakery",
      },
    });
    expect(email.status).toBe("queued");

    // 2. Process outbox (delivers to local Mailpit container on port 1025)
    // Target this email: other tests leave queued emails behind, and the queue runs oldest first
    const result = await processOutbox(10, { ids: [email.id] });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const [updatedEmail] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, email.id));
    expect(updatedEmail.status).toBe("sent");
    expect(updatedEmail.sentAt).toBeDefined();
  });

  it("protects and executes scheduled maintenance cron handlers", async () => {
    const cronSecret = env.CRON_SECRET;

    // 1. Reject without valid CRON_SECRET (401)
    const unauthReq = new NextRequest("http://localhost:3000/api/cron/expire-redemptions", {
      method: "POST",
      headers: { Authorization: "Bearer bad-token" },
    });
    const unauthRes = await expireCronRoute(unauthReq);
    expect(unauthRes.status).toBe(401);

    const validHeaders = { Authorization: `Bearer ${cronSecret}` };

    // 2. /api/cron/expire-redemptions
    const expireReq = new NextRequest("http://localhost:3000/api/cron/expire-redemptions", {
      method: "POST",
      headers: validHeaders,
    });
    const expireRes = await expireCronRoute(expireReq);
    expect(expireRes.status).toBe(200);
    const expireJson = await expireRes.json();
    expect(expireJson.success).toBe(true);

    // 3. /api/cron/send-outbox
    const outboxReq = new NextRequest("http://localhost:3000/api/cron/send-outbox", {
      method: "POST",
      headers: validHeaders,
    });
    const outboxRes = await outboxCronRoute(outboxReq);
    expect(outboxRes.status).toBe(200);
    const outboxJson = await outboxRes.json();
    expect(outboxJson.success).toBe(true);

    const testBiz = await registerOwnerAndTenant({
      email: `reconcile-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Reconcile",
      businessName: "Reconcile Shop",
      slug: `reconcile-shop-${Date.now()}`,
      programmeType: "points",
    });

    // 4. /api/cron/reconcile-balances
    const reconcileReq = new NextRequest(
      `http://localhost:3000/api/cron/reconcile-balances?tenantId=${testBiz.tenant.id}`,
      {
        method: "POST",
        headers: validHeaders,
      }
    );
    const reconcileRes = await reconcileCronRoute(reconcileReq);
    expect(reconcileRes.status).toBe(200);
    const reconcileJson = await reconcileRes.json();
    expect(reconcileJson.success).toBe(true);
    expect(reconcileJson.isConsistent).toBe(true);

    // 5. /api/cron/retention
    const retentionReq = new NextRequest("http://localhost:3000/api/cron/retention", {
      method: "POST",
      headers: validHeaders,
    });
    const retentionRes = await retentionCronRoute(retentionReq);
    expect(retentionRes.status).toBe(200);
    const retentionJson = await retentionRes.json();
    expect(retentionJson.success).toBe(true);
  });
});
