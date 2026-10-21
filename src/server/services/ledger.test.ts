import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { createReward } from "./rewards";
import {
  earn,
  previewEarn,
  requestRedemption,
  confirmRedemption,
  adjustBalance,
  reverseTransaction,
  reconcileBalances,
} from "./ledger";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { ledgerEntries, membershipBalances } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

describe("Ledger, Earn, Redeem & Concurrency Engine (M4)", () => {
  it("enforces earn idempotency: duplicate key produces identical response and single ledger entry", async () => {
    const slug = `cafe-earn-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `owner-earn-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Earn Cafe",
      slug,
      programmeType: "points",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `cust-${Date.now()}@example.com`,
      name: "John Customer",
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-earn-1",
    };

    const idempotencyKey = crypto.randomUUID();

    // 1. Preview earn
    const preview = await previewEarn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 2500, // £25.00 -> 25 points
    });
    expect(preview.pointsToAward).toBe(25);
    expect(preview.projectedBalance).toBe(25);

    // 2. First Earn
    const result1 = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 2500,
      idempotencyKey,
    });
    expect(result1.pointsDelta).toBe(25);
    expect(result1.newBalance).toBe(25);
    expect(result1.isDuplicate).toBe(false);

    // 3. Second Earn with identical idempotencyKey (Retry simulation)
    const result2 = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 2500,
      idempotencyKey,
    });
    expect(result2.pointsDelta).toBe(25);
    expect(result2.newBalance).toBe(25);
    expect(result2.isDuplicate).toBe(true);

    // Verify only ONE entry exists in ledger
    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, idempotencyKey));
    expect(rows.length).toBe(1);

    // Verify balance projection is exactly 25
    const [bal] = await db
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, member.membership.id));
    expect(bal.balance).toBe(25);
  });

  it("enforces duplicate-visit guard unless manager override is provided", async () => {
    const slug = `guard-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `owner-guard-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Guard Cafe",
      slug,
      programmeType: "points",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `cust-guard-${Date.now()}@example.com`,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-guard",
    };

    // First earn
    await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 1000,
      idempotencyKey: crypto.randomUUID(),
    });

    // Immediate second earn without override must be rejected
    await expect(
      earn(staffCtx, {
        membershipId: member.membership.id,
        locationId: business.location.id,
        amountMinor: 1000,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/DUPLICATE_VISIT/);

    // Second earn with manager override reason must succeed
    const overridden = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 1000,
      idempotencyKey: crypto.randomUUID(),
      managerOverrideReason: "Customer ordered a second round for a friend",
    });
    expect(overridden.pointsDelta).toBe(10);
    expect(overridden.newBalance).toBe(20);
  });

  it("handles full redemption lifecycle, code validation, and duplicate redemption prevention", async () => {
    const slug = `redeem-cafe-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `owner-red-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Redeem Cafe",
      slug,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-red",
    };

    // Create 50 pt reward
    const reward = await createReward(staffCtx, {
      title: "Free Pastry",
      costPoints: 50,
      type: "free_item",
    });

    // Member joins
    const member = await joinProgramme({
      tenantSlug: slug,
      email: `red-member-${Date.now()}@example.com`,
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: business.tenant.id,
      role: "customer",
      requestId: "req-cust",
    };

    // Try to request redemption with 0 balance -> reject INSUFFICIENT_BALANCE
    await expect(
      requestRedemption(custCtx, {
        membershipId: member.membership.id,
        rewardId: reward.id,
      })
    ).rejects.toThrow(/INSUFFICIENT_BALANCE/);

    // Award 100 points
    await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 10000, // £100 -> 100 points
      idempotencyKey: crypto.randomUUID(),
    });

    // Request redemption
    const reqResult = await requestRedemption(custCtx, {
      membershipId: member.membership.id,
      rewardId: reward.id,
    });
    expect(reqResult.code.length).toBe(8);

    // Staff confirms redemption
    const confirmResult = await confirmRedemption(staffCtx, {
      code: reqResult.code,
      locationId: business.location.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(confirmResult.pointsDeducted).toBe(50);
    expect(confirmResult.newBalance).toBe(50);

    // Attempting to redeem the same code a second time must fail with CODE_ALREADY_USED
    await expect(
      confirmRedemption(staffCtx, {
        code: reqResult.code,
        locationId: business.location.id,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/CODE_ALREADY_USED/);
  });

  it("reverses transactions and forbids balance from dropping below zero", async () => {
    const slug = `reversal-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `rev-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Reversal Shop",
      slug,
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `rev-mem-${Date.now()}@example.com`,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-rev",
    };

    // Earn 50 points
    const earned = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 5000,
      idempotencyKey: crypto.randomUUID(),
    });

    // Reverse transaction
    const reversed = await reverseTransaction(staffCtx, {
      ledgerEntryId: earned.entryId,
      reasonCode: "correction",
      note: "Wrong table amount entered",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(reversed.newBalance).toBe(0);

    // Second reversal of same transaction must fail
    await expect(
      reverseTransaction(staffCtx, {
        ledgerEntryId: earned.entryId,
        reasonCode: "correction",
        note: "Duplicate reversal attempt",
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/already been reversed/);
  });

  it("verifies Section 7.1 ledger immutability trigger forbids UPDATE and DELETE", async () => {
    const slug = `immutable-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `imm-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Immutable DB",
      slug,
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `imm-mem-${Date.now()}@example.com`,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-imm",
    };

    const earned = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 2000,
      idempotencyKey: crypto.randomUUID(),
    });

    // Attempt direct UPDATE on ledger_entries -> must be rejected by PostgreSQL trigger
    await expect(
      db.execute(
        sql`UPDATE ledger_entries SET points_delta = 999 WHERE id = ${earned.entryId}`
      )
    ).rejects.toThrow(/ledger_entries is append-only/);

    // Attempt direct DELETE on ledger_entries -> must be rejected by PostgreSQL trigger
    await expect(
      db.execute(
        sql`DELETE FROM ledger_entries WHERE id = ${earned.entryId}`
      )
    ).rejects.toThrow(/ledger_entries is append-only/);
  });

  it("passes reconciliation check: sum of points_delta strictly equals membership_balances", async () => {
    const slug = `recon-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `recon-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Reconciliation Biz",
      slug,
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `recon-mem-${Date.now()}@example.com`,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-recon",
    };

    // Series of operations
    await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 3000,
      idempotencyKey: crypto.randomUUID(),
    });

    await adjustBalance(staffCtx, {
      membershipId: member.membership.id,
      pointsDelta: 15,
      reasonCode: "goodwill",
      note: "Birthday points bonus",
      idempotencyKey: crypto.randomUUID(),
    });

    const recon = await reconcileBalances(business.tenant.id);
    expect(recon.isConsistent).toBe(true);
    expect(recon.discrepancies.length).toBe(0);
  });

  it("handles high concurrency: parallel confirms of the same redemption allow exactly ONE success", async () => {
    const slug = `race-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `race-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Race Condition Test",
      slug,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-race",
    };

    const reward = await createReward(staffCtx, {
      title: "Limited Item",
      costPoints: 20,
      type: "free_item",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `race-mem-${Date.now()}@example.com`,
    });

    // Credit 50 points
    await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 5000,
      idempotencyKey: crypto.randomUUID(),
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: business.tenant.id,
      role: "customer",
      requestId: "req-race-cust",
    };

    const redemptionReq = await requestRedemption(custCtx, {
      membershipId: member.membership.id,
      rewardId: reward.id,
    });

    // Two parallel confirmation attempts with distinct idempotency keys
    const p1 = confirmRedemption(staffCtx, {
      code: redemptionReq.code,
      locationId: business.location.id,
      idempotencyKey: crypto.randomUUID(),
    }).then(() => "success").catch((e) => e.message);

    const p2 = confirmRedemption(staffCtx, {
      code: redemptionReq.code,
      locationId: business.location.id,
      idempotencyKey: crypto.randomUUID(),
    }).then(() => "success").catch((e) => e.message);

    const results = await Promise.all([p1, p2]);
    const successCount = results.filter((r) => r === "success").length;
    const failureCount = results.filter((r) => r !== "success").length;

    // Concurrency guarantee: exactly one succeeds, one fails
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    // Verify balance is deducted exactly once (50 - 20 = 30)
    const [bal] = await db
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, member.membership.id));
    expect(bal.balance).toBe(30);
  });

  it("handles two redeems exceeding the balance at once: one fails, balance never drops below 0", async () => {
    const slug = `over-redeem-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `over-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner",
      businessName: "Balance Guard Test",
      slug,
    });

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-over-staff",
    };

    const reward = await createReward(staffCtx, {
      title: "Big Reward",
      costPoints: 60,
      type: "free_item",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `over-mem-${Date.now()}@example.com`,
    });

    // Credit exactly 100 points
    await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId: business.location.id,
      amountMinor: 10000,
      idempotencyKey: crypto.randomUUID(),
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: business.tenant.id,
      role: "customer",
      requestId: "req-over-cust",
    };

    // Customer requests two 60-point vouchers (total 120 points, but member only has 100)
    const req1 = await requestRedemption(custCtx, {
      membershipId: member.membership.id,
      rewardId: reward.id,
    });

    const req2 = await requestRedemption(custCtx, {
      membershipId: member.membership.id,
      rewardId: reward.id,
    });

    // Both codes are confirmed concurrently at checkout
    const p1 = confirmRedemption(staffCtx, {
      code: req1.code,
      locationId: business.location.id,
      idempotencyKey: crypto.randomUUID(),
    }).then(() => "success").catch((e) => e.message);

    const p2 = confirmRedemption(staffCtx, {
      code: req2.code,
      locationId: business.location.id,
      idempotencyKey: crypto.randomUUID(),
    }).then(() => "success").catch((e) => e.message);

    const results = await Promise.all([p1, p2]);
    const successCount = results.filter((r) => r === "success").length;
    const failureCount = results.filter((r) => r !== "success").length;

    // Exactly one could be confirmed before balance ran out
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    // Balance is 100 - 60 = 40 (never below 0)
    const [finalBal] = await db
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, member.membership.id));
    expect(finalBal.balance).toBe(40);
    expect(finalBal.balance).toBeGreaterThanOrEqual(0);
  });
});

