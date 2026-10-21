# Gap Analysis vs PRS v1.0 and Client Add-on — Status Tracker

Generated: 2026-10-21
Stack: Next.js 15, PostgreSQL 16, Drizzle ORM, TypeScript, Tailwind CSS, Append-Only Ledger, HMAC Member QR.

## Summary Status Table

| Item | Description | Status | Implementation Details / Location |
| :--- | :--- | :--- | :--- |
| **A1** | Links settings, button choice, ordering, live preview | **Already Done** | `business_links` table, `validateLinkUrl`, `LinksAndPageEditor` with mobile/desktop live preview, anti-gating `getVisibleLinks`. |
| **A2** | Click analytics | **Already Done** | `link_click_events` table (no IP, no raw UA), `/go/[linkId]` route with 302, `getLinkClickAnalytics` (clicks & unique members). |
| **A3** | Private feedback table and inbox | **Already Done** | `feedback_messages` table (NO rating column by design), `submitFeedback`, owner inbox with status workflow. |
| **A4** | Rule versions | **Already Done** | `rule_versions` table, immutable versioning, `calculatePoints` (points, unitMinor, caps, exclusions). |
| **A5** | Programme lifecycle status | **In Progress** | `programmes.status` exists (draft, published, paused, archived). Enforce `published` check on earn/preview + test. |
| **A6** | Ledger columns & append-only trigger | **Already Done** | `ledger_entries` with `idempotency_key`, `rule_version_id`, `basis_amount_minor`, `related_entry_id`, append-only trigger blocking UPDATE/DELETE. |
| **A7** | Redemption security and traceability | **Already Done** | `redemptions` table stores `code_hash` (sha256) & `code_last4`, 10-min expiry, parallel confirm concurrency lock. |
| **A8** | Consent records | **Already Done** | `consent_records` table (terms & marketing), append-only, privacy centre sync, `terms_version` on `programmes`. |
| **A9** | Membership status | **In Progress** | `memberships.status` exists (active, suspended, deleted). Add `suspendMembership`/`reactivateMembership` + rejection tests. |
| **A10** | Staff to tenant and location scoping | **Already Done** | `staff_members`, `staff_location_scopes`, `can(ctx, action, resource)` with location and tenant boundary checks. |
| **A11** | Rate limiting | **To Do** | Implement `src/server/security/rate-limit.ts` (limits per IP/identity) + test suite. |
| **A12** | Duplicate member detection | **Already Done** | `joinProgramme` detects existing membership for `(tenantId, userId)` and returns existing pass safely. |
| **A13** | Email verification | **In Progress** | Add check before programme publish requiring owner verified email. |
| **A14** | Reward fields & validations | **In Progress** | `rewards` has type, quantity, limits, startsAt, endsAt. Add runtime window checks on redemption + tests. |
| **A15** | Support reports (wrong transaction) | **To Do** | Add `support_reports` table & customer reporting flow. |
| **A16** | Member QR revoke | **Already Done** | `qr_version` on `memberships`, `revokeMemberQr`, cross-tenant rejection ("Not a member of this business"). |
| **A17** | Dashboard date range and timezone | **Already Done** | Overview & reports support date ranges in tenant timezone. |
| **A18** | Feature flags and plan limits | **In Progress** | `tenants.limits` and `features` exist. Enforce location limit in location creation. |
| **Section D** | 10 Targeted Verification Tests | **In Progress** | 7 already present. Adding remaining tests (two redeems exceeding balance, full IDOR route loop, RLS test). |

