import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import {
  ledgerEntries,
  memberships,
  users,
  membershipBalances,
  redemptions,
  rewards,
} from "@/server/db/schema";
import { logAuditEvent } from "@/server/services/audit";
import { eq, and, gte, lte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") || "ledger";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  let csvContent = "";
  const filename = `export-${type}-${Date.now()}.csv`;

  if (type === "ledger") {
    const conditions = [eq(ledgerEntries.tenantId, ctx.tenantId!)];
    if (from) conditions.push(gte(ledgerEntries.occurredAt, from));
    if (to) conditions.push(lte(ledgerEntries.occurredAt, to));

    const rows = await db
      .select({
        id: ledgerEntries.id,
        occurredAt: ledgerEntries.occurredAt,
        type: ledgerEntries.type,
        pointsDelta: ledgerEntries.pointsDelta,
        basisAmountMinor: ledgerEntries.basisAmountMinor,
        reasonCode: ledgerEntries.reasonCode,
        idempotencyKey: ledgerEntries.idempotencyKey,
        memberNumber: memberships.memberNumber,
        customerEmail: users.email,
      })
      .from(ledgerEntries)
      .innerJoin(memberships, eq(ledgerEntries.membershipId, memberships.id))
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(...conditions));

    const header = "Transaction ID,Date (UTC),Type,Points Delta,Spend (Pence),Reason,Member Number,Customer Email\n";
    const lines = rows.map((r) =>
      [
        r.id,
        new Date(r.occurredAt).toISOString(),
        r.type,
        r.pointsDelta,
        r.basisAmountMinor || 0,
        `"${r.reasonCode || ""}"`,
        r.memberNumber,
        `"${r.customerEmail}"`,
      ].join(",")
    );
    csvContent = header + lines.join("\n");
  } else if (type === "members") {
    const rows = await db
      .select({
        id: memberships.id,
        memberNumber: memberships.memberNumber,
        joinedAt: memberships.joinedAt,
        status: memberships.status,
        marketingOptIn: memberships.marketingOptIn,
        balance: membershipBalances.balance,
        lifetimeEarned: membershipBalances.lifetimeEarned,
        lifetimeRedeemed: membershipBalances.lifetimeRedeemed,
        name: users.name,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
      .where(eq(memberships.tenantId, ctx.tenantId!));

    const header = "Member ID,Member Number,Joined Date,Status,Marketing Opt-In,Balance,Lifetime Earned,Lifetime Redeemed,Name,Email\n";
    const lines = rows.map((r) =>
      [
        r.id,
        r.memberNumber,
        new Date(r.joinedAt).toISOString(),
        r.status,
        r.marketingOptIn ? "Yes" : "No",
        r.balance || 0,
        r.lifetimeEarned || 0,
        r.lifetimeRedeemed || 0,
        `"${r.name || ""}"`,
        `"${r.email}"`,
      ].join(",")
    );
    csvContent = header + lines.join("\n");
  } else if (type === "redemptions") {
    const rows = await db
      .select({
        id: redemptions.id,
        createdAt: redemptions.createdAt,
        confirmedAt: redemptions.confirmedAt,
        status: redemptions.status,
        costPoints: redemptions.costPoints,
        codeLast4: redemptions.codeLast4,
        rewardTitle: rewards.title,
        memberNumber: memberships.memberNumber,
      })
      .from(redemptions)
      .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
      .innerJoin(memberships, eq(redemptions.membershipId, memberships.id))
      .where(eq(redemptions.tenantId, ctx.tenantId!));

    const header = "Redemption ID,Created At,Confirmed At,Status,Cost Points,Code Last 4,Reward Title,Member Number\n";
    const lines = rows.map((r) =>
      [
        r.id,
        new Date(r.createdAt).toISOString(),
        r.confirmedAt ? new Date(r.confirmedAt).toISOString() : "",
        r.status,
        r.costPoints,
        r.codeLast4,
        `"${r.rewardTitle}"`,
        r.memberNumber,
      ].join(",")
    );
    csvContent = header + lines.join("\n");
  } else {
    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  }

  // Audit event for reports export per Section 10 & 17
  await logAuditEvent(ctx, {
    action: "reports.exported",
    targetType: "report",
    targetId: type,
    metadata: { type, from: fromStr, to: toStr, filename },
  });

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
