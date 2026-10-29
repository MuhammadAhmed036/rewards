// Creates (or upgrades) the platform admin account, without adding any demo data.
// Usage: pnpm admin:create you@example.com "A strong password" "Your Name"
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../src/server/db";
import { users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/auth";

async function main() {
  const [email, password, name = "Platform Admin"] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: pnpm admin:create <email> "<password>" "<name>"');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Use at least 12 characters for the admin password.");
    process.exit(1);
  }

  const normalized = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ isPlatformAdmin: true, passwordHash, emailVerifiedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log(`✅ ${normalized} is now a platform admin (password updated).`);
  } else {
    await db.insert(users).values({ email: normalized, name, passwordHash, isPlatformAdmin: true, emailVerifiedAt: new Date() });
    console.log(`✅ Created platform admin ${normalized}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
