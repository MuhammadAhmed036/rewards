import { db } from "../db";
import { assertGrowthAllowed } from "./billing";
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
import { RequestContext, assertCan } from "../security/permissions";
import { eq, and, count } from "drizzle-orm";
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
  /** Pre-validated logo data URL (see business-logo.ts) */
  logoUrl?: string | null;
  status?: "active" | "pending" | "suspended";
  emailVerified?: boolean;
  maxStaff?: number;
  maxLocations?: number;
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
          // Self sign-ups confirm their email by link; seeded and test owners start confirmed
          emailVerifiedAt: params.emailVerified === false ? null : new Date(),
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
        status: params.status || "active",
        currency: "GBP",
        timezone: "Europe/London",
        locale: "en-GB",
        brandPrimaryHex: params.brandPrimaryHex || "#1e293b",
        logoUrl: params.logoUrl || null,
        plan: params.plan || "free",
        features: {},
        limits: {
          maxStaff: params.maxStaff || 10,
          maxLocations: params.maxLocations || 3,
          maxActiveRewards: 10,
        },
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

    // 5. Create the review/social buttons switched off; the owner adds their own links before they go live
    await tx.insert(businessLinks).values([
      {
        tenantId: newTenant.id,
        type: "google_review",
        label: "Leave a Google review",
        url: "",
        enabled: false,
        sortOrder: 1,
      },
      {
        tenantId: newTenant.id,
        type: "instagram",
        label: "Follow on Instagram",
        url: "",
        enabled: false,
        sortOrder: 2,
      },
      {
        tenantId: newTenant.id,
        type: "facebook",
        label: "Like us on Facebook",
        url: "",
        enabled: false,
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

    const session = await createSession(userId, "staff", undefined, undefined, tx);

    return {
      user: { id: userId, email: normalizedEmail, name: params.name },
      tenant: newTenant,
      location: newLocation,
      programme: newProgramme,
      session,
    };
  });
}

export async function createLocation(
  ctx: RequestContext,
  params: { name: string; address?: Record<string, unknown> }
) {
  assertCan(ctx, "location.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  await assertGrowthAllowed(ctx.tenantId, "Adding locations");

  // Check tier limit: maxLocations (A18 / FR-011)
  const [tenant] = await db
    .select({ limits: tenants.limits })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const maxLocations = (tenant?.limits as Record<string, unknown> | null)?.maxLocations;
  if (typeof maxLocations === "number" && maxLocations > 0) {
    const [locCount] = await db
      .select({ count: count() })
      .from(locations)
      .where(and(eq(locations.tenantId, ctx.tenantId), eq(locations.status, "active")));

    if (Number(locCount?.count ?? 0) >= maxLocations) {
      throw new Error(
        `Location limit reached for your plan (maximum: ${maxLocations}). Upgrade your plan to add more locations.`
      );
    }
  }

  const locationPublicId = `loc_${crypto.randomBytes(4).toString("hex")}`;
  const [newLocation] = await db
    .insert(locations)
    .values({
      tenantId: ctx.tenantId,
      publicId: locationPublicId,
      name: params.name.trim(),
      address: params.address || {},
      status: "active",
    })
    .returning();

  await logAuditEvent(ctx, {
    action: "location.created",
    targetType: "location",
    targetId: newLocation.id,
    metadata: { name: params.name },
  });

  return newLocation;
}

export async function updateLocation(
  ctx: RequestContext,
  locationId: string,
  params: { name?: string; addressLine?: string; timezone?: string; status?: "active" | "closed" }
) {
  assertCan(ctx, "location.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [existing] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, ctx.tenantId)))
    .limit(1);
  if (!existing) throw new Error("Location not found");

  if (params.status === "closed" && existing.status === "active") {
    const [open] = await db
      .select({ count: count() })
      .from(locations)
      .where(and(eq(locations.tenantId, ctx.tenantId), eq(locations.status, "active")));
    if (Number(open?.count ?? 0) <= 1) throw new Error("You need at least one open location.");
  }
  if (params.timezone) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: params.timezone });
    } catch {
      throw new Error("That time zone isn't recognised");
    }
  }

  const [updated] = await db
    .update(locations)
    .set({
      name: params.name?.trim() || existing.name,
      address:
        params.addressLine !== undefined
          ? { ...(existing.address as Record<string, unknown>), line: params.addressLine.trim() }
          : existing.address,
      timezone: params.timezone ?? existing.timezone,
      status: params.status ?? existing.status,
    })
    .where(eq(locations.id, existing.id))
    .returning();

  await logAuditEvent(ctx, {
    action: params.status && params.status !== existing.status ? `location.${params.status === "closed" ? "closed" : "reopened"}` : "location.updated",
    targetType: "location",
    targetId: existing.id,
    metadata: { changes: params },
  });
  return updated;
}

export async function getLocations(ctx: RequestContext) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  return await db
    .select()
    .from(locations)
    .where(eq(locations.tenantId, ctx.tenantId));
}
