import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { programmes, rewards, ruleVersions, tenants } from "@/server/db/schema";
import { describeRule, ruleConfigSchema } from "@/lib/points";
import { currencySymbol } from "@/lib/money";
import { LegalPage } from "@/components/legal/LegalPage";
import { LANGS, LOCALES, isLang, langFromLocale, t, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status, currency: tenants.currency, locale: tenants.locale })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant || tenant.status !== "active") return null;

  const [prog] = await db
    .select()
    .from(programmes)
    .where(and(eq(programmes.tenantId, tenant.id), inArray(programmes.status, ["published", "paused"])))
    .limit(1);
  if (!prog) return null;

  const [rule] = prog.currentRuleVersionId
    ? await db.select({ config: ruleVersions.config }).from(ruleVersions).where(eq(ruleVersions.id, prog.currentRuleVersionId)).limit(1)
    : [];
  const list = await db
    .select({ title: rewards.title, costPoints: rewards.costPoints })
    .from(rewards)
    .where(and(eq(rewards.tenantId, tenant.id), eq(rewards.status, "active")))
    .orderBy(asc(rewards.costPoints));

  const unit = prog.type === "stamps" ? "stamps" : "points";
  const config = rule ? ruleConfigSchema.parse(rule.config) : null;
  return { tenant, prog, unit, config, list, symbol: currencySymbol(tenant.currency || "GBP") };
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await load((await props.params).slug);
  return { title: data ? `${data.tenant.name} loyalty terms` : "Programme terms" };
}

/** The terms customers accept when joining a shop's programme, built from its live rules (FR-051). */
export default async function ProgrammeTermsPage(props: { params: Promise<{ slug: string }>; searchParams?: Promise<{ lang?: string }> }) {
  const { slug } = await props.params;
  const data = await load(slug);
  if (!data) notFound();
  const { tenant, prog, unit, config, list, symbol } = data;

  // The shop's own extra terms can be translated; everything else on this page stays in English
  const translations = (prog.termsTranslations ?? {}) as Record<string, string>;
  const wanted = (await props.searchParams)?.lang;
  const lang: Lang = isLang(wanted) ? wanted : langFromLocale(tenant.locale);
  const translated = lang !== "en" ? translations[lang] : undefined;
  const available = LANGS.filter((l) => l === "en" || translations[l]);

  return (
    <LegalPage title={`${tenant.name} loyalty card terms`} meta={`Version ${prog.termsVersion}`}>
      <p>
        These terms apply to the {prog.name} loyalty card run by {tenant.name}. By joining you agree to them. Please also read the{" "}
        <Link href="/privacy">privacy notice</Link>.
      </p>

      <h2>Earning {unit}</h2>
      <ul>
        {config && <li>You get {describeRule(config, unit, symbol)}.</li>}
        <li>Show your card&rsquo;s QR code, or tell staff your customer ID, before you pay. {unit[0].toUpperCase() + unit.slice(1)} are added by staff once the purchase is confirmed.</li>
        {config?.exclusions.excludeTips && <li>Tips don&rsquo;t earn {unit}.</li>}
        {config && (
          <li>
            There are limits to stop misuse: at most {config.caps.maxPointsPerTransaction}{" "}
            {config.caps.maxPointsPerTransaction === 1 ? unit.replace(/s$/, "") : unit} per purchase and{" "}
            {config.caps.maxPointsPerMemberPerDay} per day.
          </li>
        )}
        <li>Adding your card to your phone doesn&rsquo;t add {unit} by itself; a purchase has to be recorded.</li>
      </ul>

      <h2>Rewards</h2>
      {list.length > 0 ? (
        <ul>
          {list.map((r) => (
            <li key={r.title}>
              {r.title}: {r.costPoints} {unit}
            </li>
          ))}
        </ul>
      ) : (
        <p>The shop hasn&rsquo;t added rewards yet. They&rsquo;ll appear on your card when it does.</p>
      )}
      <p>
        Rewards are claimed in the shop. Some rewards may have dates, stock limits or a limit per customer; your card shows this
        when it applies. {unit[0].toUpperCase() + unit.slice(1)} and rewards have no cash value, can&rsquo;t be exchanged for money and can&rsquo;t be moved to another person.
      </p>

      <h2>Your balance</h2>
      <ul>
        {config?.expiry.enabled ? (
          <li>
            Your {unit} expire if you don&rsquo;t earn or spend any for {config.expiry.months} months. We&rsquo;ll email you{" "}
            {config.expiry.warnDays} days before, if you&rsquo;ve kept card emails on.
          </li>
        ) : (
          <li>Your {unit} don&rsquo;t expire while the programme is running.</li>
        )}
        {(config?.bonuses.welcomePoints ?? 0) > 0 && <li>New members get {config!.bonuses.welcomePoints} {unit} when they join.</li>}
        {(config?.bonuses.birthdayPoints ?? 0) > 0 && (
          <li>If you add your birthday to your account, you get {config!.bonuses.birthdayPoints} {unit} on the day.</li>
        )}
        <li>If a purchase is refunded, the {unit} it earned may be taken back.</li>
        <li>If something looks wrong, use &ldquo;Something not right?&rdquo; on your card and the shop will check.</li>
      </ul>

      <h2>Changes and closing</h2>
      <p>
        {tenant.name} may change how {unit} are earned or which rewards are offered. Changes apply from the date they&rsquo;re made;
        {" "}{unit} you already have stay on your card. If the programme closes, you&rsquo;ll be told in advance and given time to use
        your {unit}.
      </p>
      <p>
        {tenant.name} may suspend a card that&rsquo;s being misused, for example to claim {unit} for purchases that didn&rsquo;t happen.
      </p>

      {((prog.termsText && prog.termsText !== "Terms and conditions of the loyalty programme. Points have no cash value.") || translated) && (
        <>
          <h2>Extra terms from {tenant.name}</h2>
          {available.length > 1 && (
            <p className="text-sm">
              {t(lang, "terms_read_in")}:{" "}
              {available.map((l, i) => (
                <span key={l}>
                  {i > 0 && " | "}
                  {l === lang ? <strong>{LOCALES[l].label}</strong> : <Link href={`/b/${slug}/terms?lang=${l}`}>{LOCALES[l].label}</Link>}
                </span>
              ))}
            </p>
          )}
          <p className="whitespace-pre-wrap" dir={translated ? LOCALES[lang].dir : "ltr"} lang={translated ? lang : "en"}>
            {translated ?? prog.termsText}
          </p>
          {translated && <p className="text-sm text-zinc-500">{t(lang, "terms_translated_note")}</p>}
        </>
      )}

      <p className="mt-10">
        <Link href={`/b/${slug}`}>Back to {tenant.name}</Link>
      </p>
    </LegalPage>
  );
}
