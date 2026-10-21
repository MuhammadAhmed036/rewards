# Gap Analysis vs PRS v1.0 and Client Add-on — Status Tracker

Updated: 2026-10-21  
Stack: Next.js 15, PostgreSQL 16, Drizzle ORM, TypeScript, Tailwind CSS, Append-Only Ledger, HMAC Member QR.

---

## 1. Summary Status Table

| Item | Description | Status | Implementation Details / Location |
| :--- | :--- | :--- | :--- |
| **A1** | Links settings, button choice, ordering, live preview | **Completed** | `business_links` table, `validateLinkUrl`, `LinksAndPageEditor` with mobile/desktop live preview, anti-gating `getVisibleLinks`. |
| **A2** | Click analytics | **Completed** | `link_click_events` table (no IP, no raw UA), `/go/[linkId]` route with 302 redirect & `Referrer-Policy: no-referrer`, `getLinkClickAnalytics` (clicks & unique members). |
| **A3** | Private feedback table and inbox | **Completed** | `feedback_messages` table (strictly NO rating column by design), `submitFeedback`, owner inbox with status workflow (`new` -> `read` -> `resolved`). |
| **A4** | Rule versions | **Completed** | `rule_versions` table, immutable versioning, `calculatePoints` (points, unitMinor, caps, exclusions, integer arithmetic). |
| **A5** | Programme lifecycle status | **Completed** | `programmes.status` (draft, published, paused, archived). `previewEarn` and `earn` strictly reject earning when not `published`. |
| **A6** | Ledger columns & append-only trigger | **Completed** | `ledger_entries` with `idempotency_key`, `rule_version_id`, `basis_amount_minor`, `related_entry_id`, database trigger blocking UPDATE/DELETE. |
| **A7** | Redemption security and traceability | **Completed** | `redemptions` table stores `code_hash` (sha256) & `code_last4`, 10-min TTL, atomic row lock prevents concurrent double redemption. |
| **A8** | Consent records | **Completed** | `consent_records` append-only table (terms & marketing), privacy centre sync, `terms_version` on `programmes`. |
| **A9** | Membership status | **Completed** | `memberships.status` (active, suspended, deleted). Added `suspendMembership`/`reactivateMembership`, blocked earn/redeem with `MEMBERSHIP_SUSPENDED`. |
| **A10** | Staff to tenant and location scoping | **Completed** | `staff_members`, `staff_location_scopes`, `can(ctx, action, resource)` with location and tenant boundary checks. |
| **A11** | Rate limiting engine | **Completed** | `src/server/security/rate-limit.ts` (Upstash Redis + in-memory fallback) wired to login, join, feedback, scan, earn, redemption, and redirect routes. |
| **A12** | Duplicate member detection | **Completed** | `joinProgramme` detects existing membership for `(tenantId, userId)` and returns existing pass safely. |
| **A13** | Email verification | **Completed** | Owner cannot set programme status to `published` until `emailVerifiedAt` is populated. `createEmailVerificationToken`, `verifyEmailToken` implemented. |
| **A14** | Reward fields & validations | **Completed** | `rewards` table has `type`, `costPoints`, `startsAt`, `endsAt`. Runtime validity window check on redemption blocks early or expired claims. |
| **A15** | Support reports (transaction disputes) | **Completed** | `support_reports` table, `submitSupportReport`, `getSupportReports`, `resolveSupportReport` with optional goodwill manual points via ledger. |
| **A16** | Member QR revoke | **Completed** | `qr_version` on `memberships`, `revokeMemberQr`, cross-tenant rejection ("Not a member of this business"). |
| **A17** | Dashboard date range and timezone | **Completed** | Overview & reports support date ranges in tenant timezone. |
| **A18** | Feature flags and plan limits | **Completed** | `tenants.limits` enforces `maxLocations`, `maxStaff`, and `maxActiveRewards` with friendly upgrade guidance. |
| **Section D** | 10 Targeted Verification Tests | **Completed** | All 10 test suites automated and verified passing (concurrency, IDOR, RLS, anti-gating, suspensions, rate limits). |

---

## 2. Detailed Technical Breakdown

### A1 & A2. Business Links & Click Analytics
- Anti-gating policy strictly guaranteed: `getVisibleLinks(tenantId, locationId)` never accepts or inspects customer rating, feedback, sentiment, or tier.
- Google Review button is completely identical for all members.
- Redirect endpoint `/go/[linkId]` enforces 302 to stored URL only, `Referrer-Policy: no-referrer`, and rate limits incoming hits.

### A3. Private Feedback & Dispute Flow
- `feedback_messages` has NO rating column.
- Rate limited to 5 submissions per hour per member/IP.

### A4, A5 & A6. Programme Rules & Ledger Integrity
- Ledger entries are append-only; database trigger `forbid_ledger_mutation` blocks any UPDATE or DELETE statement.
- Rule publishing creates immutable `rule_versions` rows; publishing a new version leaves existing entries untouched.
- Paused programmes immediately reject `previewEarn` and `earn` calls with `PROGRAMME_NOT_PUBLISHED`.

### A7. Secure Redemptions
- Raw redemption code is never stored in plaintext (only SHA-256 `code_hash` and `code_last4`).
- Concurrency test verifies parallel redemption confirmations lock the row, allowing exactly one success while the second is rejected.

### A8 & A9. Consents & Membership Status
- GDPR / PECR compliance with append-only `consent_records`.
- `suspendMembership` immediately halts all points earning and redemption for that member until explicitly reactivated.

### A11. Rate Limiting Engine
- Built with sliding window architecture supporting Upstash Redis REST pipeline with automatic in-memory fallback.
- Standard limits enforced:
  - Login: 5 attempts / min
  - Email verification: 3 / 10 min
  - Join: 10 / hr / IP
  - QR Scanner: 60 / min / staff
  - Earn: 30 / min / staff
  - Redemption validate: 20 / min / staff
  - Feedback: 5 / hr / member
  - Redirects: 60 / min / IP

### A13. Email Verification Gate
- Owner must verify email before setting programme status to `published` (FR-015).
- Single-use 24-hour verification token dispatched through `email_outbox`.

### A14 & A15. Reward Windows & Support Disputes
- Time-bounded rewards enforce `startsAt` and `endsAt` at redemption request time.
- Customer support dispute reporting links back to ledger transactions; owner/manager can resolve disputes and issue goodwill points via `adjustBalance`.

### A18. Tier Limits
- Enforces `maxLocations`, `maxStaff`, and `maxActiveRewards` defined in `tenants.limits`.

### Section D Verification Tests
- **Test 1**: Rule versioning immutability verified.
- **Test 2**: Parallel redeems exceeding balance atomically guarded.
- **Test 3**: Anti-gating verified (feedback does not alter Google review link).
- **Test 4**: Parallel redemption code confirmations locked.
- **Test 5**: Inactive & expired rewards rejected.
- **Test 6**: Suspended members blocked from earn and redeem.
- **Test 7**: Paused programmes reject earn.
- **Test 8**: Multi-tenant IDOR boundary test loop across all operations.
- **Test 9**: Database Row Level Security (RLS) verified (queries without tenant context return 0 rows).
- **Test 10**: Rate limit burst triggers verified.
