import { describe, it, expect } from "vitest";
import {
  getVisibleLinks,
  validateLinkUrl,
  recordLinkClick,
  getLinkClickAnalytics,
  updateBusinessLinks,
  getAllTenantLinks,
} from "./links";
import { submitFeedback, getFeedbackMessages, updateFeedbackStatus } from "./feedback";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { feedbackMessages, linkClickEvents } from "../db/schema";
import { eq } from "drizzle-orm";

// New businesses start with their buttons switched off; tests publish a real link first.
async function publishGoogleLink(business: { user: { id: string }; tenant: { id: string } }, url = "https://g.page/r/test-business/review") {
  const ctx: RequestContext = { userId: business.user.id, tenantId: business.tenant.id, role: "owner", requestId: "req-links" };
  await updateBusinessLinks(ctx, [
    { type: "google_review", label: "Leave a Google review", url, enabled: true, sortOrder: 1 },
    { type: "instagram", label: "Follow on Instagram", url: "", enabled: false, sortOrder: 2 },
  ]);
  return ctx;
}

describe("Anti-Gating, Review Rules, and Tracked Links (M6)", () => {
  describe("Non-Negotiable Review Rule (NO REVIEW GATING) per Section 1.2 & 11.2", () => {
    it("enforces that getVisibleLinks signature DOES NOT take feedback, rating, sentiment, points, or tier", () => {
      // Signature test required by Section 1.2:
      // Fails if the function takes any feedback/rating/sentiment/points/tier parameter
      expect(getVisibleLinks.length).toBeLessThanOrEqual(2); // Only (tenantId, locationId?)
    });

    it("renders the exact same Google review link regardless of feedback submission", async () => {
      const slug = `anti-gating-${Date.now()}`;
      const business = await registerOwnerAndTenant({
        email: `anti-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Owner",
        businessName: "Fair Business",
        slug,
      });
      await publishGoogleLink(business);

      // Member 1: Never submitted feedback
      await joinProgramme({
        tenantSlug: slug,
        email: `member1-${Date.now()}@example.com`,
      });

      // Member 2: Submitted a negative feedback message
      const member2 = await joinProgramme({
        tenantSlug: slug,
        email: `member2-${Date.now()}@example.com`,
      });

      await submitFeedback({
        tenantId: business.tenant.id,
        membershipId: member2.membership.id,
        message: "I was unhappy with my coffee temperature today.",
      });

      // Both members query the visible links for this business
      const linksForMember1 = await getVisibleLinks(business.tenant.id);
      const linksForMember2 = await getVisibleLinks(business.tenant.id);

      // Verify Google review button is identical for both
      const googleLink1 = linksForMember1.find((l) => l.type === "google_review");
      const googleLink2 = linksForMember2.find((l) => l.type === "google_review");

      expect(googleLink1).toBeDefined();
      expect(googleLink2).toBeDefined();
      expect(googleLink1?.url).toBe(googleLink2?.url);
      expect(googleLink1?.label).toBe(googleLink2?.label);
    });

    it("verifies feedback_messages table has NO rating column by design", () => {
      // Database schema verification
      expect((feedbackMessages as unknown as { rating?: unknown }).rating).toBeUndefined();
    });
  });

  describe("Strict Link URL Validation per Section 11.1", () => {
    it("accepts valid HTTPS Google review URLs from allowed domains", () => {
      expect(validateLinkUrl("google_review", "https://g.page/r/example/review").valid).toBe(true);
      expect(validateLinkUrl("google_review", "https://search.google.com/local/writereview?placeid=123").valid).toBe(true);
      expect(validateLinkUrl("google_review", "https://maps.app.goo.gl/xyz123").valid).toBe(true);
      expect(validateLinkUrl("google_review", "https://goo.gl/maps/abc").valid).toBe(true);
    });

    it("rejects insecure HTTP, credentials, or untrusted domains for Google reviews", () => {
      expect(validateLinkUrl("google_review", "http://g.page/review").valid).toBe(false);
      expect(validateLinkUrl("google_review", "https://user:pass@google.com/review").valid).toBe(false);
      expect(validateLinkUrl("google_review", "https://attacker-fake-google.com/review").valid).toBe(false);
      expect(validateLinkUrl("google_review", "javascript:alert(1)").valid).toBe(false);
    });

    it("validates Instagram and Facebook domains strictly", () => {
      expect(validateLinkUrl("instagram", "https://instagram.com/mybarber").valid).toBe(true);
      expect(validateLinkUrl("instagram", "https://tiktok.com/mybarber").valid).toBe(false);

      expect(validateLinkUrl("facebook", "https://facebook.com/mybarber").valid).toBe(true);
      expect(validateLinkUrl("facebook", "https://fb.me/mybarber").valid).toBe(true);
      expect(validateLinkUrl("facebook", "https://other.com/mybarber").valid).toBe(false);
    });
  });

  describe("Tracked Redirect & Analytics per Section 11.3 & 11.5", () => {
    it("records link click event with sanitised user agent and NO IP address", async () => {
      const slug = `track-${Date.now()}`;
      const business = await registerOwnerAndTenant({
        email: `track-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Owner",
        businessName: "Tracking Biz",
        slug,
      });
      await publishGoogleLink(business);

      const member = await joinProgramme({
        tenantSlug: slug,
        email: `clicker-${Date.now()}@example.com`,
      });

      const links = await getVisibleLinks(business.tenant.id);
      const googleLink = links.find((l) => l.type === "google_review")!;

      // Click link
      const targetUrl = await recordLinkClick(googleLink.id, {
        membershipId: member.membership.id,
        rawUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });

      expect(targetUrl).toBe(googleLink.url);

      // Verify click event in database
      const [clickRow] = await db
        .select()
        .from(linkClickEvents)
        .where(eq(linkClickEvents.linkId, googleLink.id));

      expect(clickRow).toBeDefined();
      expect(clickRow.userAgentFamily).toBe("Mobile");
      // Check no IP field exists in schema
      expect((clickRow as unknown as { ipAddress?: unknown }).ipAddress).toBeUndefined();

      // Check Analytics
      const ownerCtx: RequestContext = {
        userId: business.user.id,
        tenantId: business.tenant.id,
        role: "owner",
        requestId: "req-analytics",
      };

      const analytics = await getLinkClickAnalytics(ownerCtx);
      const googleStats = analytics.find((a) => a.linkId === googleLink.id);
      expect(googleStats?.totalClicks).toBe(1);
      expect(googleStats?.uniqueMembers).toBe(1);
    });
  });

  describe("Private Feedback Form & Owner Inbox", () => {
    it("allows customer to submit feedback and owner to manage status", async () => {
      const slug = `fb-${Date.now()}`;
      const business = await registerOwnerAndTenant({
        email: `fb-${Date.now()}@test.com`,
        password: "Password123!",
        name: "Owner",
        businessName: "Feedback Biz",
        slug,
      });

      const member = await joinProgramme({
        tenantSlug: slug,
        email: `fbcust-${Date.now()}@example.com`,
      });

      // Submit feedback
      const fb = await submitFeedback({
        tenantId: business.tenant.id,
        membershipId: member.membership.id,
        message: "Great service yesterday, thank you!",
        contactBackOk: true,
      });
      expect(fb.status).toBe("new");
      expect(fb.contactBackOk).toBe(true);

      const ownerCtx: RequestContext = {
        userId: business.user.id,
        tenantId: business.tenant.id,
        role: "owner",
        requestId: "req-fb",
      };

      // Owner reads inbox
      const inbox = await getFeedbackMessages(ownerCtx);
      expect(inbox.some((m) => m.id === fb.id)).toBe(true);

      // Owner marks as resolved
      const resolved = await updateFeedbackStatus(ownerCtx, fb.id, "resolved");
      expect(resolved.status).toBe("resolved");
    });
  });

  describe("Owner link publishing", () => {
    async function newBusiness(tag: string) {
      const slug = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      return registerOwnerAndTenant({
        email: `${slug}@test.com`,
        password: "Password123!",
        name: "Owner",
        businessName: "Link Biz",
        slug,
      });
    }

    it("starts new businesses with no live example links", async () => {
      const business = await newBusiness("fresh-links");
      expect(await getVisibleLinks(business.tenant.id)).toHaveLength(0);
      const all = await getAllTenantLinks(business.tenant.id);
      expect(all.every((l) => !l.enabled)).toBe(true);
    });

    it("never shows the old example URLs to customers and refuses to publish them", async () => {
      expect(validateLinkUrl("instagram", "https://instagram.com/example").valid).toBe(false);
      const business = await newBusiness("placeholder-links");
      const ctx: RequestContext = { userId: business.user.id, tenantId: business.tenant.id, role: "owner", requestId: "r" };
      await expect(
        updateBusinessLinks(ctx, [
          { type: "facebook", label: "Like us", url: "https://facebook.com/example", enabled: true, sortOrder: 1 },
        ])
      ).rejects.toThrow(/example link/i);
    });

    it("keeps the link id and its click history when the owner edits the URL", async () => {
      const business = await newBusiness("edit-links");
      const ctx = await publishGoogleLink(business, "https://g.page/r/first/review");
      const [before] = await getVisibleLinks(business.tenant.id);
      await recordLinkClick(before.id, {});

      await updateBusinessLinks(ctx, [
        { type: "google_review", label: "Review us", url: "https://g.page/r/second/review", enabled: true, sortOrder: 1 },
      ]);
      const [after] = await getVisibleLinks(business.tenant.id);
      expect(after.id).toBe(before.id);
      expect(after.url).toBe("https://g.page/r/second/review");
      expect(await recordLinkClick(after.id, {})).toBe("https://g.page/r/second/review");

      const clicks = await db.select().from(linkClickEvents).where(eq(linkClickEvents.linkId, before.id));
      expect(clicks.length).toBe(2);
    });
  });
});
