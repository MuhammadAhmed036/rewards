import { db } from "../db";
import {
  tenants,
  locations,
  staffMembers,
  users,
  programmes,
  ruleVersions,
  businessLinks,
} from "../db/schema";
import { hashPassword, createSession } from "../auth";
import { logAuditEvent } from "./audit";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface RegisterOwnerParams {
  email: string;
  password: string;
  name: string;
  businessName: string;
  slug: string;
  programmeType?: "points" | "stamps";
  industry?: string;
  plan?: "free" | "pro";
  locationName?: string;
  brandPrimaryHex?: string;
}

export async function registerOwnerAndTenant(params: RegisterOwnerParams) {
  const normalizedEmail = params.email.toLowerCase().trim();
  const normalizedSlug = params.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-");

  // Check if tenant slug already exists
  const existingTenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, normalizedSlug))
    .limit(1);

  if (existingTenant.length > 0) {
    throw new Error(`Tenant slug "${normalizedSlug}" is already taken`);
  }

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const hashedPassword = await hashPassword(params.password);

  return await db.transaction(async (tx) => {
    let userId: string;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          name: params.name,
          passwordHash: hashedPassword,
          emailVerifiedAt: new Date(),
        })
        .returning({ id: users.id });
      userId = newUser.id;
    }

    // 1. Create Tenant
    const [newTenant] = await tx
      .insert(tenants)
      .values({
        slug: normalizedSlug,
        name: params.businessName,
        industry: params.industry || "Retail & Hospitality",
        status: "active",
        currency: "GBP",
        timezone: "Europe/London",
        locale: "en-GB",
        brandPrimaryHex: params.brandPrimaryHex || "#1e293b",
        plan: params.plan || "free",
        features: {},
        limits: {},
      })
      .returning();

    // 2. Create Initial Location
    const locationPublicId = `loc_${crypto.randomBytes(4).toString("hex")}`;
    const [newLocation] = await tx
      .insert(locations)
      .values({
        tenantId: newTenant.id,
        publicId: locationPublicId,
        name: params.locationName || "Main Location",
        address: {},
        status: "active",
      })
      .returning();

    // 3. Create Staff Member as Owner
    await tx.insert(staffMembers).values({
      tenantId: newTenant.id,
      userId,
      role: "owner",
      status: "active",
      acceptedAt: new Date(),
    });

    // 4. Create Initial Programme & Rule Version
    const progType = params.programmeType || "points";
    const [newProgramme] = await tx
      .insert(programmes)
      .values({
        tenantId: newTenant.id,
        name: `${params.businessName} Loyalty`,
        type: progType,
        status: "published",
        termsVersion: "1.0",
        termsText: "Terms and conditions of the loyalty programme. Points have no cash value.",
      })
      .returning();

    const defaultConfig =
      progType === "points"
        ? {
            earn: {
              mode: "spend",
              pointsPerUnit: 1,
              unitMinor: 100, // 1 point per £1 (100 pence)
              rounding: "down",
              minEligibleMinor: 0,
              pointsPerVisit: 1,
            },
            caps: {
              maxPointsPerTransaction: 500,
              maxPointsPerMemberPerDay: 1000,
              minMinutesBetweenEarns: 30,
            },
            exclusions: { excludeTips: true },
            expiry: { enabled: false, months: 12, warnDays: 30 },
            locationEligibility: "all",
          }
        : {
            earn: {
              mode: "visit",
              pointsPerUnit: 1,
              unitMinor: 100,
              rounding: "down",
              minEligibleMinor: 0,
              pointsPerVisit: 1, // 1 stamp per visit
            },
            caps: {
              maxPointsPerTransaction: 1,
              maxPointsPerMemberPerDay: 2,
              minMinutesBetweenEarns: 30,
            },
            exclusions: { excludeTips: true },
            expiry: { enabled: false, months: 12, warnDays: 30 },
            locationEligibility: "all",
          };

    const [ruleVer] = await tx
      .insert(ruleVersions)
      .values({
        programmeId: newProgramme.id,
        tenantId: newTenant.id,
        version: 1,
        config: defaultConfig,
        createdBy: userId,
      })
      .returning();

    await tx
      .update(programmes)
      .set({ currentRuleVersionId: ruleVer.id })
      .where(eq(programmes.id, newProgramme.id));

    // 5. Create default business links (Review, Instagram, Facebook) per Section 1.1 / 11.1
    await tx.insert(businessLinks).values([
      {
        tenantId: newTenant.id,
        type: "google_review",
        label: "Leave a Google review",
        url: "https://g.page/review/example",
        enabled: true,
        sortOrder: 1,
      },
      {
        tenantId: newTenant.id,
        type: "instagram",
        label: "Follow on Instagram",
        url: "https://instagram.com/example",
        enabled: true,
        sortOrder: 2,
      },
      {
        tenantId: newTenant.id,
        type: "facebook",
        label: "Like us on Facebook",
        url: "https://facebook.com/example",
        enabled: true,
        sortOrder: 3,
      },
    ]);

    // Audit log
    await logAuditEvent(
      {
        userId,
        tenantId: newTenant.id,
        role: "owner",
        requestId: crypto.randomUUID(),
      },
      {
        action: "tenant.created",
        targetType: "tenant",
        targetId: newTenant.id,
        metadata: { slug: normalizedSlug, businessName: params.businessName },
      },
      tx
    );

    const session = await createSession(userId, true, undefined, undefined, tx);

    return {
      user: { id: userId, email: normalizedEmail, name: params.name },
      tenant: newTenant,
      location: newLocation,
      programme: newProgramme,
      session,
    };
  });
}
