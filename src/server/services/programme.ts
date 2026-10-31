import { db } from "../db";
import { programmes, ruleVersions, users, locations } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { ruleConfigSchema, RuleConfig } from "@/lib/points";
import { logAuditEvent } from "./audit";
import { isLang } from "@/lib/i18n";
import { eq, desc, and, inArray } from "drizzle-orm";

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

  // Recent rule versions, newest first, so owners can see what changed and when (FR-024)
  const history = await db
    .select({
      id: ruleVersions.id,
      version: ruleVersions.version,
      createdAt: ruleVersions.createdAt,
      createdByName: users.name,
      config: ruleVersions.config,
    })
    .from(ruleVersions)
    .leftJoin(users, eq(users.id, ruleVersions.createdBy))
    .where(eq(ruleVersions.programmeId, prog.id))
    .orderBy(desc(ruleVersions.version))
    .limit(10);

  return { programme: prog, currentRule, history };
}

export async function publishRuleVersion(ctx: RequestContext, configInput: unknown) {
  assertCan(ctx, "programme.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const validatedConfig = ruleConfigSchema.parse(configInput);

  // Location-specific rules may only name this business's own locations
  const overrideIds = [
    ...new Set([...Object.keys(validatedConfig.locationOverrides), ...(Array.isArray(validatedConfig.locationEligibility) ? validatedConfig.locationEligibility : [])]),
  ];
  if (overrideIds.length > 0) {
    const own = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, ctx.tenantId), inArray(locations.id, overrideIds)));
    if (own.length !== overrideIds.length) throw new Error("One of those locations isn't part of your business");
  }

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
      throw new Error("Confirm your email first. Use \"Send the email again\" at the top of your dashboard.");
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

const DEFAULT_TERMS = "Terms and conditions of the loyalty programme. Points have no cash value.";

/** The shop's own extra terms, in English and in each translated language. */
export async function getProgrammeTerms(ctx: RequestContext) {
  assertCan(ctx, "programme.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [p] = await db
    .select({ text: programmes.termsText, translations: programmes.termsTranslations, version: programmes.termsVersion })
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);
  if (!p) throw new Error("Programme not found");
  return { text: p.text && p.text !== DEFAULT_TERMS ? p.text : "", translations: p.translations as Record<string, string>, version: p.version };
}

/** "1.0" -> "1.1": customers who joined under an older version are told the terms changed. */
const nextVersion = (v: string) => {
  const [major, minor] = v.split(".").map((n) => parseInt(n, 10));
  return `${Number.isFinite(major) ? major : 1}.${(Number.isFinite(minor) ? minor : 0) + 1}`;
};

/** Saves the shop's extra terms and their translations. A real change raises the terms version. */
export async function updateProgrammeTerms(ctx: RequestContext, input: { text: string; translations: Record<string, string> }) {
  assertCan(ctx, "programme.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const text = input.text.trim();
  if (text.length > 8000) throw new Error("Keep the terms under 8,000 characters.");
  const translations: Record<string, string> = {};
  for (const [lang, value] of Object.entries(input.translations)) {
    if (!isLang(lang) || lang === "en") continue; // English is the main text above
    const v = value.trim();
    if (v.length > 8000) throw new Error("Keep each translation under 8,000 characters.");
    if (v) translations[lang] = v;
  }
  const [p] = await db.select().from(programmes).where(eq(programmes.tenantId, ctx.tenantId)).limit(1);
  if (!p) throw new Error("Programme not found");
  const changed = (p.termsText ?? "") !== (text || DEFAULT_TERMS) || JSON.stringify(p.termsTranslations) !== JSON.stringify(translations);
  if (!changed) return { version: p.termsVersion, changed: false };

  const version = nextVersion(p.termsVersion);
  await db.update(programmes).set({ termsText: text || DEFAULT_TERMS, termsTranslations: translations, termsVersion: version }).where(eq(programmes.id, p.id));
  await logAuditEvent(ctx, { action: "programme.terms_updated", targetType: "programme", targetId: p.id, metadata: { version, languages: Object.keys(translations) } });
  return { version, changed: true };
}
