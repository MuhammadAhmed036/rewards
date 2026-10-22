import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { getProgramme, publishRuleVersion, setProgrammeStatus } from "./programme";
import { createReward, getRewards, updateReward } from "./rewards";
import { earn, previewEarn, requestRedemption, validateRedemptionCode, confirmRedemption } from "./ledger";
import { joinProgramme, suspendMembership, reactivateMembership } from "./member";
import { RequestContext } from "../security/permissions";
import crypto from "crypto";

describe("Programme & Rewards Services (M2)", () => {
  it("publishes new rule version and increments version number", async () => {
    const slug = `cafe-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `cafe-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Cafe Owner",
      businessName: "Cozy Cafe",
      slug,
      programmeType: "points",
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-prog-1",
    };

    const initial = await getProgramme(ctx);
    expect(initial?.programme.type).toBe("points");
    expect(initial?.currentRule?.earn.pointsPerUnit).toBe(1);

    // Publish rule version 2: 2 points per £1
    const v2 = await publishRuleVersion(ctx, {
      ...initial!.currentRule!,
      earn: {
        ...initial!.currentRule!.earn,
        pointsPerUnit: 2,
      },
    });

    expect(v2.version).toBe(2);

    const updated = await getProgramme(ctx);
    expect(updated?.currentRule?.earn.pointsPerUnit).toBe(2);
  });

  it("creates rewards and computes member eligibility and shortfall", async () => {
    const slug = `barber-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `barber-rewards-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Barber Sam",
      businessName: "Sam Cuts",
      slug,
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-rew-1",
    };

    // 1. Create a 50 point reward
    const reward50 = await createReward(ctx, {
      title: "Beard Trim",
      costPoints: 50,
      type: "free_item",
      description: "Complimentary beard trim",
    });

    // 2. Create a 100 point reward
    const reward100 = await createReward(ctx, {
      title: "Full Haircut",
      costPoints: 100,
      type: "free_item",
      description: "Full haircut & wash",
    });

    expect(reward50.id).toBeDefined();
    expect(reward100.id).toBeDefined();

    // 3. Check rewards with member balance = 60 points
    const rewardsForMember = await getRewards(result.tenant.id, {
      memberBalance: 60,
    });

    const trim = rewardsForMember.find((r) => r.id === reward50.id);
    const haircut = rewardsForMember.find((r) => r.id === reward100.id);

    // Beard trim (50 pts) should be eligible
    expect(trim?.eligible).toBe(true);
    expect(trim?.pointsShortfall).toBe(0);

    // Full Haircut (100 pts) should be locked with 40 points shortfall
    expect(haircut?.eligible).toBe(false);
    expect(haircut?.pointsShortfall).toBe(40);

    // 4. Update reward title and bump version
    const updated = await updateReward(ctx, reward50.id, {
      title: "Deluxe Beard Trim",
    });
    expect(updated.version).toBe(2);
    expect(updated.title).toBe("Deluxe Beard Trim");
  });

  it("enforces programme status: paused programme rejects earn and preview", async () => {
    const slug = `paused-cafe-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `paused-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Paused Owner",
      businessName: "Paused Cafe",
      slug,
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-pause-test",
    };

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `paused-member-${Date.now()}@example.com`,
    });

    // Pause the programme
    await setProgrammeStatus(ctx, "paused");

    // Preview earn should fail
    await expect(
      previewEarn(ctx, {
        membershipId: member.membership.id,
        locationId: result.location.id,
        amountMinor: 2000,
      })
    ).rejects.toThrow(/PROGRAMME_NOT_ACTIVE/);

    // Earning points should fail
    await expect(
      earn(ctx, {
        membershipId: member.membership.id,
        locationId: result.location.id,
        amountMinor: 2000,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/PROGRAMME_NOT_ACTIVE/);

    // Unpause programme and verify earn succeeds
    await setProgrammeStatus(ctx, "published");
    const earned = await earn(ctx, {
      membershipId: member.membership.id,
      locationId: result.location.id,
      amountMinor: 2000,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(earned.pointsDelta).toBe(20);
  });

  it("enforces reward validity window: rejects redemption before startsAt or after endsAt", async () => {
    const slug = `time-rewards-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `timer-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Time Owner",
      businessName: "Time Shop",
      slug,
    });

    const ownerCtx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-time-rew",
    };

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `timer-member-${Date.now()}@example.com`,
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: result.tenant.id,
      role: "customer",
      requestId: "req-cust-time",
    };

    // Give customer 200 points
    await earn(ownerCtx, {
      membershipId: member.membership.id,
      locationId: result.location.id,
      amountMinor: 20000,
      idempotencyKey: crypto.randomUUID(),
    });

    // 1. Reward in future (startsAt in 1 day)
    const futureReward = await createReward(ownerCtx, {
      title: "Future Coffee",
      costPoints: 50,
      type: "free_item",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await expect(
      requestRedemption(custCtx, {
        membershipId: member.membership.id,
        rewardId: futureReward.id,
      })
    ).rejects.toThrow(/REWARD_NOT_ACTIVE/);

    // 2. Expired reward (endsAt in past)
    const expiredReward = await createReward(ownerCtx, {
      title: "Expired Coffee",
      costPoints: 50,
      type: "free_item",
      endsAt: new Date(Date.now() - 10000),
    });

    await expect(
      requestRedemption(custCtx, {
        membershipId: member.membership.id,
        rewardId: expiredReward.id,
      })
    ).rejects.toThrow(/REWARD_EXPIRED/);
  });

  it("enforces membership status: suspended member cannot earn or redeem", async () => {
    const slug = `suspend-test-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `sus-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Sus",
      businessName: "Sus Shop",
      slug,
    });

    const ownerCtx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-sus-test",
    };

    const reward = await createReward(ownerCtx, {
      title: "Test Reward",
      costPoints: 10,
      type: "free_item",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `bad-member-${Date.now()}@example.com`,
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: result.tenant.id,
      role: "customer",
      requestId: "req-cust-sus",
    };

    // Earn initially
    await earn(ownerCtx, {
      membershipId: member.membership.id,
      locationId: result.location.id,
      amountMinor: 5000,
      idempotencyKey: crypto.randomUUID(),
    });

    // Suspend member
    await suspendMembership(ownerCtx, member.membership.id, "Chargeback investigation");

    // Earn while suspended -> Rejected
    await expect(
      earn(ownerCtx, {
        membershipId: member.membership.id,
        locationId: result.location.id,
        amountMinor: 2000,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/MEMBERSHIP_SUSPENDED/);

    // Redeem while suspended -> Rejected
    await expect(
      requestRedemption(custCtx, {
        membershipId: member.membership.id,
        rewardId: reward.id,
      })
    ).rejects.toThrow(/MEMBERSHIP_SUSPENDED/);

    // Reactivate member
    await reactivateMembership(ownerCtx, member.membership.id);

    // Earn now succeeds with override or after interval
    const reEarned = await earn(ownerCtx, {
      membershipId: member.membership.id,
      locationId: result.location.id,
      amountMinor: 1000,
      idempotencyKey: crypto.randomUUID(),
      managerOverrideReason: "Reactivated member verification earn",
    });
    expect(reEarned.pointsDelta).toBe(10);
  });

  it("executes the full PRS 5.4 reward claim flow end-to-end: owner creates reward, member earns points, unlocks voucher, staff validates & confirms atomically", async () => {
    const slug = `prs54-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `prs54-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Cafe Owner Max",
      businessName: "Max Roastery",
      slug,
      programmeType: "points",
    });

    const ownerCtx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-prs-owner",
    };

    // 1. Owner creates a 1-point reward ("Free Espresso")
    const reward = await createReward(ownerCtx, {
      title: "Free Espresso",
      costPoints: 1,
      type: "free_item",
      description: "Enjoy a rich shot of artisan espresso on us",
    });
    expect(reward.id).toBeDefined();
    expect(reward.costPoints).toBe(1);

    // 2. Customer joins the programme (initial balance = 0)
    const member = await joinProgramme({
      tenantSlug: slug,
      email: `prs54-cust-${Date.now()}@example.com`,
      name: "Alice Coffee Lover",
    });

    const custCtx: RequestContext = {
      userId: member.membership.userId,
      tenantId: result.tenant.id,
      role: "customer",
      requestId: "req-prs-cust",
    };

    // 3. Reward check at 0 points: should be locked with shortfall = 1
    const initialRewards = await getRewards(result.tenant.id, { memberBalance: 0 });
    const rewardForAliceInitial = initialRewards.find((r) => r.id === reward.id);
    expect(rewardForAliceInitial?.eligible).toBe(false);
    expect(rewardForAliceInitial?.pointsShortfall).toBe(1);

    // 4. Staff awards 1 point to Alice
    const earnResult = await earn(ownerCtx, {
      membershipId: member.membership.id,
      locationId: result.location.id,
      amountMinor: 100, // £1.00 -> 1 point
      idempotencyKey: crypto.randomUUID(),
    });
    expect(earnResult.pointsDelta).toBe(1);

    // 5. Reward check at 1 point: should now be ELIGIBLE (pointsShortfall = 0)
    const eligibleRewards = await getRewards(result.tenant.id, { memberBalance: 1 });
    const rewardForAliceUnlocked = eligibleRewards.find((r) => r.id === reward.id);
    expect(rewardForAliceUnlocked?.eligible).toBe(true);
    expect(rewardForAliceUnlocked?.pointsShortfall).toBe(0);

    // 6. Alice taps "Claim Reward": initiates pending redemption with 8-char code
    const redemption = await requestRedemption(custCtx, {
      membershipId: member.membership.id,
      rewardId: reward.id,
    });
    expect(redemption.code).toHaveLength(8);
    expect(redemption.costPoints).toBe(1);
    expect(redemption.rewardTitle).toBe("Free Espresso");

    // 7. Staff validates the code on scanner terminal
    const validation = await validateRedemptionCode(ownerCtx, redemption.code);
    expect(validation.reward.title).toBe("Free Espresso");
    expect(validation.reward.costPoints).toBe(1);
    expect(validation.hasSufficientBalance).toBe(true);
    expect(validation.redemption.membershipId).toBe(member.membership.id);

    // 8. Staff confirms redemption: atomic transaction deducts point, balance becomes 0
    const confirmResult = await confirmRedemption(ownerCtx, {
      code: redemption.code,
      locationId: result.location.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(confirmResult.redemptionId).toBe(redemption.redemptionId);
    expect(confirmResult.pointsDeducted).toBe(1);
    expect(confirmResult.newBalance).toBe(0);
    expect(confirmResult.rewardTitle).toBe("Free Espresso");

    // 9. Attempting to confirm the same code again must fail (prevent double spend)
    await expect(
      confirmRedemption(ownerCtx, {
        code: redemption.code,
        locationId: result.location.id,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow(/CODE_ALREADY_USED/);
  });
});

