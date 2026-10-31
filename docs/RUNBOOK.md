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

## 3. Seed Pilot Accounts & Dev Access
The local database seed script (`pnpm db:seed`) provisions the following accounts (all dev passwords: `Password123!`):

| Role | Email | Tenant / Scope |
| :--- | :--- | :--- |
| **Platform Admin** | `admin@platform.local` | Cross-tenant super admin (`/admin`) |
| **Barber Owner** | `barber-owner@platform.local` | Demo Barber (Points: 1 pt per £1) (`/dashboard`) |
| **Barber Manager** | `barber-mgr@platform.local` | Demo Barber (Soho & Covent Garden) |
| **Barber Staff** | `barber-staff@platform.local` | Demo Barber (Soho Terminal: `/staff`) |
| **Coffee Owner** | `coffee-owner@platform.local` | Demo Coffee (Stamps: 1 per visit) (`/dashboard`) |
| **Coffee Manager** | `coffee-mgr@platform.local` | Demo Coffee (Shoreditch) |
| **Coffee Staff** | `coffee-staff@platform.local` | Demo Coffee (Shoreditch Terminal: `/staff`) |

- **Sample Members**: 50 members in Demo Barber with randomised ledger histories, 10 members in Demo Coffee with stamp cards.
- **Review Links**: Configured for Google, Instagram, and Facebook using anti-gating compliance.

## 4. Scheduled Maintenance Crons
Protected by `Authorization: Bearer ${CRON_SECRET}`. These are the times in `vercel.json` (Vercel's free plan allows one run a day per job):

| Endpoint | Runs | Function |
| :--- | :--- | :--- |
| `/api/cron/expire-redemptions` | daily 02:00 UTC | Expires pending redemption codes past their 10-minute life. |
| `/api/cron/retention` | daily 03:00 UTC | Deletes data past its retention period (old clicks, feedback, audit, private notes, sessions). |
| `/api/cron/reconcile-balances` | daily 04:00 UTC | Checks every balance against its ledger. |
| `/api/cron/send-outbox` | daily 05:00 UTC | Sends due scheduled offers, retries failed emails and webhooks. |
| `/api/cron/loyalty-daily` | daily 06:00 UTC | Birthday bonuses, expiry warnings and expiry, inactivity emails, billing status. |

Because the free plan runs these once a day, the app also does the urgent parts itself: a failed email is retried the next time any email is sent, a scheduled offer goes out when the offers list is opened or an email is sent, and webhooks are tried straight after the event. A paid plan (or any external scheduler calling these URLs with the secret) can run them every minute.

Send a test email and see the real SMTP error: `POST /api/cron/test-email?to=you@example.com` with the secret.

## 5. Backup & Restore Procedures
- **Automated Neon / Postgres Backups**:
  - Point-in-time recovery (PITR) is enabled with 30-day retention on managed database branches.
  - Manual dump command: `docker exec -t loyalty-postgres pg_dump -U loyalty_app -d loyalty_db -F c -b -v -f /tmp/backup.dump`
  - Restore test command: `docker exec -t loyalty-postgres pg_restore -U loyalty_app -d loyalty_db -v /tmp/backup.dump`
  - **Prove it works**: `bash scripts/backup-restore-test.sh` backs up, restores into a scratch database, compares every table, checks the ledger totals and that the append-only trigger and row-level security came back, then cleans up. Run it before launch and every quarter. For production, do the same on a Neon *branch* created from a point in time.

## 6. Production Deployment Runbook (Vercel + Neon)
1. Provision PostgreSQL 16 database on Neon with connection pooling enabled.
2. In Neon console, run schema migration: `pnpm db:migrate`.
3. In Vercel Project Settings, configure environment variables:
   - `DATABASE_URL` (pooled Neon connection string)
   - `APP_URL` (`https://loyalty.yourdomain.co.uk`)
   - `SESSION_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
4. Deploy Next.js project on Vercel with automatic edge SSL and CSP headers.
5. Setup Vercel Cron jobs pointing to `/api/cron/*` with the bearer secret.

