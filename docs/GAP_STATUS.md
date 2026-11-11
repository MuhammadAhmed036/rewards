# Status against the PRS v1.0

Updated: 2026-11-11. Apple Wallet and Google Wallet are out of scope by decision (FR-070 to FR-076, section 9, UC-02, and the `wallet.*` events).
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
| Rewards | FR-060 to FR-067, including FR-066: an open claim holds its points and stock (time set per reward), a customer can give it back, and a reward can allow part of its points for a proportional part of its value | `rewards.ts`, `ledger.ts`, `partial-reward.ts` |
| Member operations | FR-080 to FR-086 (block emails, bulk import, private notes) | `blocked-emails.ts`, `member-import.ts`, `member-notes.ts` |
| Marketing | FR-090 to FR-094 (schedule, budget, segments by visit, balance, level, location and recent earning, automatic inactivity email, clicks, bounces, suppression) | `campaigns.ts`, `email-events.ts` |
| Analytics | FR-100 to FR-104 (repeat, cohorts, breakage, campaign conversion, locations, period comparison) | `analytics.ts` |
| Groups of brands | FR-015: an owner starts a group, other brands join with its code and can leave any time. Each brand keeps its own customers, points and staff; the group's owner sees counts per brand (members, new, purchases, points given, rewards used, points held), never customer details. Points are not shared between brands. | `organisations.ts`, `GroupSettings.tsx` |
| Household cards | FR-029: a card shared by up to 4 people, joined by emailed invitation, left or removed any time, audited, with the card's QR replaced on leaving | `household.ts`, `HouseholdCard.tsx` |
| A/B tests | FR-096: a second wording of an offer sent to a chosen share, a fixed fair shuffle, results per version, and a winner only when the gap is statistically clear | `campaigns.ts`, `ab-test.ts` |
| Benchmarks | FR-105: opt-in comparison with other shops, shown as the middle half and the typical shop only, with at least 8 other shops, and the method beside the numbers | `benchmarks.ts` |
| Platform admin | FR-110 to FR-114 (plans, trials, invoices, overdue behaviour, read-only support agents) | `billing.ts`, `support-access.ts` |
| Integrations | FR-120 to FR-124 (signed webhooks, replay endpoint, API keys, CSV import with a schema version) | `webhooks.ts`, `docs/INTEGRATIONS.md` |
| Events | Appendix B vocabulary (all but `wallet.*`) | `events.ts` |
| Localisation | The language selector was removed by decision; the site is English. Dates and money follow the business's locale and currency. | `money.ts` |

## Needs something from outside the code

| Item | What is needed |
|---|---|
| Taking payments by card (FR-112) | A payment provider account. Plans, trials, invoices and overdue handling are built; payment is recorded by a platform admin (`markInvoicePaid`) until a provider is chosen. |
| Own domain going live | The domain must also be added in the Vercel project (automatic if `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` are set). Google sign-in is only registered for the main domain. |
| Subdomains | A wildcard DNS record `*.ROOT_DOMAIN` and `ROOT_DOMAIN` set in the environment. |
| Scheduled offers on the free Vercel plan | Crons run once a day there; due offers and retries also run whenever an email is sent or the offers list is opened. |
| Load, accessibility and device testing (section 15, 16) | Real devices and a real environment; cannot be done from this codebase. |
| Legal review (section 13) | Qualified counsel, per launch market. |

## Deliberately not built (the spec itself defers these)

| Item | Why |
|---|---|
| FR-115 White-label and reseller | "Defer until validated" in section 19. Shops already have their own domain and branding (FR-014); a reseller panel (their own shops, logo, domain and billing view) is built when a real partner asks. |
| Sharing customers or points across a group's brands | Decided against for now: it would change the ledger (balance per group instead of per business). Groups see combined counts only. |
| FR-005 Changing the sign-in email | Name and birthday can be changed; the email is fixed (the policy allows this) because it is the account's identity. |
