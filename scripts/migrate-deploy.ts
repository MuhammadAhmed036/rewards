// Runs database migrations as part of a deploy build (see "vercel-build" in package.json).
// Uses the direct (unpooled) connection when one is configured, since schema changes
// should not go through a connection pooler.
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping migrations.");
    return;
  }
  const { runMigrations } = await import("../src/server/db/migrate");
  const { queryClient } = await import("../src/server/db");
  try {
    await runMigrations();
  } finally {
    await queryClient.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
