# Architecture & Implementation Decisions

Record of architectural decisions and defaults chosen per Section 2 & 22 of the Loyalty Platform Build Specification.

## Locked Decisions & Defaults

1. **Member QR**:
   - Static + HMAC-SHA256 signature with versioning (`LP1.{membershipPublicId}.{qrVersion}.{hmac}`).
   - Revocation supported by bumping `memberships.qr_version`.
   - Rotating QR is deferred to P1.

2. **Scan & Earn Flow**:
   - Staff scans customer Member QR or performs manual lookup.
   - Staff confirms points/earn preview.
   - No customer-initiated earning in MVP.

3. **Earn Rate & Anti-Abuse**:
   - Default minimum minutes between earns per member is 30 minutes (`caps.minMinutesBetweenEarns: 30`).
   - Manager override with recorded audit reason allowed.

4. **Redemption Code**:
   - Short-lived one-time code (8 characters, Crockford base32 alphabet excluding ambiguous `0/O`, `1/I/L`).
   - TTL = 10 minutes. Only SHA-256 hash stored on server. Single-use only.

5. **Currency & Points Precision**:
   - Money stored strictly in integer pence (GBP minor units). Never floating point.
   - Points stored as integers. Stamps are points with a stamp-grid display mode.

6. **Anti-Gating Policy (Non-Negotiable Review Rule)**:
   - Google review button is shown identically to all members regardless of feedback, sentiment, points, or tier.
   - `getVisibleLinks(tenantId, locationId?)` signature is strictly barred from taking member/sentiment inputs.
   - Feedback form contains no star/number rating fields.

7. **Analytics Privacy**:
   - Click analytics log zero IP addresses and zero raw user agent strings.
   - Click metrics are strictly reported as "button clicks", never "reviews gained".

8. **Customer Data Deletion & Retention**:
   - Customer account deletion anonymises personal profile fields (name, email) while preserving immutable ledger rows required for regulatory and financial accounting.
   - Append-only audit and ledger entries.

9. **Timestamps & Timezones**:
   - All timestamps stored in UTC (`timestamptz`).
   - Rendered according to tenant timezone (default `Europe/London`).

10. **Platform Admin Access**:
    - Platform admin access to any tenant data is audited with an explicit reason code and logged.

11. **Local Ports**:
    - Docker compose Postgres mapped to port `5434:5432` locally to prevent conflicts with pre-existing local databases on port 5432.

12. **Owner Reports & Session Invalidation on Team Revocation**:
    - CSV exports (`ledger`, `members`, `redemptions`) are strictly permission-gated to owner/manager and write immutable audit log events (`reports.exported`) recording actor, report type, and date range parameters.
    - Staff member role modification or revocation immediately triggers active session termination (`invalidateUserSessions`) ensuring revoked credentials cannot continue making staff terminal requests.
    - Manual balance adjustments require an explicit reason code and operational note, logging an attributable audit event and creating an attributable ledger entry. Reversals are floor-constrained at 0 per Decision 8.

13. **Platform Admin Operations & Tenant Suspension Guarantees**:
    - Platform admin endpoints are protected by `isPlatformAdmin: true` and `role: "platform_admin"`.
    - Any inspection of tenant resources by platform admin records an attributable audit event (`admin.tenant_viewed`).
    - Tenant suspension requires a mandatory non-empty audit reason, terminates all active staff/owner sessions of the suspended tenant (`invalidateUserSessions`), and prevents all earn, preview-earn, and redemption activities with a `TENANT_SUSPENDED` error.
    - Historical ledger entries, balances, audit logs, and member profiles remain permanently preserved to satisfy UK accounting and compliance retention rules.

14. **UK GDPR Privacy Compliance, Email Outbox & Scheduled Maintenance**:
    - Customer Subject Access Request (SAR) export generates complete GDPR Article 15 JSON including profile, active memberships, balances, ledger history, consent records, and redemptions.
    - Granular consent management provides opt-in/opt-out toggles for marketing and analytics with append-only audit trail in `consent_records`.
    - Account deletion (Right to Erasure) pseudonymises PII (`[DELETED]`, `deleted-{id}@privacy.local`), immediately purges active sessions, soft-deletes memberships, and preserves financial transaction history in append-only `ledger_entries` for legal and tax compliance.
    - Transactional emails are written to an atomic `email_outbox` table and dispatched reliably via SMTP (Nodemailer) with exponential backoff retry.
    - Maintenance crons (`expire-redemptions`, `send-outbox`, `reconcile-balances`, `retention`) are secured with a shared `CRON_SECRET` bearer token.

15. **Launch Readiness, Pilot Seed Dataset, and Verification (M10)**:
    - Seed script (`pnpm db:seed`) creates complete pilot environments:
      - Platform administrator (`admin@platform.local`).
      - "Demo Barber" tenant with Points mode (1 pt/£1), two locations ("Soho" & "Covent Garden"), rewards ("Free Haircut" at 100 pts, "Free Beard Trim" at 50 pts), owner/manager/staff accounts, 50 sample members with randomised ledger histories, and anti-gating review links.
      - "Demo Coffee" tenant with Stamps mode (1 stamp/visit), "Shoreditch" location, "Free Coffee" reward (8 stamps), and 10 sample members.
    - Automated balance reconciliation passes across 100% of seeded memberships with zero discrepancies against the immutable ledger.
    - Full Next.js 15 production build (`next build`) produces optimized static and dynamic bundles across all 41 routes with zero compilation errors.

