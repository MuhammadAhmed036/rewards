import "dotenv/config";
import crypto from "crypto";
import { db } from "../src/server/db";
import {
  users,
  tenants,
  locations,
  staffMembers,
  staffLocationScopes,
  programmes,
  ruleVersions,
  rewards,
  memberships,
  membershipBalances,
  consentRecords,
  ledgerEntries,
  redemptions,
  businessLinks,
} from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth";
import { generateCrockfordCode } from "../src/server/qr";
import { reconcileBalances } from "../src/server/services/ledger";
import { sql } from "drizzle-orm";

const UK_SAMPLE_NAMES = [
  "Oliver Smith", "Amelia Jones", "George Taylor", "Isla Brown", "Harry Williams",
  "Emily Wilson", "Leo Evans", "Ava Davies", "Arthur Patel", "Mia Thomas",
  "Noah Roberts", "Olivia Johnson", "Jack Walker", "Sophia Wright", "Freddie Robinson",
  "Grace Thompson", "Charlie White", "Poppy Hughes", "Oscar Edwards", "Ella Green",
  "James Hall", "Evie Wood", "Thomas Harris", "Florence Martin", "Henry Jackson",
  "Alice Clarke", "William Lewis", "Freya Clark", "Lucas Clark", "Phoebe Turner",
  "Alexander Scott", "Ivy Cooper", "Ethan Ward", "Ruby Morris", "Daniel King",
  "Evelyn Baker", "Jacob Harrison", "Lily Morgan", "Michael Allen", "Chloe Anderson",
  "Benjamin Phillips", "Ellie Campbell", "Samuel Parker", "Sophie Miller", "Logan Davis",
  "Daisy Watson", "Sebastian Kelly", "Harper Brooks", "Mason Sanders", "Willow Price"
];

async function seed() {
  console.log("🌱 Starting UK Loyalty Platform Seed Script (Section 18)...");

  // Disable ledger immutability trigger temporarily to allow clean re-runs
  try {
    await db.execute(sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_no_update_delete;`);
  } catch (err) {
    console.warn("Notice: could not disable ledger trigger (continuing):", err);
  }

  // Clean existing demo data if present
  console.log("🧹 Cleaning previous demo data if any exists...");
  await db.execute(sql`
    DELETE FROM tenants WHERE slug IN ('demo-barber', 'demo-coffee');
    DELETE FROM users WHERE email LIKE '%@platform.local' OR email LIKE '%@demo.local';
  `);

  // Re-enable trigger
  try {
    await db.execute(sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_no_update_delete;`);
  } catch (err) {
    console.warn("Notice: could not re-enable ledger trigger:", err);
  }

  const defaultPasswordHash = await hashPassword("Password123!");

  // ============================================================
  // 1. Platform Admin User
  // ============================================================
  console.log("👤 Creating Platform Admin user...");
  const [platformAdmin] = await db
    .insert(users)
    .values({
      email: "admin@platform.local",
      name: "Platform Administrator",
      passwordHash: defaultPasswordHash,
      isPlatformAdmin: true,
      emailVerifiedAt: new Date(),
    })
    .returning();
  console.log(`✅ Platform Admin created: ${platformAdmin.email}`);

  // ============================================================
  // 2. Tenant 1: Demo Barber (Points Mode)
  // ============================================================
  console.log("\n💈 Seeding Tenant: Demo Barber...");
  const [barberTenant] = await db
    .insert(tenants)
    .values({
      slug: "demo-barber",
      name: "Demo Barber",
      industry: "Barbershop & Grooming",
      status: "active",
      timezone: "Europe/London",
      currency: "GBP",
      locale: "en-GB",
      brandPrimaryHex: "#0f172a",
      plan: "pro",
      features: { customBranding: true, multiLocation: true, exportReports: true },
      limits: { maxMembers: 10000, maxStaff: 50, maxLocations: 10 },
    })
    .returning();

  // Locations for Demo Barber
  const [sohoLoc] = await db
    .insert(locations)
    .values({
      tenantId: barberTenant.id,
      publicId: "loc_soho_01",
      name: "Demo Barber - Soho",
      address: { line1: "14 Greek Street", city: "London", postcode: "W1D 4DP" },
      status: "active",
      timezone: "Europe/London",
    })
    .returning();

  const [coventLoc] = await db
    .insert(locations)
    .values({
      tenantId: barberTenant.id,
      publicId: "loc_covent_02",
      name: "Demo Barber - Covent Garden",
      address: { line1: "28 Neal Street", city: "London", postcode: "WC2H 9PR" },
      status: "active",
      timezone: "Europe/London",
    })
    .returning();

  console.log(`✅ Locations created: Soho (${sohoLoc.publicId}), Covent Garden (${coventLoc.publicId})`);

  // Staff & Owner for Demo Barber
  const [barberOwnerUser] = await db
    .insert(users)
    .values({
      email: "barber-owner@platform.local",
      name: "James Barber-Owner",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  await db
    .insert(staffMembers)
    .values({
      tenantId: barberTenant.id,
      userId: barberOwnerUser.id,
      role: "owner",
      status: "active",
    });

  const [barberMgrUser] = await db
    .insert(users)
    .values({
      email: "barber-mgr@platform.local",
      name: "Sarah Barber-Manager",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [barberMgrStaff] = await db
    .insert(staffMembers)
    .values({
      tenantId: barberTenant.id,
      userId: barberMgrUser.id,
      role: "manager",
      status: "active",
    })
    .returning();

  // Scope Manager to both Soho and Covent Garden
  await db.insert(staffLocationScopes).values([
    { staffMemberId: barberMgrStaff.id, locationId: sohoLoc.id },
    { staffMemberId: barberMgrStaff.id, locationId: coventLoc.id },
  ]);

  const [barberStaffUser] = await db
    .insert(users)
    .values({
      email: "barber-staff@platform.local",
      name: "Tom Barber-Stylist",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [barberStylistStaff] = await db
    .insert(staffMembers)
    .values({
      tenantId: barberTenant.id,
      userId: barberStaffUser.id,
      role: "staff",
      status: "active",
    })
    .returning();

  // Scope Staff to Soho
  await db.insert(staffLocationScopes).values([
    { staffMemberId: barberStylistStaff.id, locationId: sohoLoc.id },
  ]);

  console.log("✅ Barber users & staff created (Owner, Manager, Staff)");

  // Programme and Rules for Demo Barber
  const [barberProg] = await db
    .insert(programmes)
    .values({
      tenantId: barberTenant.id,
      name: "Demo Barber VIP Club",
      type: "points",
      status: "published",
      termsVersion: "1.0",
      termsText: "Earn 1 point per £1 spent on grooming and barbering services. Points can be redeemed for free haircuts and beard trims.",
    })
    .returning();

  const barberRuleConfig = {
    earn: {
      mode: "spend" as const,
      pointsPerUnit: 1,
      unitMinor: 100, // 100p = £1
      rounding: "down" as const,
      minEligibleMinor: 0,
      pointsPerVisit: 1,
    },
    caps: {
      maxPointsPerTransaction: 500,
      maxPointsPerMemberPerDay: 1000,
      minMinutesBetweenEarns: 30,
    },
    exclusions: {
      excludeTips: true,
    },
    expiry: {
      enabled: false,
      months: 12,
      warnDays: 30,
    },
    locationEligibility: "all" as const,
  };

  const [barberRule] = await db
    .insert(ruleVersions)
    .values({
      programmeId: barberProg.id,
      tenantId: barberTenant.id,
      version: 1,
      config: barberRuleConfig,
      createdBy: barberOwnerUser.id,
    })
    .returning();

  await db
    .update(programmes)
    .set({ currentRuleVersionId: barberRule.id })
    .where(sql`id = ${barberProg.id}`);

  console.log("✅ Barber programme published (1 point per £1)");

  // Rewards for Demo Barber
  const [rewardHaircut] = await db
    .insert(rewards)
    .values({
      tenantId: barberTenant.id,
      programmeId: barberProg.id,
      version: 1,
      title: "Free Haircut",
      description: "Enjoy a complimentary signature haircut, wash, and styling with any of our master barbers.",
      type: "free_item",
      costPoints: 100,
      status: "active",
    })
    .returning();

  const [rewardBeardTrim] = await db
    .insert(rewards)
    .values({
      tenantId: barberTenant.id,
      programmeId: barberProg.id,
      version: 1,
      title: "Free Beard Trim",
      description: "Hot towel treatment, conditioning, and precision beard shape-up.",
      type: "free_item",
      costPoints: 50,
      status: "active",
    })
    .returning();

  console.log(`✅ Barber rewards created: "${rewardHaircut.title}" (100 pts), "${rewardBeardTrim.title}" (50 pts)`);

  // Business Links for Demo Barber (Anti-gating compliant: Google, Instagram, Facebook)
  await db.insert(businessLinks).values([
    {
      tenantId: barberTenant.id,
      type: "google_review",
      label: "Review us on Google",
      url: "https://g.page/r/demo-barber/review",
      enabled: true,
      sortOrder: 1,
    },
    {
      tenantId: barberTenant.id,
      type: "instagram",
      label: "Follow our Instagram",
      url: "https://instagram.com/demobarber",
      enabled: true,
      sortOrder: 2,
    },
    {
      tenantId: barberTenant.id,
      type: "facebook",
      label: "Like our Facebook Page",
      url: "https://facebook.com/demobarber",
      enabled: true,
      sortOrder: 3,
    },
  ]);
  console.log("✅ Barber business links configured (Google, Instagram, Facebook)");

  // 50 Sample Members for Demo Barber with Randomised Ledger History
  console.log("👥 Creating 50 sample members with randomised ledger entries...");
  for (let i = 0; i < UK_SAMPLE_NAMES.length; i++) {
    const memberName = UK_SAMPLE_NAMES[i];
    const memberEmail = `barber-member-${i + 1}@demo.local`;
    const joinedDaysAgo = 10 + Math.floor(Math.random() * 50);
    const joinedAt = new Date(Date.now() - joinedDaysAgo * 86400000);
    const assignedLocation = i % 2 === 0 ? sohoLoc : coventLoc;

    const [memberUser] = await db
      .insert(users)
      .values({
        email: memberEmail,
        name: memberName,
        emailVerifiedAt: joinedAt,
        createdAt: joinedAt,
      })
      .returning();

    const memberNumber = generateCrockfordCode(8);
    const publicId = `mem_${crypto.randomBytes(12).toString("hex")}`;
    const marketingOptIn = i % 2 === 0;

    const [membership] = await db
      .insert(memberships)
      .values({
        tenantId: barberTenant.id,
        userId: memberUser.id,
        memberNumber,
        publicId,
        qrVersion: 1,
        status: "active",
        joinedLocationId: assignedLocation.id,
        joinedAt,
        marketingOptIn,
      })
      .returning();

    // Consent records
    await db.insert(consentRecords).values([
      {
        tenantId: barberTenant.id,
        membershipId: membership.id,
        purpose: "programme_terms",
        granted: true,
        textVersion: "1.0",
        source: "join_form",
        createdAt: joinedAt,
      },
      ...(marketingOptIn
        ? [
            {
              tenantId: barberTenant.id,
              membershipId: membership.id,
              purpose: "marketing_email",
              granted: true,
              textVersion: "1.0",
              source: "join_form",
              createdAt: joinedAt,
            },
          ]
        : []),
    ]);

    // Generate 2 to 6 transactions
    const txCount = 2 + Math.floor(Math.random() * 5);
    let currentBalance = 0;
    let lifetimeEarned = 0;
    let lifetimeRedeemed = 0;

    for (let t = 0; t < txCount; t++) {
      const daysAgo = Math.max(1, Math.floor(joinedDaysAgo - (t * (joinedDaysAgo / txCount))));
      const occurredAt = new Date(Date.now() - daysAgo * 86400000);
      const spendPence = 2000 + Math.floor(Math.random() * 60) * 100; // £20.00 to £79.00
      const earnedPoints = Math.floor(spendPence / 100);

      await db.insert(ledgerEntries).values({
        tenantId: barberTenant.id,
        membershipId: membership.id,
        type: "earn",
        pointsDelta: earnedPoints,
        basisAmountMinor: spendPence,
        ruleVersionId: barberRule.id,
        locationId: assignedLocation.id,
        actorUserId: barberStylistStaff.userId,
        idempotencyKey: `seed_earn_${membership.id}_${t}`,
        occurredAt,
        createdAt: occurredAt,
      });

      currentBalance += earnedPoints;
      lifetimeEarned += earnedPoints;
    }

    // For some members with balance >= 50, simulate a redemption
    if (currentBalance >= 50 && i % 3 === 0) {
      const rewardToRedeem = currentBalance >= 100 && i % 2 === 0 ? rewardHaircut : rewardBeardTrim;
      const redeemPoints = rewardToRedeem.costPoints;
      const redeemAt = new Date(Date.now() - 2 * 86400000);

      const codeHash = crypto.createHash("sha256").update(`CODE${i}`).digest("hex");

      const [redemption] = await db
        .insert(redemptions)
        .values({
          tenantId: barberTenant.id,
          membershipId: membership.id,
          rewardId: rewardToRedeem.id,
          rewardVersion: rewardToRedeem.version,
          costPoints: redeemPoints,
          status: "confirmed",
          codeHash,
          codeLast4: "5678",
          expiresAt: new Date(redeemAt.getTime() + 600000),
          locationId: assignedLocation.id,
          confirmedBy: barberStylistStaff.userId,
          confirmedAt: redeemAt,
          createdAt: redeemAt,
        })
        .returning();

      await db.insert(ledgerEntries).values({
        tenantId: barberTenant.id,
        membershipId: membership.id,
        type: "redeem",
        pointsDelta: -redeemPoints,
        rewardId: rewardToRedeem.id,
        redemptionId: redemption.id,
        locationId: assignedLocation.id,
        actorUserId: barberStylistStaff.userId,
        idempotencyKey: `seed_redeem_${redemption.id}`,
        occurredAt: redeemAt,
        createdAt: redeemAt,
      });

      currentBalance -= redeemPoints;
      lifetimeRedeemed += redeemPoints;
    }

    // Set membership balance row
    await db.insert(membershipBalances).values({
      membershipId: membership.id,
      tenantId: barberTenant.id,
      balance: currentBalance,
      lifetimeEarned,
      lifetimeRedeemed,
      updatedAt: new Date(),
    });
  }
  console.log("✅ 50 Barber members seeded with consistent ledger histories");

  // ============================================================
  // 3. Tenant 2: Demo Coffee (Stamps Mode)
  // ============================================================
  console.log("\n☕ Seeding Tenant: Demo Coffee...");
  const [coffeeTenant] = await db
    .insert(tenants)
    .values({
      slug: "demo-coffee",
      name: "Demo Coffee Roasters",
      industry: "Speciality Coffee & Bakery",
      status: "active",
      timezone: "Europe/London",
      currency: "GBP",
      locale: "en-GB",
      brandPrimaryHex: "#78350f",
      plan: "pro",
      features: { customBranding: true },
      limits: { maxMembers: 10000, maxStaff: 50, maxLocations: 5 },
    })
    .returning();

  const [shoreditchLoc] = await db
    .insert(locations)
    .values({
      tenantId: coffeeTenant.id,
      publicId: "loc_shoreditch_01",
      name: "Demo Coffee - Shoreditch",
      address: { line1: "72 Redchurch Street", city: "London", postcode: "E2 7DD" },
      status: "active",
      timezone: "Europe/London",
    })
    .returning();

  // Coffee Users & Staff
  const [coffeeOwnerUser] = await db
    .insert(users)
    .values({
      email: "coffee-owner@platform.local",
      name: "Emma Coffee-Owner",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  await db.insert(staffMembers).values({
    tenantId: coffeeTenant.id,
    userId: coffeeOwnerUser.id,
    role: "owner",
    status: "active",
  });

  const [coffeeMgrUser] = await db
    .insert(users)
    .values({
      email: "coffee-mgr@platform.local",
      name: "Liam Coffee-Manager",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [coffeeMgrStaff] = await db
    .insert(staffMembers)
    .values({
      tenantId: coffeeTenant.id,
      userId: coffeeMgrUser.id,
      role: "manager",
      status: "active",
    })
    .returning();

  await db.insert(staffLocationScopes).values([
    { staffMemberId: coffeeMgrStaff.id, locationId: shoreditchLoc.id },
  ]);

  const [coffeeStaffUser] = await db
    .insert(users)
    .values({
      email: "coffee-staff@platform.local",
      name: "Chloe Coffee-Barista",
      passwordHash: defaultPasswordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [coffeeBaristaStaff] = await db
    .insert(staffMembers)
    .values({
      tenantId: coffeeTenant.id,
      userId: coffeeStaffUser.id,
      role: "staff",
      status: "active",
    })
    .returning();

  await db.insert(staffLocationScopes).values([
    { staffMemberId: coffeeBaristaStaff.id, locationId: shoreditchLoc.id },
  ]);

  console.log("✅ Coffee users & staff created (Owner, Manager, Staff)");

  // Coffee Programme (Stamps Mode)
  const [coffeeProg] = await db
    .insert(programmes)
    .values({
      tenantId: coffeeTenant.id,
      name: "Demo Coffee Stamp Card",
      type: "stamps",
      status: "published",
      termsVersion: "1.0",
      termsText: "Collect 1 stamp per coffee visit. Collect 8 stamps to redeem a complimentary specialty coffee.",
    })
    .returning();

  const coffeeRuleConfig = {
    earn: {
      mode: "visit" as const,
      pointsPerUnit: 1,
      unitMinor: 100,
      rounding: "down" as const,
      minEligibleMinor: 0,
      pointsPerVisit: 1, // 1 stamp per visit
    },
    caps: {
      maxPointsPerTransaction: 1,
      maxPointsPerMemberPerDay: 3,
      minMinutesBetweenEarns: 30,
    },
    exclusions: {
      excludeTips: true,
    },
    expiry: {
      enabled: false,
      months: 12,
      warnDays: 30,
    },
    locationEligibility: "all" as const,
  };

  const [coffeeRule] = await db
    .insert(ruleVersions)
    .values({
      programmeId: coffeeProg.id,
      tenantId: coffeeTenant.id,
      version: 1,
      config: coffeeRuleConfig,
      createdBy: coffeeOwnerUser.id,
    })
    .returning();

  await db
    .update(programmes)
    .set({ currentRuleVersionId: coffeeRule.id })
    .where(sql`id = ${coffeeProg.id}`);

  console.log("✅ Coffee stamp card published (1 stamp per visit)");

  // Coffee Reward: Free Coffee at 8 stamps
  const [rewardFreeCoffee] = await db
    .insert(rewards)
    .values({
      tenantId: coffeeTenant.id,
      programmeId: coffeeProg.id,
      version: 1,
      title: "Free Coffee",
      description: "Any regular espresso-based coffee, filter batch brew, or specialty tea on the menu.",
      type: "free_item",
      costPoints: 8, // 8 stamps
      status: "active",
    })
    .returning();

  console.log(`✅ Coffee reward created: "${rewardFreeCoffee.title}" (8 stamps)`);

  // Business Links for Demo Coffee
  await db.insert(businessLinks).values([
    {
      tenantId: coffeeTenant.id,
      type: "google_review",
      label: "Rate us on Google",
      url: "https://g.page/r/demo-coffee/review",
      enabled: true,
      sortOrder: 1,
    },
    {
      tenantId: coffeeTenant.id,
      type: "instagram",
      label: "Follow our Instagram",
      url: "https://instagram.com/democoffee",
      enabled: true,
      sortOrder: 2,
    },
  ]);
  console.log("✅ Coffee business links configured (Google, Instagram)");

  // Sample Members for Demo Coffee
  console.log("👥 Creating 10 sample members for Demo Coffee...");
  for (let i = 0; i < 10; i++) {
    const memberName = UK_SAMPLE_NAMES[i + 15];
    const memberEmail = `coffee-member-${i + 1}@demo.local`;
    const joinedDaysAgo = 5 + i * 3;
    const joinedAt = new Date(Date.now() - joinedDaysAgo * 86400000);

    const [user] = await db
      .insert(users)
      .values({
        email: memberEmail,
        name: memberName,
        emailVerifiedAt: joinedAt,
        createdAt: joinedAt,
      })
      .returning();

    const memberNumber = generateCrockfordCode(8);
    const publicId = `mem_${crypto.randomBytes(12).toString("hex")}`;

    const [membership] = await db
      .insert(memberships)
      .values({
        tenantId: coffeeTenant.id,
        userId: user.id,
        memberNumber,
        publicId,
        qrVersion: 1,
        status: "active",
        joinedLocationId: shoreditchLoc.id,
        joinedAt,
        marketingOptIn: true,
      })
      .returning();

    await db.insert(consentRecords).values({
      tenantId: coffeeTenant.id,
      membershipId: membership.id,
      purpose: "programme_terms",
      granted: true,
      textVersion: "1.0",
      source: "join_form",
      createdAt: joinedAt,
    });

    // Stamps count: e.g. 1 to 8
    const stampsCount = (i % 8) + 1;
    let balance = 0;
    let lifetimeEarned = 0;
    let lifetimeRedeemed = 0;

    for (let s = 0; s < stampsCount; s++) {
      const stampDate = new Date(Date.now() - (stampsCount - s) * 86400000);
      await db.insert(ledgerEntries).values({
        tenantId: coffeeTenant.id,
        membershipId: membership.id,
        type: "earn",
        pointsDelta: 1,
        basisAmountMinor: 350, // £3.50 coffee
        ruleVersionId: coffeeRule.id,
        locationId: shoreditchLoc.id,
        actorUserId: coffeeBaristaStaff.userId,
        idempotencyKey: `coffee_stamp_${membership.id}_${s}`,
        occurredAt: stampDate,
        createdAt: stampDate,
      });
      balance += 1;
      lifetimeEarned += 1;
    }

    // Member 0 has 8 stamps and redeems a free coffee
    if (i === 7) {
      const redeemAt = new Date();
      const codeHash = crypto.createHash("sha256").update(`COFFEE_REDEEM_${i}`).digest("hex");
      const [redemption] = await db
        .insert(redemptions)
        .values({
          tenantId: coffeeTenant.id,
          membershipId: membership.id,
          rewardId: rewardFreeCoffee.id,
          rewardVersion: rewardFreeCoffee.version,
          costPoints: 8,
          status: "confirmed",
          codeHash,
          codeLast4: "9988",
          expiresAt: new Date(redeemAt.getTime() + 600000),
          locationId: shoreditchLoc.id,
          confirmedBy: coffeeBaristaStaff.userId,
          confirmedAt: redeemAt,
          createdAt: redeemAt,
        })
        .returning();

      await db.insert(ledgerEntries).values({
        tenantId: coffeeTenant.id,
        membershipId: membership.id,
        type: "redeem",
        pointsDelta: -8,
        rewardId: rewardFreeCoffee.id,
        redemptionId: redemption.id,
        locationId: shoreditchLoc.id,
        actorUserId: coffeeBaristaStaff.userId,
        idempotencyKey: `coffee_redeem_${redemption.id}`,
        occurredAt: redeemAt,
        createdAt: redeemAt,
      });

      balance -= 8;
      lifetimeRedeemed += 8;
    }

    await db.insert(membershipBalances).values({
      membershipId: membership.id,
      tenantId: coffeeTenant.id,
      balance,
      lifetimeEarned,
      lifetimeRedeemed,
      updatedAt: new Date(),
    });
  }
  console.log("✅ 10 Coffee members seeded with stamp card histories");

  // ============================================================
  // 4. Run Balance Reconciliation Verification
  // ============================================================
  console.log("\n⚖️ Running Ledger Balance Reconciliation on seeded data...");
  const reconBarber = await reconcileBalances(barberTenant.id);
  console.log(`💈 Reconciled ${reconBarber.reconciledCount} Demo Barber memberships.`);
  if (!reconBarber.isConsistent) {
    console.error("❌ Barber discrepancies found:", reconBarber.discrepancies);
    throw new Error("Barber balance reconciliation failed after seeding!");
  }

  const reconCoffee = await reconcileBalances(coffeeTenant.id);
  console.log(`☕ Reconciled ${reconCoffee.reconciledCount} Demo Coffee memberships.`);
  if (!reconCoffee.isConsistent) {
    console.error("❌ Coffee discrepancies found:", reconCoffee.discrepancies);
    throw new Error("Coffee balance reconciliation failed after seeding!");
  }

  const reconAll = await reconcileBalances();
  console.log(`📊 Reconciled ${reconAll.reconciledCount} total memberships across the entire database.`);
  if (!reconAll.isConsistent) {
    console.warn("⚠️ Note: Legacy test discrepancies detected in unseeded tenants:", reconAll.discrepancies.length);
  } else {
    console.log("🎉 SUCCESS: 100% of memberships reconcile exactly to immutable ledger sums (0 discrepancies)!");
  }

  console.log("\n============================================================");
  console.log("🚀 DEMO ACCOUNTS READY FOR LOGIN:");
  console.log("Platform Admin:    admin@platform.local          / Password123!");
  console.log("Barber Owner:      barber-owner@platform.local   / Password123!");
  console.log("Barber Manager:    barber-mgr@platform.local     / Password123!");
  console.log("Barber Staff:      barber-staff@platform.local   / Password123!");
  console.log("Coffee Owner:      coffee-owner@platform.local   / Password123!");
  console.log("Coffee Manager:    coffee-mgr@platform.local     / Password123!");
  console.log("Coffee Staff:      coffee-staff@platform.local   / Password123!");
  console.log("============================================================\n");
}

seed()
  .then(() => {
    console.log("✅ Seed completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed with error:", err);
    process.exit(1);
  });
