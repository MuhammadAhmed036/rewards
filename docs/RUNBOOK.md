# Loyalty Platform — Operational Runbook

## 1. Local Development Setup
- Runtimes: Node.js 22+ LTS, Docker Desktop, pnpm 12+.
- Start databases: `docker compose up -d` (Postgres on port 5434, Mailpit UI on http://localhost:8025).
- Migrate database: `pnpm db:migrate`
- Seed test tenants: `pnpm db:seed`
- Start dev server: `pnpm dev` (Runs on http://localhost:3000)

## 2. Emergency Operations
### 2.1 Reversing a Bad Transaction
- Staff or managers must not manually alter ledger rows (the table is append-only with DB-level triggers).
- To reverse an erroneous transaction:
  1. Access Dashboard -> Transactions / Ledger.
  2. Select the transaction and click "Reverse".
  3. Supply a mandatory reason code (`correction`, `goodwill`, `fraud_removal`).
  4. An offsetting `reverse` entry referencing the original `related_entry_id` will be created atomically with the balance update.

### 2.2 Revoking a Compromised Member QR
- If a customer's Member QR is screenshotted or leaked:
  1. Open Member profile in Dashboard or Customer account screen.
  2. Click "Revoke / Regenerate QR".
  3. The `qr_version` is incremented. All previously generated QR signatures immediately fail server-side verification.

### 2.3 Suspending a Tenant
- Platform admin console (`/admin`):
  1. Navigate to tenant detail.
  2. Select "Suspend Tenant" and provide an audited operational reason.
  3. Once suspended, all scan, earn, and redemption endpoints for that tenant reject requests with `TENANT_SUSPENDED`.

### 2.4 Reconciliation & Ledger Inconsistencies
- A nightly cron (`/api/cron/reconcile-balances`) compares `SUM(points_delta)` with `membership_balances`.
- If mismatch occurs:
  1. An alert is sent to Sentry and recorded in `audit_events`.
  2. Run `tsx scripts/reconcile.ts --tenant=<tenantId>` to audit discrepant entries.
  3. Discrepancies must be resolved via audited adjustments, never direct SQL updates.

