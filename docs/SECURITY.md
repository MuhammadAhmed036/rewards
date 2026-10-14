# Security Architecture & Policies

## 1. Multi-Tenant Isolation
Tenant isolation is enforced in three defense-in-depth tiers:
1. **Service-layer tenant scoping**: Every SQL query and mutation incorporates `tenant_id = ctx.tenantId`.
2. **PostgreSQL Row Level Security (RLS)**: Enforced with `FORCE ROW LEVEL SECURITY` on all tenant-owned tables, bound to session settings via `withTenant` (`app.tenant_id`) and `withMember` (`app.user_id`).
3. **Automated IDOR & Cross-Tenant Regression Testing**: Test suites run against all API endpoints ensuring that requests containing IDs belonging to Tenant B are rejected with `FORBIDDEN` or `NOT_FOUND` when authenticated under Tenant A.

## 2. Authentication & Session Management
- **Customer sessions**: Passwordless magic link and Google OAuth. 30-day session lifetime.
- **Staff & Owner sessions**: Email/password with email verification and optional TOTP 2FA. Shorter session lifetime (12 hours) with inactivity timeouts.
- **Session Invalidation**: When a staff member is revoked or their role/location scope changes, active sessions are immediately invalidated.

## 3. Cryptographic Token Verification
- **Member QR Tokens**:
  - Format: `LP1.{membershipPublicId}.{qrVersion}.{hmac}`
  - Signature: `HMAC-SHA256(QR_SIGNING_SECRET, "${membershipPublicId}.${qrVersion}")`
  - Rejection: Any mismatch in tenant, tampering with publicId or version, or revocation increments rejects the scan.
- **Redemption Codes**:
  - 8-character Crockford Base32 generated securely.
  - Stored strictly as SHA-256 hash. Expires after 10 minutes. Atomic single-use confirmation.

## 4. Anti-Gating Policy
- In compliance with Google Business Profile rules and fairness requirements, the Google review link is unconditioned by customer sentiment, ratings, or feedback.
- `getVisibleLinks()` accepts only `tenantId` and optional `locationId`.

