// Builds a realistic test business for load testing: 1 shop, 1 owner, 24 staff, 300 customers (some with points).
//   npx tsx k6/setup-data.ts        ->  writes k6/data.json (read by the k6 scripts)
// Uses the local database from .env. Never run this against production.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { registerOwnerAndTenant } from "../src/server/services/tenant";
import { addStaffMember } from "../src/server/services/staff";
import { joinProgramme } from "../src/server/services/member";
import { createReward } from "../src/server/services/rewards";
import { publishRuleVersion } from "../src/server/services/programme";
import { earn } from "../src/server/services/ledger";
import { db } from "../src/server/db";
import { tenants } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

const PASSWORD = "LoadTest-Password-1!";
const STAFF = 24;
const CUSTOMERS = 300;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to create test data in production.");
  const stamp = Date.now().toString(36);
  const slug = `load-${stamp}`;
  const owner = await registerOwnerAndTenant({
    email: `load-owner-${stamp}@loadtest.local`,
    password: PASSWORD,
    name: "Load Owner",
    businessName: `Load Test Cafe ${stamp}`,
    slug,
    emailVerified: true,
  });
  // A test shop needs more team members than the free plan allows
  await db.update(tenants).set({ limits: { maxStaff: 100, maxLocations: 5 } }).where(eq(tenants.id, owner.tenant.id));
  const ctx = { userId: owner.user.id, tenantId: owner.tenant.id, role: "owner" as const, requestId: "load-setup" };
  // No "wait 30 minutes between earns" for a load test, and room for many earns a day
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { minMinutesBetweenEarns: 0, maxPointsPerMemberPerDay: 1_000_000, maxPointsPerTransaction: 1000 },
    exclusions: {},
    expiry: {},
  });
  await createReward(ctx, { title: "Free coffee", type: "free_item", costPoints: 10, locationIds: [] });

  const staff: Array<{ email: string; password: string }> = [];
  for (let i = 0; i < STAFF; i++) {
    const email = `load-staff-${i}-${stamp}@loadtest.local`;
    await addStaffMember(ctx, { email, name: `Staff ${i}`, role: "staff", temporaryPassword: PASSWORD });
    staff.push({ email, password: PASSWORD });
  }

  const customers: Array<{ email: string; memberNumber: string; membershipId: string }> = [];
  for (let i = 0; i < CUSTOMERS; i++) {
    const email = `load-cust-${i}-${stamp}@loadtest.local`;
    const joined = await joinProgramme({ tenantSlug: slug, email, name: `Customer ${i}`, password: PASSWORD, marketingOptIn: i % 2 === 0 });
    customers.push({ email, memberNumber: joined.membership.memberNumber, membershipId: joined.membership.id });
    if (i % 3 === 0) await earn(ctx, { membershipId: joined.membership.id, locationId: owner.location.id, amountMinor: 3000 + i * 10, idempotencyKey: crypto.randomUUID() });
  }

  const out = { baseSlug: slug, password: PASSWORD, locationId: owner.location.id, owner: { email: `load-owner-${stamp}@loadtest.local`, password: PASSWORD }, staff, customers };
  fs.writeFileSync(path.join(__dirname, "data.json"), JSON.stringify(out, null, 2));
  console.log(`Wrote k6/data.json: shop "${slug}", ${STAFF} staff, ${CUSTOMERS} customers`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
