import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { getProgramme, publishRuleVersion } from "./programme";
import { createReward, getRewards, updateReward } from "./rewards";
import { RequestContext } from "../security/permissions";

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
});

