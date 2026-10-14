# Multi-Tenant QR Loyalty Platform — Build Specification (v1.0)

Audience: an AI coding agent (and the human developer supervising it).
Launch market: United Kingdom. Currency: GBP. Locale: en-GB. Date of spec: 14 October 2026.

Read this whole document before writing any code. Then build strictly in the milestone order in section 19. After each milestone: run lint, type-check, tests, and commit.

---

## 0. How to use this document (instructions to the AI agent)

1. Treat sections 1–3 as locked decisions. Do not change the stack or product rules without asking.
2. Build in milestones (section 19). Do not start a milestone until the previous milestone's acceptance checks pass.
3. Never trust the client for: tenant ID, price/amount, points, reward eligibility, role, or location. Derive everything server-side from the authenticated session and database.
4. Every points change goes through the ledger service (section 8). No other code may write to `ledger_entries` or `membership_balances`.
5. Money is stored as integer pence. Points are integers. Never use floats for either.
6. All timestamps are stored in UTC (`timestamptz`) and displayed in the tenant's timezone.
7. Write tests as you go (section 17). Security and concurrency tests are mandatory, not optional.
8. If something is ambiguous, pick the default listed in section 2 and note it in `docs/DECISIONS.md`.
9. Keep the UI mobile-first, accessible (WCAG 2.2 AA target), and fast. Staff screens must work one-handed on a phone.

---

## 1. Product summary

A web app (no native app) where small local businesses (salons, barbers, coffee shops, restaurants, car washes) run their own branded loyalty programme.

Core journey:
1. Business owner signs up, configures a programme (points or stamps), rewards, locations, staff, links, and prints a Join QR.
2. Customer scans the Join QR, joins with a minimal form, and receives a personal Member QR (shown in the browser).
3. At checkout, the customer shows the Member QR. Staff scans it (or searches manually), enters the spend if needed, previews the points, and confirms.
4. Customer sees points, available rewards, history, and the business's Google review / Instagram / Facebook buttons.
5. Customer redeems a reward with a short-lived one-time code (or staff starts redemption from the member profile). Staff confirms.
6. Business sees dashboard, member list, ledger, feedback inbox, link-click analytics, and reports.

Platform operator (the client) has an admin console to manage all tenants.

### 1.1 Customer page after QR scan (add-on requirement)

After a customer is identified/enters their business hub page (`/b/[slug]`), show:
- Their loyalty points (or stamps) and progress to the next reward.
- Available rewards (eligible / locked with reason).
- Google review button, Instagram button, Facebook button (only those the business enabled).
- Optional private feedback form ("Contact the business").
- Their Member QR and recent activity.

Business settings must let each business:
- Set its own links (Google review URL, Instagram URL, Facebook URL; website/other extensible).
- Choose which buttons appear, label them, and reorder them.
- Preview the customer-facing page (desktop + mobile frame) before publishing.

Analytics: track clicks on Google review, Instagram, and Facebook buttons per business/location/day.

### 1.2 Non-negotiable review rule (NO REVIEW GATING)

- Every member sees the SAME Google review button, regardless of any rating, feedback, or behaviour.
- There is no rating field anywhere in the feedback flow. Do not build any logic that shows or hides the Google button based on sentiment, feedback submission, rating, points, or tier.
- Never give points, rewards, or any incentive for leaving, changing, or deleting a Google review. No loyalty rule may reference reviews.
- The private feedback form is optional and separate; submitting it does not change what the customer sees.
- Add an automated test (section 17) that fails if the link-visibility function takes any feedback/rating/sentiment input.

---

## 2. Locked decisions and defaults

| Topic | Decision |
|---|---|
| Launch | UK, GBP only, en-GB. Structure code for future locales (next-intl) but ship English only. |
| Architecture | Single Next.js full-stack app (modular monolith). Service layer separated from route handlers so it can be extracted later. |
| Scan mode | MVP = staff scans the customer's Member QR (or manual lookup). Customer-scans-business-QR earning is NOT in MVP. |
| Join QR | Public, static per business/location. Only opens the join/hub page. Never awards points. |
| Customer login | Email magic link + Sign in with Google. No password for customers. Phone/SMS deferred. |
| Staff/owner login | Email + password (with email verification). TOTP 2FA for owner/manager is P1. |
| Programme types | Points (spend or visit based) and Stamps (visit based). One ledger for both; stamps are points with a "stamp" display mode. |
| Wallet passes | Deferred. Web membership card only, with wallet-ready data model. |
| Payments/POS | Out of scope. No card data. Staff types the qualifying amount. |
| Billing | Plan limits and feature flags in DB. Stripe subscriptions are P1, not MVP. |
| Offline | No balance-changing offline mode in MVP. Show clear offline error. |
| Multi-location | Supported. Points work across all locations of a tenant by default; rewards can be limited per location. |
| Hosting | Vercel (region lhr1, London) + Neon Postgres (eu-west-2 London). |

---

## 3. Technology stack

### 3.1 Application

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework | Next.js (latest stable, App Router), React, TypeScript (strict mode) |
| Styling | Tailwind CSS (latest stable) with CSS-variable design tokens |
| UI components | shadcn/ui (Radix primitives) + lucide-react icons |
| Forms | react-hook-form + zod resolvers |
| Validation | zod (shared schemas for client and server) |
| Data fetching (client) | TanStack Query for mutations/polling; server components for initial reads |
| Tables | TanStack Table |
| Charts | Recharts |
| Database | PostgreSQL 16 |
| ORM / migrations | Drizzle ORM + drizzle-kit (SQL migrations committed to the repo) |
| Auth | Better Auth (email/password, magic link, Google OAuth, organization/role support, 2FA plugin). Fallback: Auth.js v5. Keep behind `src/server/auth` so it can be swapped. |
| Email | Resend + React Email templates |
| Rate limiting | Upstash Redis + @upstash/ratelimit (fallback: Postgres-based limiter) |
| QR generation | `qrcode` (server and client) |
| QR scanning | `@yudiel/react-qr-scanner` (or html5-qrcode) with manual code fallback |
| File storage | Vercel Blob (logos, reward images). Allow png/jpg/webp, max 2 MB. |
| Background jobs | Vercel Cron hitting protected `/api/cron/*` routes + an `email_outbox` table (no separate queue service in MVP) |
| Logging | pino (JSON to stdout) with correlation IDs |
| Error tracking | Sentry |
| Env validation | zod-based `env.ts` that fails fast at boot |
| IDs | UUID v7 (or uuid v4) primary keys; short human member numbers (Crockford base32) |
| Dates | date-fns + @date-fns/tz |
| Testing | Vitest (unit/integration), Playwright (e2e), testcontainers or a dedicated test DB |
| Code quality | ESLint, Prettier, Husky + lint-staged, `tsc --noEmit` in CI |
| Package manager | pnpm |

### 3.2 Why single Next.js app (not separate API server)

One deploy, one repo, shared types, fewer moving parts for a one-day MVP. Keep all business logic in `src/server/services/*` and expose it through versioned route handlers (`/api/v1/*`). If a separate API is ever needed, the services can move unchanged.

---

## 4. Infrastructure and environments

### 4.1 Environments

| Env | App | Database | Notes |
|---|---|---|---|
| Local | `pnpm dev` | Docker Postgres 16 (docker-compose) | Mailpit for email capture; seed script |
| Preview | Vercel preview per PR | Neon branch per PR (or shared staging DB) | Never connect previews to production data |
| Production | Vercel production (lhr1) | Neon production (London), PITR enabled | Protected branch, manual promote optional |

### 4.2 Services to provision (checklist)

1. GitHub private repo; protected `main`; required CI checks.
2. Vercel project (Pro for commercial use), region `lhr1`, env vars per environment.
3. Neon project in London region; production + staging branches; enable point-in-time restore; create a non-superuser app role (needed for Row Level Security to apply).
4. Domain + Cloudflare DNS (proxy on, SSL Full strict). Subdomains: `app.` (product), apex for marketing later.
5. Resend: verify sending domain (SPF, DKIM, DMARC). Separate `from` for transactional (`no-reply@`) and marketing (later).
6. Upstash Redis (EU region).
7. Sentry project (Next.js SDK, source maps upload in CI).
8. Vercel Blob store.
9. Google Cloud OAuth client (Sign in with Google): authorised redirect URIs for local, preview, production.
10. UptimeRobot/BetterStack uptime check on `/api/health`.
11. ICO registration (UK data protection fee) before launch; privacy notice and terms pages.

### 4.3 CI/CD (GitHub Actions)

On every PR: install (pnpm, cached) → lint → typecheck → unit/integration tests (with Postgres service container) → build → Playwright smoke e2e.
On merge to `main`: run DB migrations against production (`drizzle-kit migrate`) as a gated step, then Vercel deploys. Migrations must be backward compatible (expand → migrate → contract); never drop columns in the same release that stops using them.
Dependabot enabled; `pnpm audit` in CI (warn on high).

### 4.4 Backups and recovery

- Neon PITR (target retention ≥ 7 days on paid plan) + weekly logical dump to storage (`pg_dump`) via scheduled GitHub Action.
- Document RPO ≤ 15 min, RTO ≤ 4 h. Test a restore before launch and record it in `docs/RUNBOOK.md`.

### 4.5 Scheduled jobs (Vercel Cron)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/expire-redemptions` | every 5 min | Mark pending redemptions past `expires_at` as `expired` |
| `/api/cron/send-outbox` | every 1 min | Send queued emails with retry/backoff, move to dead-letter after N tries |
| `/api/cron/reconcile-balances` | nightly | Recompute balances from ledger, alert (Sentry) on any mismatch |
| `/api/cron/retention` | nightly | Apply data-retention rules (e.g. purge old click events beyond retention) |

Cron routes require `Authorization: Bearer ${CRON_SECRET}`.

### 4.6 Environment variables

```
DATABASE_URL=            # pooled connection (app role, non-superuser)
DATABASE_URL_UNPOOLED=   # for migrations
APP_URL=                 # https://app.example.com
AUTH_SECRET=             # >=32 random bytes
QR_SIGNING_SECRET=       # >=32 random bytes (member QR HMAC)
CRON_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM_TRANSACTIONAL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_APP_NAME=
```

Secrets only in Vercel/GitHub secrets. Never commit `.env*` (commit `.env.example`).

---

## 5. Repository structure

```
/
├─ .github/workflows/ci.yml
├─ docker-compose.yml            # postgres:16 + mailpit
├─ drizzle/                      # generated SQL migrations (committed)
├─ docs/ (DECISIONS.md, RUNBOOK.md, SECURITY.md)
├─ e2e/                          # Playwright tests
├─ scripts/ (seed.ts, reconcile.ts)
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/            # landing, pricing placeholder, privacy, terms
│  │  ├─ (auth)/                 # login, signup, verify, reset
│  │  ├─ b/[slug]/               # customer hub for a business (join + member view)
│  │  ├─ me/                     # customer: all my memberships, account, privacy
│  │  ├─ staff/                  # staff scan/earn/redeem screens
│  │  ├─ dashboard/              # owner/manager console
│  │  ├─ admin/                  # platform admin console
│  │  ├─ go/[linkId]/route.ts    # tracked redirect for social/review buttons
│  │  └─ api/
│  │     ├─ auth/[...all]/       # Better Auth handler
│  │     ├─ v1/…                 # versioned route handlers (section 10)
│  │     ├─ cron/…
│  │     └─ health/route.ts
│  ├─ server/
│  │  ├─ auth/                   # auth config, session helpers, role guards
│  │  ├─ db/                     # drizzle client, schema/*.ts, withTenant(), withMember()
│  │  ├─ services/               # ledger, earn, redeem, programme, rewards, members,
│  │  │                          # links, feedback, analytics, audit, consent, email
│  │  ├─ qr/                     # member token sign/verify, redemption code helpers
│  │  ├─ security/               # rate limit, idempotency, permissions (RBAC)
│  │  └─ jobs/
│  ├─ components/ (ui/ shadcn, staff/, customer/, dashboard/)
│  ├─ lib/ (money.ts, points.ts, dates.ts, zod schemas, constants)
│  └─ emails/                    # React Email templates
└─ vitest.config.ts, playwright.config.ts, drizzle.config.ts, tailwind config
```

Rules: route handlers and server actions only parse input, call a service, and shape the response. Business rules live in services. Services receive an explicit `ctx` (`{ userId, tenantId, role, locationIds, requestId }`).

---

## 6. Roles and permissions (RBAC)

| Role | Scope | Can do |
|---|---|---|
| `platform_admin` | all tenants | Create/suspend tenants, view system health, time-limited audited support access |
| `owner` | one tenant | Everything in tenant: programme, rewards, staff, links, billing, exports, manual adjustments |
| `manager` | one tenant, optionally location-scoped | Operations, members, feedback inbox, reports, manual adjustments (reason required), no billing/ownership transfer |
| `staff` | assigned locations only | Scan/search member, earn, redeem. No exports, no tenant settings, no adjustments by default |
| `marketing` (P1) | tenant | Campaigns/segments, no ledger edits |
| `customer` | own memberships | Own profile, memberships, history, redemptions, feedback, consents |

Implement a single `can(ctx, action, resource)` function (`src/server/security/permissions.ts`) with an action table, and call it in every service entry point. Add a test matrix: every action × every role.

Tenant isolation is enforced in three layers: (1) tenant-scoped queries in services, (2) Postgres RLS as defence in depth, (3) automated tenant-isolation/IDOR tests.

---

## 7. Database design (PostgreSQL)

General rules: every tenant-owned table has `tenant_id uuid not null` with an index starting with `tenant_id`; `created_at timestamptz default now()`; soft-delete via `status` where history matters; foreign keys everywhere; check constraints for enums and non-negative values.

### 7.1 Tables

**Identity (managed by auth library plus extensions)**
- `users` (id, email unique verified, name, image, is_platform_admin bool default false, created_at, deleted_at nullable)
- `sessions`, `accounts`, `verifications` (library-managed)

**Tenancy**
- `tenants` (id, slug unique, name, status [`active`,`suspended`,`closed`], industry, timezone default `Europe/London`, currency default `GBP`, locale default `en-GB`, brand_primary_hex, logo_url, plan [`free`,`pro`], features jsonb, limits jsonb, created_at)
- `locations` (id, tenant_id, public_id (short unique), name, address jsonb, timezone nullable, status)
- `staff_members` (id, tenant_id, user_id, role [`owner`,`manager`,`staff`,`marketing`], status [`invited`,`active`,`revoked`], invited_by, invited_at, accepted_at)
- `staff_location_scopes` (staff_member_id, location_id) — empty = all locations for owner/manager, required for staff
- `staff_invitations` (id, tenant_id, email, role, token_hash, expires_at, accepted_at)

**Customers and memberships**
- `memberships` (id, tenant_id, user_id, member_number (unique per tenant, 8-char Crockford base32), public_id (nanoid, opaque), qr_version int default 1, status [`active`,`suspended`,`deleted`], joined_at, joined_location_id, marketing_opt_in bool default false; unique (tenant_id, user_id))
- `consent_records` (id, tenant_id, membership_id, purpose [`programme_terms`,`marketing_email`], granted bool, text_version, source, created_at) — append-only, latest row wins
- `membership_balances` (membership_id PK, tenant_id, balance int check ≥ 0, lifetime_earned int, lifetime_redeemed int, updated_at) — projection, rebuildable

**Programme and rules**
- `programmes` (id, tenant_id, name, type [`points`,`stamps`], status [`draft`,`published`,`paused`,`archived`], current_rule_version_id, terms_version, terms_text)
- `rule_versions` (id, programme_id, tenant_id, version int, effective_from, config jsonb, created_by) — immutable; unique (programme_id, version)

`rule_versions.config` (validated by zod):
```json
{
  "earn": { "mode": "spend | visit | fixed",
            "pointsPerUnit": 1, "unitMinor": 100,
            "rounding": "down | nearest",
            "minEligibleMinor": 0,
            "pointsPerVisit": 1 },
  "caps": { "maxPointsPerTransaction": 500, "maxPointsPerMemberPerDay": 1000,
            "minMinutesBetweenEarns": 30 },
  "exclusions": { "excludeTips": true },
  "expiry": { "enabled": false, "months": 12, "warnDays": 30 },
  "locationEligibility": "all"
}
```

**Rewards and redemptions**
- `rewards` (id, tenant_id, programme_id, version int, title, description, image_url, type [`free_item`,`discount`,`upgrade`,`fixed_value`,`custom`], cost_points int > 0, starts_at, ends_at, quantity_total nullable, quantity_redeemed int default 0, per_member_limit nullable, status [`active`,`paused`,`archived`])
- `reward_locations` (reward_id, location_id) — empty = all locations
- `redemptions` (id, tenant_id, membership_id, reward_id, reward_version, cost_points, status [`pending`,`confirmed`,`expired`,`cancelled`,`voided`], code_hash, code_last4, expires_at, location_id, confirmed_by, confirmed_at, ledger_entry_id, created_at)

**Ledger (core)**
- `ledger_entries` (id, tenant_id, membership_id, type [`earn`,`redeem`,`adjust`,`reverse`,`expire`], points_delta int (non-zero), basis_amount_minor int nullable, rule_version_id nullable, reward_id nullable, redemption_id nullable, related_entry_id nullable (for reversals), location_id, actor_user_id, reason_code nullable, note nullable, idempotency_key text, occurred_at, created_at; **unique (tenant_id, idempotency_key)**)

Immutability trigger (migration):
```sql
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger_entries is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
```
Corrections are new `adjust` or `reverse` entries that reference the original.

**Links, feedback, analytics (add-on)**
- `business_links` (id, tenant_id, location_id nullable, type [`google_review`,`instagram`,`facebook`,`website`,`other`], label, url, enabled bool, sort_order int, updated_by, updated_at) — unique (tenant_id, location_id, type) for the three core types
- `link_click_events` (id, tenant_id, link_id, membership_id nullable, location_id nullable, clicked_at, source [`hub`,`receipt`,`other`], user_agent_family nullable) — no IP storage, no raw UA
- `feedback_messages` (id, tenant_id, membership_id nullable, location_id nullable, message text (≤ 2000 chars), contact_back_ok bool, status [`new`,`read`,`resolved`], handled_by, created_at) — **no rating column by design**

**Operations**
- `audit_events` (id, tenant_id nullable, actor_user_id, action, target_type, target_id, reason nullable, metadata jsonb, request_id, ip_hash nullable, created_at) — append-only
- `email_outbox` (id, tenant_id nullable, to_email, template, payload jsonb, kind [`transactional`,`marketing`], status [`queued`,`sent`,`failed`,`dead`], attempts int, next_attempt_at, last_error, created_at, sent_at)
- `idempotency_keys` (tenant_id, key, scope, request_hash, response jsonb, created_at; unique (tenant_id, key, scope)) — for non-ledger mutations
- `rate_limit_events` (only if Postgres limiter is used)

### 7.2 Indexes (minimum)

`ledger_entries (tenant_id, membership_id, occurred_at desc)`, `ledger_entries (tenant_id, occurred_at)`, `memberships (tenant_id, member_number)`, `memberships (tenant_id, user_id)`, `memberships (public_id)`, `redemptions (tenant_id, status, expires_at)`, `redemptions (code_hash)`, `link_click_events (tenant_id, clicked_at)`, `link_click_events (link_id, clicked_at)`, `feedback_messages (tenant_id, status, created_at)`, `audit_events (tenant_id, created_at)`.

### 7.3 Row Level Security (defence in depth)

- App connects as a non-superuser role. Enable and FORCE RLS on all tenant tables.
- Every request wraps DB work in a transaction helper that runs `SELECT set_config('app.tenant_id', $1, true)` (and `app.user_id` for customer paths) before queries (`withTenant`, `withMember` in `src/server/db`).

```sql
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
- For customer reads across tenants (their own memberships), add policies keyed on `app.user_id` for `memberships`, and for `ledger_entries`/`redemptions`/`membership_balances` via `membership_id IN (SELECT id FROM memberships WHERE user_id = current_setting('app.user_id', true)::uuid)`.
- Platform admin operations use an explicit, audited bypass path (separate role or `app.is_platform_admin` setting) — never the default.
- RLS is defence in depth only. Services must still scope every query by tenant.

---

## 8. Ledger, earn, and redeem logic (critical)

### 8.1 Principles
- Source of truth = `ledger_entries`. `membership_balances` is a projection updated in the SAME transaction.
- Idempotency: every earn/redeem/adjust requires an `Idempotency-Key` (UUID generated when the staff screen opens the confirm step). Unique `(tenant_id, idempotency_key)` makes retries safe: on conflict, return the original result.
- Concurrency: lock the balance row (`SELECT … FOR UPDATE` on `membership_balances`) before checking/deducting.
- Rule versioning: earn stores `rule_version_id`. Changing rules creates a new `rule_versions` row; old entries are untouched.

### 8.2 Points calculation (`src/lib/points.ts`, pure function, unit-tested)

```
eligibleMinor = amountMinor - (excludeTips ? tipMinor : 0)
if eligibleMinor < minEligibleMinor -> 0 points
spend mode : units = floor(eligibleMinor / unitMinor);  points = units * pointsPerUnit
             (rounding "nearest": round(eligibleMinor / unitMinor) * pointsPerUnit)
visit mode : points = pointsPerVisit
fixed mode : points = pointsPerVisit (manual bonus)
points = min(points, maxPointsPerTransaction)
points = min(points, maxPointsPerMemberPerDay - alreadyEarnedTodayInTenantTz)
```
Example: £18.70 (1870p), 1 point per £1 (unitMinor 100), rounding down → 18 points.

### 8.3 Earn transaction (pseudocode)

```
earn(ctx, { membershipId, locationId, amountMinor?, tipMinor?, idempotencyKey }):
  assert can(ctx,'ledger.earn') and ctx.locationIds includes locationId
  BEGIN
    existing = select from ledger where tenant_id & idempotency_key -> if found return existing
    membership = select ... where id & tenant_id & status='active'
    programme/rule = published programme's current rule_version
    lock balance row FOR UPDATE
    duplicate-visit guard: last earn within minMinutesBetweenEarns -> reject unless manager override with reason
    points = calculatePoints(...)
    if points == 0 -> reject with clear reason
    insert ledger_entries(type='earn', points_delta=+points, ...)
    update membership_balances set balance += points, lifetime_earned += points
    insert audit_event (for manual/override only) ; enqueue "points earned" email only if marketing/transactional rule allows
  COMMIT
  return { entryId, pointsDelta, newBalance, nextReward }
```
The UI must not show "success" until this returns.

### 8.4 Redeem (two supported entry points)

A) Customer-initiated: customer taps a reward → `POST …/redeem-request` creates a `pending` redemption with a random 8-character code (shown also as QR), `expires_at = now + 10 min`; only the hash is stored. Balance is NOT deducted yet.
B) Staff-initiated: staff opens member profile, picks reward, confirms with the member present.

Confirm (`redeem.confirm`): transaction → find pending redemption by code hash (tenant-scoped, not expired, status pending) → lock balance → verify balance ≥ cost, reward active, within dates, location allowed, stock, per-member limit → insert `redeem` ledger entry (negative delta) → update balance → mark redemption `confirmed` with `confirmed_by`, `ledger_entry_id` → increment `quantity_redeemed`. A code can only be confirmed once; a second attempt returns "already used".

Failure messages must be explicit and distinct: insufficient balance, expired code, already used, wrong location, reward paused/out of stock, limit reached, membership suspended.

### 8.5 Adjustments and reversals
- `adjust`: manager/owner only, `reason_code` required (`goodwill`, `correction`, `fraud_removal`, `other`) + note. Large adjustments (> configurable threshold) require owner.
- `reverse`: creates a compensating entry linked via `related_entry_id`; void of a confirmed redemption also restores stock.
- Balance must never go below 0; if a reversal would, record the shortfall in the note and cap per policy (document in DECISIONS.md).

### 8.6 Expiry (P1, build the structure now)
Cron creates `expire` ledger entries per policy and sends a warning email `warnDays` before. Off by default.

### 8.7 Reconciliation
Nightly job recomputes `SUM(points_delta)` per membership and compares to `membership_balances`; mismatch → Sentry alert + audit event (do not auto-fix silently).

---

## 9. QR design

| QR | Content | Lifetime | Notes |
|---|---|---|---|
| Join QR | `https://app.example.com/b/{tenantSlug}?loc={locationPublicId}&src=qr` | Static | Public. Printed on signage/receipts/tables. Rate-limited endpoint. |
| Member QR | `LP1.{membershipPublicId}.{qrVersion}.{hmac}` | Long-lived, revocable | Opaque; no PII, no balance. `hmac = HMAC-SHA256(QR_SIGNING_SECRET, publicId.qrVersion)` (base64url, truncated). Revoke by bumping `memberships.qr_version`. Verified server-side on every scan. |
| Redemption code | 8-char random code + QR of same | 10 minutes, single use | Only hash stored (`sha256`). Never accept after expiry or reuse. |

Scan resolve flow: staff camera decodes string → `POST /api/v1/staff/scan/resolve { token, locationId }` → server verifies signature + version + tenant match + membership active → returns minimal member summary (first name + last initial, member number, balance, available rewards) → staff proceeds to Earn or Redeem.
A Member QR from tenant A scanned at tenant B must return "Not a member of this business".
Manual fallback: search by member number (exact) or email/name (manager+, partial) within the tenant; staff role sees only minimal identity cues.
Phase 1.5/P1: optional rotating member QR (60 s HMAC window) for high-risk tenants.

Staff UI generation of printable assets: owner dashboard can download PNG/SVG/PDF of Join QR per location with title, logo, and instructions ("Scan to join and earn rewards").

---

## 10. API specification (`/api/v1`, JSON, zod-validated)

Standard response shape: `{ data }` or `{ error: { code, message, details? } }`. All mutating routes accept `Idempotency-Key`. All routes rate-limited (limits in section 12).

### Public
- `GET /public/tenants/:slug` — public programme info (name, branding, terms, enabled links, locations).
- `POST /public/tenants/:slug/join` — requires authenticated customer session; creates membership + consent records; returns membership. (Unauthenticated users are sent to login/magic-link first, then returned to `/b/:slug`.)

### Customer (`/me`)
- `GET /me/memberships`
- `GET /me/memberships/:id` — balance, next reward, rewards (eligible/locked + reason), enabled links, recent ledger (paginated).
- `GET /me/memberships/:id/qr` — returns current Member QR string.
- `POST /me/memberships/:id/redemptions` — body `{ rewardId }` → pending redemption + code.
- `DELETE /me/memberships/:id/redemptions/:rid` — cancel pending.
- `POST /me/memberships/:id/feedback` — `{ message, contactBackOk, locationId? }`.
- `GET|PATCH /me/consents`
- `POST /me/data-export` (async email with JSON), `DELETE /me` (anonymise; keep ledger with anonymised membership as legally required)
- `GET /go/:linkId` (non-API route) — logs click then 302 to the stored URL. Never accepts a URL parameter (prevents open redirect).

### Staff (`/staff`)
- `POST /staff/scan/resolve`
- `GET /staff/members/search?q=`
- `GET /staff/members/:membershipId`
- `POST /staff/earn/preview` — `{ membershipId, locationId, amountMinor?, tipMinor? }` → points preview (no write).
- `POST /staff/earn` — same + idempotency key → commits.
- `POST /staff/redemptions/validate` — `{ code }` → shows member, reward, validity.
- `POST /staff/redemptions/:id/confirm`
- `POST /staff/redemptions` — staff-initiated `{ membershipId, rewardId, locationId }`.

### Owner / manager (`/dashboard`)
- Tenant profile + branding: `GET|PATCH /tenant`, `POST /tenant/logo`
- Locations CRUD: `/locations`
- Staff: `GET /staff-members`, `POST /staff-invitations`, `PATCH /staff-members/:id` (role/scope/revoke → also invalidate sessions)
- Programme: `GET|PATCH /programme`, `POST /programme/rule-versions` (publish new version), `POST /programme/publish|pause`
- Rewards CRUD: `/rewards`
- Members: `GET /members` (search/filter/paginate), `GET /members/:id` (profile + ledger), `PATCH /members/:id` (suspend/reactivate), `POST /members/:id/adjustments`
- Ledger: `GET /ledger` (filters), `POST /ledger/:id/reverse`
- Links: `GET|PUT /links` (set url/label/enabled/order per type), `GET /links/preview-data`
- Feedback inbox: `GET /feedback`, `PATCH /feedback/:id` (status)
- Analytics: `GET /analytics/overview`, `GET /analytics/links` (clicks by link/day/location, unique members), `GET /analytics/programme`
- Reports: `GET /reports/export.csv?type=ledger|members|redemptions&from&to` (audited)
- QR assets: `GET /qr/join.png|svg|pdf?locationId`
- Audit: `GET /audit`

### Platform admin (`/admin`)
- `GET /tenants`, `GET /tenants/:id`, `POST /tenants` (create), `POST /tenants/:id/suspend|reactivate`, `PATCH /tenants/:id/plan` (limits/flags), `GET /health/overview`.

Pagination: cursor-based. Errors: stable `code` strings (e.g. `INSUFFICIENT_BALANCE`, `CODE_EXPIRED`, `CODE_ALREADY_USED`, `WRONG_TENANT`, `DUPLICATE_VISIT`, `RATE_LIMITED`, `FORBIDDEN`).

---

## 11. Business links, preview, and click analytics (add-on detail)

### 11.1 Link settings
- Fixed core types: `google_review`, `instagram`, `facebook`; plus optional `website`/`other`.
- Per type: URL, label (default "Leave a Google review", "Follow on Instagram", "Like us on Facebook"), enabled toggle, sort order. Optional per-location override (useful for multi-location Google review URLs).
- URL validation (server-side, strict):
  - Must be `https`.
  - Domain allow-lists: Google review → `google.com`, `g.page`, `maps.app.goo.gl`, `goo.gl` (maps), `search.google.com`, `g.co`; Instagram → `instagram.com`; Facebook → `facebook.com`, `fb.com`, `fb.me`. `website/other` → any https URL but flagged "external".
  - Reject credentials in URLs, `javascript:`/`data:` schemes, and overlong URLs.
- Helper text in the settings UI: "Find your Google review link in Google Business Profile → Get more reviews → Share review form."

### 11.2 Customer rendering rule
`getVisibleLinks(tenantId, locationId?)` returns enabled links ordered by `sort_order`. **Its signature must not accept any membership, feedback, rating, sentiment, points, or tier input.** Every member of a tenant sees the same set.

### 11.3 Tracked redirect
Buttons link to `/go/{linkId}`. The route handler: loads the link (tenant-scoped, enabled) → inserts `link_click_events` (membership id if logged in, location if known, no IP, no raw user agent) → responds `302` to the stored URL with `Referrer-Policy: no-referrer`. If link is disabled/missing → friendly 404 page. Bots: ignore known crawler UAs; rate-limit per IP+link.

### 11.4 Preview
Settings page shows a live preview component rendered with the same `<CustomerHub />` component in "preview mode" (sample member data, links disabled from navigating), inside a phone frame and a desktop frame toggle. Unsaved changes preview instantly; "Publish" saves.

### 11.5 Analytics
Metrics: total clicks and unique members per link per period; clicks by day; clicks by location; click-through rate = unique clickers ÷ active members in period. Show timezone and date range on every chart. Do not report "reviews gained" (the platform cannot verify that); label metrics as "button clicks".

### 11.6 Private feedback form
Optional card "Message the business" (textarea ≤ 2000 chars, checkbox "You may contact me about this", submit). Stored in `feedback_messages`; owners/managers see an inbox with status workflow (new → read → resolved) and email notification to the business contact. Rate-limit submissions (e.g. 5/hour/member). The form is never a gate to anything.

---

## 12. Security requirements

- HTTPS only; HSTS; secure, httpOnly, sameSite=lax cookies; separate shorter session lifetime for staff/owner (e.g. 12 h) vs customer (30 days).
- CSRF: rely on same-site cookies + Origin header check on all mutating route handlers.
- Security headers via `next.config`/middleware: CSP (no inline scripts except nonce), X-Content-Type-Options, Referrer-Policy, Permissions-Policy (camera allowed only on `/staff` routes), frame-ancestors none.
- Input validation with zod on every route; output encoding via React; never render user HTML. Sanitise/limit feedback text.
- Rate limits (per IP and per identity): login 5/min, magic-link/OTP email 3/10 min per address, join 10/hour/IP, scan resolve 60/min/staff, earn 30/min/staff, redemption code validate 20/min/staff, feedback 5/hour/member, `/go/*` 60/min/IP, public tenant endpoint 120/min/IP.
- Passwords: library default strong hash (argon2/scrypt); breached-password check optional (P1); lockout/backoff on repeated failures.
- Sensitive actions require recent re-authentication (adjustments > threshold, exports, staff role changes, link changes optional).
- TOTP 2FA for owner/manager (P1); required for platform admins.
- Audit-log: logins of staff/admin (success/fail), role changes, staff invites/revocation, QR revocation, manual adjustments, reversals, exports, link changes, tenant suspension, support access.
- Secrets in env only; rotate `QR_SIGNING_SECRET` via a key-ID prefix when needed (P1).
- Uploads: type/size validation, random filenames, served from blob CDN domain.
- Dependency scanning (Dependabot), `pnpm audit`, lockfile committed.
- No card/payment data stored. Minimal PII: name (optional), email, consent records.
- Tenant isolation tests (section 17) must pass before any deploy.

---

## 13. Privacy and compliance (UK)

(Planning guidance — have counsel review before launch.)
- Register with the ICO; publish a privacy notice and programme terms (linked on the join page).
- Roles: the business is typically the controller for its members; the platform acts as processor — prepare a Data Processing Agreement for tenants; platform is controller for owner/staff account data.
- Consent: programme participation is separate from marketing. Marketing email requires an explicit, unticked opt-in (PECR/UK GDPR), with one-click unsubscribe and suppression list. Record text version, source, timestamp, withdrawal.
- Rights: access/export (JSON), correction, deletion (anonymise personal fields; retain minimal ledger/audit data where lawfully needed). Log requests.
- Retention (defaults, configurable): click events 13 months; feedback messages 24 months; audit 24 months; inactive memberships anonymised after 36 months of inactivity (notify first).
- Transactional emails (magic link, reward ready, redemption receipt) are separate from marketing and never include marketing content.
- Cookies: strictly necessary only in MVP (no third-party analytics). If analytics are added later, add a consent banner.
- Loyalty-specific: clear display of how points are earned, any expiry, and reward restrictions; points have no cash value (state in terms).
- Google policy alignment: see section 1.2.

---

## 14. Design system and UI specification (Tailwind)

### 14.1 Tokens
Use CSS variables mapped into Tailwind theme so light/dark and tenant branding are easy.
```
--background, --foreground, --muted, --muted-foreground, --card, --border,
--primary, --primary-foreground (platform default), --success, --warning, --danger,
--brand, --brand-foreground (tenant-specific, set inline on customer pages)
--radius: 0.75rem
```
- Fonts via `next/font` (Inter or Geist). Base size 16px; staff screens use larger touch targets (min 48px height buttons).
- Tenant branding: owner picks `brand_primary_hex` + logo. Compute `--brand-foreground` automatically (black/white) by WCAG contrast ≥ 4.5:1; if the chosen colour fails with both, show a warning and fall back to a darkened variant.
- Components from shadcn/ui: Button, Input, Label, Select, Dialog, Sheet, Tabs, Toast (sonner), Badge, Card, Table, DropdownMenu, Skeleton, Switch, Tooltip, Form.
- Motion: subtle only; respect `prefers-reduced-motion`.
- Dark mode: supported via `prefers-color-scheme` for platform UIs; customer hub follows system.
- Accessibility: visible focus states, labelled inputs, aria-live for scan/earn results, colour never the only indicator, QR screens have a text fallback (member number), scanner has "enter code manually".
- Empty, loading (skeleton), error, offline, and permission-denied states for every screen.

### 14.2 Customer screens (mobile-first)
1. `/b/[slug]` landing (not logged in): logo, business name, one-line value prop (e.g. "Earn a stamp every visit"), reward teaser, "Join now" button, privacy/terms links.
2. Join sheet: email (magic link) or Google; checkbox for terms (required) and marketing (optional, unticked).
3. Hub (member): header with brand; points/stamps card with progress bar or stamp grid; "Show my QR" (large, brightness hint, member number below); rewards list (eligible / locked with "X more points"); link buttons row (Google review, Instagram, Facebook); "Message the business" card; recent activity list; footer (privacy, manage consent).
4. Redeem screen: shows 8-char code + QR with countdown timer, cancel button, success state when staff confirms (poll every 3 s or SSE).
5. `/me`: list of businesses joined, account settings, consents, export/delete data.

### 14.3 Staff screens (phone/tablet)
1. Location picker (if multiple) remembered per device.
2. Scan screen: full-width camera, torch toggle, "Enter member number" fallback, "Search" tab.
3. Member summary card: name (first + last initial), member number, balance, status badge, available rewards, last visit.
4. Earn: amount input (numeric keypad, £), optional tip, live preview "Will award 18 points", big Confirm button (disabled while submitting), result screen with new balance and "Done / Next customer".
5. Redeem: tab to enter/scan redemption code, or pick reward from member summary; result screen unmistakably green (success) or red (reason).
6. Recent transactions list (last 20 by this staff) for quick dispute checks.

### 14.4 Owner/manager dashboard
Sidebar: Overview, Members, Transactions, Rewards, Programme, Feedback, Links & Page (settings + preview), QR codes, Locations, Team, Reports, Settings, Audit log.
- Setup wizard (first login) with readiness checklist: profile → programme template → reward → staff → links → print QR → publish.
- Overview: members, active members (30 d), earns, redemptions, outstanding points (liability), link clicks, with date-range + timezone shown.
- Members table with search, filters, detail drawer (ledger, adjustments, suspend).
- Programme editor: template picker (Points per £ / Stamps per visit), rule form with live example ("£18.70 → 18 points"), version history with "publish new version".
- Links & Page: toggles, URL fields with validation, drag reorder, preview (phone/desktop).
- QR codes: per-location Join QR download (PNG/SVG/PDF), print-ready A5 poster.

### 14.5 Platform admin console
Tenant list/search, tenant detail (status, plan, limits, feature flags, counts), suspend/reactivate with reason, audit log, system health (cron last run, outbox backlog, reconciliation status).

### 14.6 Email templates (React Email)
Magic link, staff invitation, welcome to programme, reward unlocked, redemption confirmed (receipt), feedback received (to business), data export ready. All plain, accessible, with tenant name/logo where relevant.

---

## 15. Analytics and KPI definitions

| Metric | Definition |
|---|---|
| Members | Memberships with status active at end of period |
| Active members | Members with ≥ 1 earn or redeem in the period |
| Repeat rate | Active members with ≥ 2 qualifying earns in the period ÷ active members |
| Earn-to-redeem | Members who earned and later redeemed ≥ 1 reward ÷ members who earned |
| Outstanding points | Sum of balances (liability estimate; show money value only if business sets a point value) |
| Redemption rate | Confirmed redemptions ÷ pending+confirmed requests |
| Link clicks | Count of `link_click_events` per link; unique = distinct membership (logged-in) per period |
| Operational speed | Median seconds from scan resolve to earn confirm (staff metric, instrumented client-side event) |
Every chart: show timezone, date range, and definition tooltip. Reports must reconcile to ledger totals (test).

---

## 16. Observability and operations

- `/api/health` (DB ping, version) for uptime checks; `/api/health/deep` (protected) for cron/outbox status.
- Structured logs with `requestId`, `tenantId`, `userId`, route, latency; never log tokens, codes, or full emails.
- Sentry for errors; alert on: ledger reconciliation mismatch, outbox dead letters, 5xx rate, cron failures.
- Performance targets: p95 < 1.5 s for earn/redeem, < 2 s for dashboard reads (validate with k6 on a seeded dataset of 50 tenants × 5,000 members × 20,000 ledger entries).
- `docs/RUNBOOK.md`: how to roll back a deploy, restore DB, revoke a QR, reverse a bad transaction, suspend a tenant, rotate secrets, investigate a customer dispute.

---

## 17. Testing requirements

### Unit (Vitest)
- `calculatePoints` (rounding, min spend, tips, caps, day cap, visit/fixed modes, £18.70 → 18).
- Money helpers (parse "£18.70" → 1870, no float drift).
- RBAC matrix (`can`) for every action × role.
- QR token sign/verify (tamper, wrong version, wrong tenant).
- URL validators for link types (accept/reject lists).
- Redemption code generation + hashing.

### Integration (Postgres)
- Earn idempotency: same key twice → one ledger row, same response.
- Concurrency: 10 parallel earns with different keys → correct totals; 2 parallel confirms of the same redemption → exactly one succeeds; 2 parallel redeems exceeding balance → one fails, balance never negative.
- Ledger immutability: UPDATE/DELETE on `ledger_entries` fails.
- Reconciliation: balances equal ledger sums after a randomised sequence of operations.
- Rule versioning: publishing v2 doesn't alter v1 entries.
- Tenant isolation / IDOR: user of tenant A cannot read/write any tenant B resource by changing IDs in URL/body (test every route in a loop); staff cannot act at an unassigned location; customer cannot read another customer's membership.
- RLS: with wrong `app.tenant_id`, queries return no rows.
- Link rules: **`getVisibleLinks` signature test** (fails if it accepts feedback/rating/sentiment params) and a rendering test that the Google button appears identically for a member with and without submitted feedback.
- Click tracking: `/go/:id` logs one event, redirects only to stored URL, ignores any `?url=` param, disabled link → 404.
- Consent: marketing emails are never queued without opt-in.
- Export: CSV export is permission-gated and audited.

### E2E (Playwright)
Owner signup → create programme + reward → publish → download Join QR → customer joins (magic link via Mailpit) → staff signs in → scans/looks up member → earn with preview → customer sees balance + links + history → customer requests reward → staff confirms → balance reduced → owner sees analytics, link clicks, and feedback message.
Also: mobile viewport run, keyboard-only run for staff earn flow, axe accessibility checks on key pages.

### Security checks before launch
Tenant isolation suite green, rate-limit tests, CSP verification, dependency audit, manual review of auth/session config, backup restore test, secret scan (gitleaks) in CI.

---

## 18. Seed data (for local/dev and demos)

`pnpm db:seed` creates: platform admin; tenant "Demo Barber" (points: 1 point per £1; rewards: "Free Haircut" at 100 points, "Free Beard Trim" at 50); tenant "Demo Coffee" (stamps: 1 per visit; reward "Free Coffee" at 8 stamps); owner, manager, and staff users per tenant (known dev passwords, dev only); 2 locations for Demo Barber; 50 sample members with randomised ledger history; links for Google/Instagram/Facebook using placeholder https URLs.

---

## 19. Build plan (milestones for the AI agent)

Each milestone ends with: tests green, lint/typecheck clean, a short note in `docs/DECISIONS.md` if any default was chosen, and a git commit.

**M0 — Project foundation**
Next.js + TS strict + Tailwind + shadcn/ui, pnpm, ESLint/Prettier/Husky, `env.ts` validation, docker-compose (Postgres 16 + Mailpit), Drizzle setup and migration workflow, pino logger, Sentry stub, `/api/health`, GitHub Actions CI, README with setup commands.
Accept: `pnpm dev` runs, CI passes on a trivial PR.

**M1 — Auth and tenancy**
Auth library, signup/login/logout, email verification, password reset, Google sign-in for customers, magic link. `tenants`, `locations`, `staff_members`, owner signup creating a tenant + first location, session helpers, `can()` RBAC, `withTenant`/`withMember` helpers, RLS policies, audit service.
Accept: tenant-isolation tests pass; RBAC matrix tests pass.

**M2 — Programme, rules, rewards**
Programme templates (points per £ / stamps per visit), rule versions (zod config), publish/pause, rewards CRUD, live rule example, points calculator with unit tests.
Accept: rule publish creates a version; calculation tests pass.

**M3 — Customer join and member QR**
`/b/[slug]` landing, join flow with consent records, membership creation (member number, public id), Member QR sign/verify, QR display with member number fallback, owner Join QR download (PNG/SVG/PDF).
Accept: customer can join on mobile and see QR; tampered/wrong-tenant QR rejected.

**M4 — Ledger, earn, redeem (core)**
Ledger tables + immutability trigger, balance projection, earn preview/commit with idempotency + locking + caps + duplicate-visit guard, redemption request/validate/confirm, expiry cron, adjustments/reversals, reconciliation job.
Accept: all integration and concurrency tests pass.

**M5 — Staff app**
Staff screens: location picker, scanner + manual lookup, member summary, earn flow with preview, redeem flow, recent transactions, clear success/error states.
Accept: Playwright staff earn/redeem e2e passes on mobile viewport.

**M6 — Customer hub and add-on features**
Hub page with points/progress, rewards, history, redeem screen with polling, link buttons (Google/Instagram/Facebook), tracked redirect `/go/[linkId]`, private feedback form + owner inbox, owner "Links & Page" settings with validation, ordering, toggles, and live preview (phone/desktop), link-click analytics.
Accept: link rule tests (no gating), click tracking tests, preview works.

**M7 — Owner dashboard and reports**
Overview metrics, members table + detail, transactions ledger view, staff invitations/roles/location scopes (with session invalidation on revoke), locations, branding (colour/logo with contrast check), CSV export (audited), audit log viewer, setup wizard + readiness checklist.
Accept: reports reconcile to ledger; export permissions tested.

**M8 — Platform admin**
Tenant list/detail, create/suspend/reactivate, plan limits/feature flags, system health page.
Accept: suspended tenant cannot earn/redeem; records retained.

**M9 — Privacy, email, hardening**
Consent centre, unsubscribe, data export/deletion, retention cron, email outbox + templates, rate limits everywhere, CSP/security headers, 2FA for owner/manager/admin (if time), accessibility pass, empty/error/offline states.
Accept: security checklist (section 17) passes; axe checks pass.

**M10 — Deployment and launch readiness**
Neon + Vercel setup, migrations in CI, cron schedules, Sentry source maps, uptime checks, backup + restore test, runbook, seed a pilot tenant, k6 smoke load test, pilot UAT script (3 staff, real checkout timing).
Accept: Definition of done (section 21) satisfied.

---

## 20. Out of scope for MVP (do not build now)

Apple/Google Wallet passes, POS integrations and webhooks, SMS/WhatsApp, push notifications, referral codes, tiers, campaign/segment builder, A/B tests, franchise/white-label, native apps, offline balance mutations, customer-scans-business-QR earning, Stripe billing (data model has `plan`, `limits`, `features` ready), custom domains.
Design so these can be added later: stable `/api/v1`, event names (`points.earned`, `points.redeemed`, `membership.created`, …) emitted from services into an internal `events` helper (no-op/log in MVP), and an `email_outbox` that already distinguishes transactional vs marketing.

---

## 21. Definition of done (MVP)

- A business owner can register, create a branded programme with at least one reward, set Google/Instagram/Facebook links with preview, download a Join QR, and publish — with no engineering help.
- A customer can join on a mobile browser, see terms and consent options, receive a Member QR, see points/progress, rewards, history, and the enabled link buttons.
- Staff can scan or search a member, enter an amount, see the points preview, and confirm; retries and double-taps never double-credit.
- Redemption works with one-time, expiring codes; insufficient balance, expired, reused, and wrong-location cases fail with clear messages.
- Every points change has an immutable, attributable ledger entry; balances reconcile with ledger sums; dashboards reconcile with the ledger.
- Tenant isolation is proven by automated tests; staff cannot access other tenants or unassigned locations by altering IDs.
- The Google review button is identical for every member; no code path ties it to feedback, rating, points, or tier; no reward references reviews.
- Link-click analytics work for Google, Instagram, and Facebook buttons and are labelled as clicks (not reviews).
- Privacy notice, terms, consent records, unsubscribe, export/deletion flows exist and are tested.
- CI is green; production monitoring, backups, restore test, and runbook are in place; a pilot business has run a real busy shift without unreasonable checkout delay.

---

## 22. Appendix — key defaults to record in docs/DECISIONS.md

1. Member QR is static + revocable (HMAC); rotating QR is P1.
2. Earn requires staff confirmation; no customer-initiated earning.
3. Minimum minutes between earns per member defaults to 30 (configurable; manager override requires reason).
4. Redemption code TTL = 10 minutes; length 8; alphabet excludes ambiguous characters (0/O, 1/I/L).
5. Points are non-negative integers; stamps are points displayed as a stamp grid.
6. Feedback has no rating by design (anti-gating).
7. Click analytics store no IP and no raw user agent.
8. Customer data deletion anonymises personal fields but keeps minimal ledger/audit records.
9. All money in pence, all times UTC in DB, rendered in tenant timezone.
10. Platform admin access to tenant data is audited and reason-coded.
