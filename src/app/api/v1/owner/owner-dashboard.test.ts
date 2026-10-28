import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { joinProgramme } from "@/server/services/member";
import { earn, requestRedemption, confirmRedemption } from "@/server/services/ledger";
import { createReward } from "@/server/services/rewards";
import { recordLinkClick } from "@/server/services/links";
import { createSession, sessionLookupKey } from "@/server/auth";
import { db } from "@/server/db";
import { sessions, auditEvents } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { GET as overviewRoute } from "./overview/route";
import { GET as membersRoute } from "./members/route";
import {
  GET as memberDetailRoute,
  POST as memberAdjustRoute,
  PATCH as memberStatusRoute,
} from "./members/[membershipId]/route";
import { GET as ledgerGetRoute, POST as ledgerReverseRoute } from "./ledger/route";
import { POST as teamAddRoute, PATCH as teamUpdateRoute } from "./team/route";
import { GET as reportsExportRoute } from "./reports/export/route";
import { GET as auditRoute } from "./audit/route";
import { GET as qrRoute } from "./qr/route";
import { GET as linksGetRoute, PUT as linksPutRoute } from "./links/route";

describe("Owner Dashboard API & Reports (M7)", () => {
  it("provides comprehensive overview metrics, member adjustments, reversals, team management, and audited reports", async () => {
    const slug = `owner-biz-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Olivia",
      businessName: "Olivia's Bakery",
      slug,
      programmeType: "points",
    });

    const ownerToken = business.session.token;
    const tenantId = business.tenant.id;
    const locationId = business.location.id;

    // Join two members
    const member1 = await joinProgramme({
      tenantSlug: slug,
      email: `member1-${Date.now()}@test.com`,
      name: "Charlie Brown",
    });

    const member2 = await joinProgramme({
      tenantSlug: slug,
      email: `member2-${Date.now()}@test.com`,
      name: "Lucy Van Pelt",
    });
    expect(member2.membership.id).toBeDefined();

    const staffCtx = {
      userId: business.user.id,
      tenantId,
      locationId,
      role: "owner" as const,
      requestId: "test-req-owner",
    };

    // Member 1 earns 100 points
    const earnResult = await earn(staffCtx, {
      membershipId: member1.membership.id,
      locationId,
      amountMinor: 10000, // £100
      tipMinor: 0,
      idempotencyKey: `earn-test-${Date.now()}`,
    });
    expect(earnResult.pointsDelta).toBe(100);

    // Member 1 redeems a 40 point reward
    const reward = await createReward(staffCtx, {
      type: "free_item",
      title: "Free Scone",
      costPoints: 40,
    });

    const redeemReq = await requestRedemption(
      {
        userId: member1.membership.userId,
        tenantId,
        role: "customer" as const,
        requestId: "test-req-customer",
      },
      {
        membershipId: member1.membership.id,
        rewardId: reward.id,
      }
    );

    await confirmRedemption(staffCtx, {
      code: redeemReq.code,
      locationId,
      idempotencyKey: `redeem-confirm-${Date.now()}`,
    });

    // Track a link click
    const linksRes = await linksGetRoute(
      new NextRequest("http://localhost:3000/api/v1/owner/links", {
        headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
      })
    );
    const fetchedLinks = (await linksRes.json()).data;

    // Save exactly what the dashboard sends back (GET rows include locationId: null etc.)
    const publishRes = await linksPutRoute(
      new NextRequest("http://localhost:3000/api/v1/owner/links", {
        method: "PUT",
        headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId, "Content-Type": "application/json" },
        body: JSON.stringify(
          fetchedLinks.map((l: { type: string }) =>
            l.type === "google_review" ? { ...l, url: "https://g.page/r/owner-test/review", enabled: true } : l
          )
        ),
      })
    );
    expect(publishRes.status).toBe(200);
    const linksData = (await publishRes.json()).data.filter((l: { enabled: boolean }) => l.enabled);
    expect(linksData[0].url).toBe("https://g.page/r/owner-test/review");
    await recordLinkClick(linksData[0].id, { membershipId: member1.membership.id });

    // 1. Overview API
    const overviewReq = new NextRequest("http://localhost:3000/api/v1/owner/overview", {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
    });
    const overviewRes = await overviewRoute(overviewReq);
    expect(overviewRes.status).toBe(200);
    const overviewJson = await overviewRes.json();

    expect(overviewJson.data.totalMembers).toBe(2);
    expect(overviewJson.data.activeMembers30d).toBe(1); // member 1 had earn & redeem
    expect(overviewJson.data.outstandingPoints).toBe(60); // 100 - 40 = 60
    expect(overviewJson.data.earnsCount).toBe(1);
    expect(overviewJson.data.pointsAwarded).toBe(100);
    expect(overviewJson.data.redemptionsCount).toBe(1);
    expect(overviewJson.data.pointsRedeemed).toBe(40);
    if (linksData.length > 0) {
      expect(overviewJson.data.linkClicksTotal).toBeGreaterThanOrEqual(1);
    }

    // 2. Members List & Detail & Adjustment
    const membersReq = new NextRequest("http://localhost:3000/api/v1/owner/members?q=Charlie", {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
    });
    const membersRes = await membersRoute(membersReq);
    expect(membersRes.status).toBe(200);
    const membersJson = await membersRes.json();
    expect(membersJson.data.length).toBe(1);
    expect(membersJson.data[0].id).toBe(member1.membership.id);

    // Detail route
    const memberDetailReq = new NextRequest(
      `http://localhost:3000/api/v1/owner/members/${member1.membership.id}`,
      {
        headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
      }
    );
    const memberDetailRes = await memberDetailRoute(memberDetailReq, {
      params: Promise.resolve({ membershipId: member1.membership.id }),
    });
    expect(memberDetailRes.status).toBe(200);
    const memberDetailJson = await memberDetailRes.json();
    expect(memberDetailJson.data.member.balance).toBe(60);
    expect(memberDetailJson.data.history.length).toBeGreaterThanOrEqual(2);

    // Adjustment: add 15 points
    const adjustReq = new NextRequest(
      `http://localhost:3000/api/v1/owner/members/${member1.membership.id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          pointsDelta: 15,
          reasonCode: "goodwill",
          note: "Apology for delayed order",
        }),
      }
    );
    const adjustRes = await memberAdjustRoute(adjustReq, {
      params: Promise.resolve({ membershipId: member1.membership.id }),
    });
    expect(adjustRes.status).toBe(200);
    const adjustJson = await adjustRes.json();
    expect(adjustJson.data.newBalance).toBe(75);

    // Suspend member
    const statusReq = new NextRequest(
      `http://localhost:3000/api/v1/owner/members/${member1.membership.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          status: "suspended",
        }),
      }
    );
    const statusRes = await memberStatusRoute(statusReq, {
      params: Promise.resolve({ membershipId: member1.membership.id }),
    });
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.data.status).toBe("suspended");

    // 3. Transactions list & Reversal
    const ledgerReq = new NextRequest("http://localhost:3000/api/v1/owner/ledger", {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
    });
    const ledgerRes = await ledgerGetRoute(ledgerReq);
    expect(ledgerRes.status).toBe(200);
    const ledgerJson = await ledgerRes.json();
    expect(ledgerJson.data.length).toBeGreaterThanOrEqual(3);

    // Find original earn entry to reverse
    const earnEntry = ledgerJson.data.find(
      (r: { type: string; pointsDelta: number }) => r.type === "earn" && r.pointsDelta === 100
    );
    expect(earnEntry).toBeDefined();

    const reverseReq = new NextRequest("http://localhost:3000/api/v1/owner/ledger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        ledgerEntryId: earnEntry.id,
        reasonCode: "correction",
        note: "Mistaken transaction by staff",
      }),
    });
    const reverseRes = await ledgerReverseRoute(reverseReq);
    expect(reverseRes.status).toBe(200);
    const reverseJson = await reverseRes.json();
    expect(reverseJson.data.reversalEntryId).toBeDefined();
    expect(reverseJson.data.newBalance).toBe(0); // 75 - 100 = -25, floored at 0 per Decision 8

    // 4. Team Management: Invite, Change Role, Revoke, Session Invalidation
    const addStaffReq = new NextRequest("http://localhost:3000/api/v1/owner/team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        email: `staff-${Date.now()}@test.com`,
        name: "Sam Staff",
        role: "staff",
        locationIds: [locationId],
        temporaryPassword: "TemporaryPass123!",
      }),
    });
    const addStaffRes = await teamAddRoute(addStaffReq);
    expect(addStaffRes.status).toBe(200);
    const addStaffJson = await addStaffRes.json();
    const createdStaffId = addStaffJson.data.id;
    const createdStaffUserId = addStaffJson.data.userId;

    // Create an active session for this staff user to test invalidation
    const staffSession = await createSession(createdStaffUserId);
    const [foundSessionBefore] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, (await sessionLookupKey(staffSession.token))!));
    expect(foundSessionBefore).toBeDefined();

    // Revoke the staff member
    const revokeStaffReq = new NextRequest("http://localhost:3000/api/v1/owner/team", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        staffMemberId: createdStaffId,
        status: "revoked",
      }),
    });
    const revokeStaffRes = await teamUpdateRoute(revokeStaffReq);
    expect(revokeStaffRes.status).toBe(200);

    // Verify session invalidation!
    const [foundSessionAfter] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, (await sessionLookupKey(staffSession.token))!));
    expect(foundSessionAfter).toBeUndefined();

    // 5. Audited CSV Reports Export
    for (const reportType of ["ledger", "members", "redemptions"]) {
      const exportReq = new NextRequest(
        `http://localhost:3000/api/v1/owner/reports/export?type=${reportType}`,
        {
          headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
        }
      );
      const exportRes = await reportsExportRoute(exportReq);
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get("Content-Type")).toContain("text/csv");
      const csvText = await exportRes.text();
      expect(csvText.length).toBeGreaterThan(0);
      expect(csvText.split("\n").length).toBeGreaterThanOrEqual(2);
    }

    // Verify audit events recorded for reports export
    const auditEventsRows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId));
    const exportAuditEvents = auditEventsRows.filter((e) => e.action === "reports.exported");
    expect(exportAuditEvents.length).toBe(3);

    // 6. Audit Log API
    const auditReq = new NextRequest("http://localhost:3000/api/v1/owner/audit", {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
    });
    const auditRes = await auditRoute(auditReq);
    expect(auditRes.status).toBe(200);
    const auditJson = await auditRes.json();
    expect(auditJson.data.length).toBeGreaterThanOrEqual(3);

    // 7. QR Poster Route
    const qrReq = new NextRequest("http://localhost:3000/api/v1/owner/qr", {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-tenant-id": tenantId },
    });
    const qrRes = await qrRoute(qrReq);
    expect(qrRes.status).toBe(200);
    const qrJson = await qrRes.json();
    expect(qrJson.data.joinUrl).toContain(`/b/${slug}`);
    expect(qrJson.data.qrPng).toMatch(/^data:image\/png;base64,/);
    expect(qrJson.data.qrSvg).toContain("<svg");
  });
});
