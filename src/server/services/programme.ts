import { db } from "../db";
import { programmes, ruleVersions, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { ruleConfigSchema, RuleConfig } from "@/lib/points";
import { logAuditEvent } from "./audit";
import { eq, desc } from "drizzle-orm";

export async function getProgramme(ctx: RequestContext) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [prog] = await db
    .select()
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);

  if (!prog) return null;

  let currentRule: RuleConfig | null = null;
  if (prog.currentRuleVersionId) {
    const [rule] = await db
      .select()
      .from(ruleVersions)
      .where(eq(ruleVersions.id, prog.currentRuleVersionId))
      .limit(1);
    if (rule) {
      currentRule = rule.config as RuleConfig;
    }
  }

  return { programme: prog, currentRule };
}

export async function publishRuleVersion(ctx: RequestContext, configInput: unknown) {
  assertCan(ctx, "programme.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const validatedConfig = ruleConfigSchema.parse(configInput);

  const [prog] = await db
    .select()
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);

  if (!prog) {
    throw new Error(`Programme not found for tenant ${ctx.tenantId}`);
  }

  // Find latest version number
  const latestRules = await db
    .select({ version: ruleVersions.version })
    .from(ruleVersions)
    .where(eq(ruleVersions.programmeId, prog.id))
    .orderBy(desc(ruleVersions.version))
    .limit(1);

  const nextVersion = latestRules.length > 0 ? latestRules[0].version + 1 : 1;

  return await db.transaction(async (tx) => {
    const [newVersion] = await tx
      .insert(ruleVersions)
      .values({
        programmeId: prog.id,
        tenantId: ctx.tenantId!,
        version: nextVersion,
        config: validatedConfig,
        createdBy: ctx.userId,
      })
      .returning();

    await tx
      .update(programmes)
      .set({ currentRuleVersionId: newVersion.id })
      .where(eq(programmes.id, prog.id));

    await logAuditEvent(
      ctx,
      {
        action: "programme.rule_version_published",
        targetType: "rule_version",
        targetId: newVersion.id,
        metadata: { version: nextVersion, config: validatedConfig },
      },
      tx
    );

    return newVersion;
  });
}

export async function setProgrammeStatus(
  ctx: RequestContext,
  status: "published" | "paused" | "archived"
) {
  assertCan(ctx, "programme.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  // FR-015: Owner cannot publish until email is verified
  if (status === "published") {
    const [user] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    if (!user || !user.emailVerifiedAt) {
      throw new Error("Cannot publish programme: owner email must be verified first (FR-015)");
    }
  }

  const [updated] = await db
    .update(programmes)
    .set({ status })
    .where(eq(programmes.tenantId, ctx.tenantId))
    .returning();

  await logAuditEvent(ctx, {
    action: `programme.${status}`,
    targetType: "programme",
    targetId: updated.id,
  });

  return updated;
}

