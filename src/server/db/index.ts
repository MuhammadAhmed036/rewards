import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://loyalty_app:loyalty_password@localhost:5434/loyalty_db";

// Global client cache for development hot reloading
const globalForDb = globalThis as unknown as {
  queryClient: postgres.Sql | undefined;
};

export const queryClient =
  globalForDb.queryClient ??
  postgres(connectionString, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });

export type DbClient = typeof db;
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = DbClient | DbTransaction;

/**
 * Executes a callback within a transaction scoping the PostgreSQL session to the specified tenant.
 * Sets `app.tenant_id` which enforces Row Level Security (RLS) policies.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return await callback(tx as unknown as typeof db);
  });
}

/**
 * Executes a callback within a transaction scoping the PostgreSQL session to a member user.
 * Sets `app.user_id` and optional `app.tenant_id` for customer queries across memberships.
 */
export async function withMember<T>(
  userId: string,
  tenantId: string | null,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    if (tenantId) {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    }
    return await callback(tx as unknown as typeof db);
  });
}
