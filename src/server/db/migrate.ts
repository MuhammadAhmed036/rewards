import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./index";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config();

export async function runMigrations() {
  console.log("⏳ Applying database migrations...");
  try {
    // 1. Run generated Drizzle schema migrations
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✅ Drizzle schema migrations applied successfully.");

    // 2. Apply Section 7.1 Ledger Immutability Trigger
    console.log("⏳ Setting up ledger immutability trigger...");
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
      BEGIN 
        RAISE EXCEPTION 'ledger_entries is append-only'; 
      END $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS ledger_no_update_delete ON ledger_entries;
      CREATE TRIGGER ledger_no_update_delete
        BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
    `);
    console.log("✅ Ledger immutability trigger configured.");

    // 3. Apply Section 7.3 Row Level Security (RLS)
    console.log("⏳ Setting up Row Level Security (RLS)...");
    await db.execute(sql`
      -- Enable and force RLS on ledger_entries
      ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON ledger_entries;
      CREATE POLICY tenant_isolation ON ledger_entries
        USING (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );

      -- Enable and force RLS on membership_balances
      ALTER TABLE membership_balances ENABLE ROW LEVEL SECURITY;
      ALTER TABLE membership_balances FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation_balances ON membership_balances;
      CREATE POLICY tenant_isolation_balances ON membership_balances
        USING (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.is_platform_admin', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
    `);
    console.log("✅ Row Level Security policies configured.");
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes("migrate.ts")) {
  runMigrations()
    .then(async () => {
      await queryClient.end();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await queryClient.end();
      process.exit(1);
    });
}

