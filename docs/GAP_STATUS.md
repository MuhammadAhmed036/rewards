# Status against the PRS v1.0

Updated: 2026-11-01. Apple Wallet and Google Wallet are out of scope by decision (FR-070 to FR-076, section 9, UC-02, and the `wallet.*` events).
Phone verification is out of scope by decision: everything runs on email.

## Done (code and automated tests)

| Area | Requirements | Where |
|---|---|---|
| Identity | FR-001 to FR-003, FR-005, FR-006 (same Gmail inbox spelled differently is caught), FR-007, FR-008 (emailed sign-in code, opt-in) | `auth/`, `step-up.test.ts` |
| Re-confirm before sensitive actions | Section 8 | `server/auth/reauth.ts` |
| Tenants, locations, roles | FR-010 to FR-013 (per-location earning rates) | `ledger.ts`, `points.ts` |
| Own domain and subdomain | FR-014 | `custom-domain.ts`, `middleware.ts` |
| Rules engine | FR-020 to FR-028 (boosts, levels, referrals, welcome, birthday, expiry, earning windows, location eligibility, amounts that don't qualify) | `points.ts`, `loyalty-jobs.ts` |
| QR and transactions | FR-030 to FR-039 (live 30-second QR), FR-040 (POS via API key), FR-042 (self-award block, flagged activity), FR-041 (offline = no balance changes, said plainly) | `qr/`, `api-keys.ts`, `use-online.ts` |
| Customer experience | FR-050 to FR-057 | `b/[slug]`, `me` |
| Rewards | FR-060 to FR-067 | `rewards.ts`, `ledger.ts` |
| Member operations | FR-080 to FR-086 (block emails, bulk import, private notes) | `blocked-emails.ts`, `member-import.ts`, `member-notes.ts` |
| Marketing | FR-090 to FR-094 (schedule, budget, segments by visit, balance, level, location and recent earning, automatic inactivity email, clicks, bounces, suppression) | `campaigns.ts`, `email-events.ts` |
| Analytics | FR-100 to FR-104 (repeat, cohorts, breakage, campaign conversion, locations, period comparison) | `analytics.ts` |
| Platform admin | FR-110 to FR-114 (plans, trials, invoices, overdue behaviour, read-only support agents) | `billing.ts`, `support-access.ts` |
| Integrations | FR-120 to FR-124 (signed webhooks, replay endpoint, API keys, CSV import with a schema version) | `webhooks.ts`, `docs/INTEGRATIONS.md` |
| Events | Appendix B vocabulary (all but `wallet.*`) | `events.ts` |
| Localisation | English, Spanish, Urdu (right to left); translated programme terms; per-language dates and numbers | `i18n.ts` |

## Needs something from outside the code

| Item | What is needed |
|---|---|
| Taking payments by card (FR-112) | A payment provider account. Plans, trials, invoices and overdue handling are built; payment is recorded by a platform admin (`markInvoicePaid`) until a provider is chosen. |
| Own domain going live | The domain must also be added in the Vercel project (automatic if `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` are set). Google sign-in is only registered for the main domain. |
| Subdomains | A wildcard DNS record `*.ROOT_DOMAIN` and `ROOT_DOMAIN` set in the environment. |
| Scheduled offers on the free Vercel plan | Crons run once a day there; due offers and retries also run whenever an email is sent or the offers list is opened. |
| Translations | Spanish and Urdu text was written without a native review; have a fluent speaker check it. |
| Load, accessibility and device testing (section 15, 16) | Real devices and a real environment; cannot be done from this codebase. |
| Legal review (section 13) | Qualified counsel, per launch market. |

## Deliberately not built (the spec itself defers these)

| Item | Why |
|---|---|
| FR-015, FR-115 Franchise groups, white-label and reseller | "Defer until validated" in section 19. A separate design is needed for what a group can share. |
| FR-029 Household memberships | P2, and only "if explicitly designed with consent". |
| FR-066 Partial redemption and reward reservations | P1 "only where the business rules justify the complexity"; stock limits and per-customer limits are built. |
| FR-096 A/B tests, FR-105 benchmarks | P2, "defer until validated". |
| FR-005 Changing the sign-in email | Name and birthday can be changed; the email is fixed (the policy allows this) because it is the account's identity. |
