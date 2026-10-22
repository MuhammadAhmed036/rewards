# Multi-Tenant Digital Loyalty & QR Platform (Enterprise SaaS)

A production-grade, multi-tenant digital loyalty platform designed for independent and multi-location businesses (coffee shops, barbershops, salons, restaurants, retail). Built with **Next.js 15 (App Router)**, **TypeScript**, **PostgreSQL 16**, and **Drizzle ORM**, featuring an **immutable double-entry ledger**, **HMAC-signed customer QR passes**, **staff counter terminals**, and **anti-gating review hubs**.

---

## 🔑 Default Credentials & Pre-Seeded Accounts

All demo accounts use the standard seed password:
> **Default Password:** `Password123!`

### 1. Platform SuperAdmin (Global Multi-Tenant Control)
* **Login URL:** [/login](http://localhost:3000/login) (redirects to [/admin](http://localhost:3000/admin))
* **Email:** `admin@platform.local`
* **Password:** `Password123!`
* **Capabilities:** Global tenant monitoring, health metrics, suspend/reactivate businesses, cross-tenant audit ledger inspection.

---

### 2. Tenant 1: Demo Barber (`demo-barber`) — Points Programme Mode
* **Business Public Pass Hub:** [/b/demo-barber](http://localhost:3000/b/demo-barber)
* **Programme Type:** Spend-based (1 point per £1 spent)
* **Pre-Seeded Rewards:**
  * *Free Haircut* — 100 points
  * *Free Beard Trim* — 50 points

| Role | Email | Password | Primary Portal | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Business Owner** | `barber-owner@platform.local` | `Password123!` | [/dashboard](http://localhost:3000/dashboard) | Full Business Command, Staff RBAC, Products, Rewards, Ledger, Reports |
| **General Manager** | `barber-mgr@platform.local` | `Password123!` | [/staff](http://localhost:3000/staff) | Both Soho & Covent Garden counter terminals |
| **Barber / Staff** | `barber-staff@platform.local` | `Password123!` | [/staff](http://localhost:3000/staff) | Soho counter terminal (Scan, Earn, Redeem) |
| **Sample Member** | `barber-member-1@demo.local` | `Password123!` | [/b/demo-barber](http://localhost:3000/b/demo-barber) | Customer digital pass & live QR |

---

### 3. Tenant 2: Demo Coffee (`demo-coffee`) — Stamps Programme Mode
* **Business Public Pass Hub:** [/b/demo-coffee](http://localhost:3000/b/demo-coffee)
* **Programme Type:** Visit-based (1 stamp per visit)
* **Pre-Seeded Rewards:**
  * *Complimentary Specialty Coffee* — 8 stamps

| Role | Email | Password | Primary Portal | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Business Owner** | `coffee-owner@platform.local` | `Password123!` | [/dashboard](http://localhost:3000/dashboard) | Full Store Command, Menu, Campaigns, Rewards, Team |
| **Store Manager** | `coffee-mgr@platform.local` | `Password123!` | [/staff](http://localhost:3000/staff) | Shoreditch branch terminal & staff approvals |
| **Barista / Staff** | `coffee-staff@platform.local` | `Password123!` | [/staff](http://localhost:3000/staff) | Shoreditch counter terminal (Scan, Stamp, Voucher Redeem) |
| **Sample Member** | `coffee-member-1@demo.local` | `Password123!` | [/b/demo-coffee](http://localhost:3000/b/demo-coffee) | Customer digital stamp card & voucher modal |

---

## 🌐 Application URL Directory

| Route | Description | Target Audience |
| :--- | :--- | :--- |
| `/` | Enterprise Landing Page & Business Registration Portal | Public Visitors & Store Owners |
| `/login` | Unified Enterprise Sign In | SuperAdmin, Business Owners, Staff |
| `/signup` | Business Onboarding (Automated Tenant & Programme Init) | New Business Owners |
| `/admin` | Platform SuperAdmin Console | System Operators |
| `/dashboard` | Business Owner Command Console | Business Owners & Managers |
| `/staff` | Counter Scanner Terminal (Scan QR, Award Points, Redeem) | Counter Staff & Cashiers |
| `/b/[slug]` | Branded Customer Hub & Digital Loyalty Pass | End Customers |
| `/api/health` | Service Healthcheck & Database Telemetry | DevOps / Monitoring |

---

## 🛠️ CRUD Capabilities & Core Workflows

### 1. Business Tenants & Locations
* **Create:** Self-service signup at `/signup` automatically generates tenant, owner user, initial location, and default loyalty programme.
* **Update:** Configure business branding, primary hex color, store logo, and operating currency.
* **Locations:** Support for multi-location businesses with staff scoped to specific branches.

### 2. Team & Staff RBAC
* **Roles:** `owner`, `manager`, `staff`, `marketing`.
* **Management:** Invite team members, assign temporary credentials, scope permissions to specific locations, and instantly revoke staff access.

### 3. Products & Menu Catalog
* **Items:** Manage catalog items with pricing (£) and point earnings.
* **Storewide Discounts:** Apply instant storewide discounts across entire product catalogs.

### 4. Dynamic Campaign QR Signage
* **Promotional Campaigns:** Generate high-resolution printable QR codes with configurable rewards:
  * Points / Stamps Bonus
  * Free Product / Item Perk
  * Percentage Discount
* **Thresholds & Scans:** Set required visits (e.g. *3 coffees to unlock 1 free*), validity periods, and manager approval/discard controls for claimed scans.

### 5. Programme Rewards & Perks (PRS Section 5.4)
* **Curate Rewards:** Define point/stamp redemption thresholds, title, type (`free_item`, `discount`, `fixed_value`), stock limits, and per-member caps.
* **Customer Unlock:** Unlocked automatically on customer passes once balance criteria is met.
* **10-Minute One-Time Voucher:** Customer taps *"Claim Reward"* -> 8-character Crockford base32 voucher code (e.g. `7K9X2B4P`) generated with live 10-minute countdown timer and QR code.
* **Counter Confirmation:** Staff scans or enters the 8-char code -> atomic database transaction locks balance (`FOR UPDATE`), deducts points, and records immutable ledger debit.
* **Staff-Initiated Quick Redeem:** Counter staff can directly redeem eligible rewards for customers on the terminal.

### 6. Immutable Append-Only Ledger
* **Audit Integrity:** Points and stamps can never be edited or deleted directly.
* **Transactions:** Append-only ledger recording all earns, redeems, goodwill adjustments, and transaction reversals.
* **Reconciliation:** Scheduled cron job verifies balance integrity against sum of ledger deltas.

### 7. Customer Digital Pass & Anti-Gating Links
* **Pass Features:** Dynamic balance display, animated progress bars, live HMAC QR token, transaction history, and privacy exports.
* **Anti-Gating Compliance:** Google Review, Instagram, and social links displayed openly without conditional reward gating.

---

## 🚀 Production Deployment Guide

### Architecture Overview
* **Frontend & Edge API:** Vercel (Next.js 15 App Router)
* **Database:** Managed PostgreSQL 16 (Neon Serverless, Supabase, or AWS RDS)
* **Background Tasks:** Vercel Cron Jobs (`vercel.json`)
* **Email:** Resend API (Transactional welcome & audit notifications)
* **DNS:** GoDaddy / Cloudflare Custom Domain Mapping

---

### Step 1: Deploy PostgreSQL Database
1. Provision a PostgreSQL 16 database on **[Neon.tech](https://neon.tech)** or **[Supabase](https://supabase.com)**.
2. Copy your pooled connection string (`DATABASE_URL`) and direct connection string (`DATABASE_URL_UNPOOLED`).
3. Run migrations and seed data:
```bash
# Push schema migrations to production database
DATABASE_URL="<YOUR_NEON_OR_SUPABASE_POSTGRES_URL>" pnpm db:migrate

# Optional: Seed default demo data
DATABASE_URL="<YOUR_NEON_OR_SUPABASE_POSTGRES_URL>" pnpm db:seed
```

---

### Step 2: Deploy to Vercel
1. Push your repository to GitHub:
```bash
git add .
git commit -m "feat: complete multi-tenant loyalty platform"
git push origin main
```
2. In the **[Vercel Dashboard](https://vercel.com)**, click **"Add New Project"** and import your GitHub repository.
3. Select **Next.js** framework preset.
4. Add the following **Environment Variables** in Vercel:

```env
# Database Connections
DATABASE_URL=postgres://...
DATABASE_URL_UNPOOLED=postgres://...

# Application URLs
APP_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_APP_NAME="LoyaltyPlatform"

# Cryptographic Secrets (Minimum 32 random characters each)
AUTH_SECRET=generate_with_openssl_rand_hex_32
QR_SIGNING_SECRET=generate_with_openssl_rand_hex_32
CRON_SECRET=generate_with_openssl_rand_hex_32

# Email Delivery (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM_TRANSACTIONAL=no-reply@yourdomain.com

# Node Environment
NODE_ENV=production
```

5. Click **Deploy**. Vercel will build and deploy the Next.js application.

---

### Step 3: Vercel Cron Jobs Configuration
The project includes a pre-configured `vercel.json` file that automatically enables 4 background cron schedules in production:

| Route | Schedule | Purpose |
| :--- | :--- | :--- |
| `/api/cron/send-outbox` | Every minute (`* * * * *`) | Processes transactional email outbox |
| `/api/cron/expire-redemptions` | Every 5 minutes (`*/5 * * * *`) | Expires abandoned 10-minute voucher tokens |
| `/api/cron/reconcile-balances` | Hourly (`0 * * * *`) | Reconciles member balances against ledger sums |
| `/api/cron/retention` | Daily at 03:00 (`0 3 * * *`) | Enforces data retention and purge policies |

---

### Step 4: Attach Custom Domain (GoDaddy DNS Setup)
1. In your **Vercel Project Settings** -> **Domains**, add your custom domain (e.g. `yourdomain.com` and `www.yourdomain.com`).
2. Log into your **GoDaddy DNS Management Console**:
   * **A Record:**
     * Name: `@`
     * Value: `76.76.21.21` (Vercel IP)
     * TTL: `600 seconds` (10 minutes)
   * **CNAME Record:**
     * Name: `www`
     * Value: `cname.vercel-dns.com`
     * TTL: `600 seconds`
3. Vercel will automatically verify DNS propagation and issue a free SSL Certificate.

---

## 💻 Local Development & Testing Commands

```bash
# Install dependencies
pnpm install

# Start local PostgreSQL 16 & Mailpit via Docker
docker compose up -d

# Run database schema migrations
pnpm db:migrate

# Populate database with demo accounts & sample ledger history
pnpm db:seed

# Start development server on port 3000
pnpm dev

# Execute full Vitest test suite (83 tests across 19 suites)
pnpm test

# Run TypeScript type safety verification
pnpm typecheck

# Production build test
pnpm build
```

---

## 🔒 Security & Data Integrity Highlights
* **Zero Floating-Point Arithmetic:** All financial spend is stored in integer pence (`minor`) and points in exact integers.
* **Atomic Concurrency Control:** Redemptions and point awards use PostgreSQL row-level locks (`SELECT FOR UPDATE`) to prevent race conditions and duplicate claims.
* **Append-Only Triggers:** Database triggers prevent `UPDATE` or `DELETE` operations on verified ledger entries.
* **Tenant Isolation:** All queries enforce strict tenant scoping (`tenant_id`), preventing cross-tenant data leakage.
