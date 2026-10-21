import { env } from "@/lib/env";

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(message = "Rate limit exceeded. Please try again later.", retryAfterSeconds = 60) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// In-memory sliding/fixed window bucket map for ultra-fast fallback & testing
const localBuckets = new Map<string, RateLimitBucket>();

// Cleanup old buckets periodically (prevent memory leak)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of localBuckets.entries()) {
      if (bucket.resetAt <= now) {
        localBuckets.delete(key);
      }
    }
  }, 60000);
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Checks and increments rate limit for a given key.
 * Uses Upstash REST API if configured, otherwise falls back to atomic in-memory window.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();

  // 1. Try Upstash Redis if configured (skip in test environment for deterministic speed)
  if (process.env.NODE_ENV !== "test" && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const redisUrl = env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "");
      const res = await fetch(`${redisUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(1000),
        body: JSON.stringify([
          ["INCR", `rl:${key}`],
          ["EXPIRE", `rl:${key}`, windowSeconds, "NX"],
          ["TTL", `rl:${key}`],
        ]),
      });

      if (res.ok) {
        const json = await res.json();
        const currentCount = Number(json[0]?.result ?? 1);
        const ttl = Number(json[2]?.result ?? windowSeconds);

        return {
          success: currentCount <= maxRequests,
          limit: maxRequests,
          remaining: Math.max(0, maxRequests - currentCount),
          resetInSeconds: ttl > 0 ? ttl : windowSeconds,
        };
      }
    } catch {
      // Gracefully fall through to in-memory bucket on network error
    }
  }

  // 2. Local In-Memory Fallback
  let bucket = localBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = {
      count: 0,
      resetAt: now + windowSeconds * 1000,
    };
    localBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, maxRequests - bucket.count);
  const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    success: bucket.count <= maxRequests,
    limit: maxRequests,
    remaining,
    resetInSeconds,
  };
}

/**
 * Asserts rate limit, throwing standard RateLimitError if exceeded
 */
export async function assertRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
  errorMessage?: string
): Promise<RateLimitResult> {
  const res = await checkRateLimit(key, maxRequests, windowSeconds);
  if (!res.success) {
    throw new RateLimitError(
      errorMessage || `RATE_LIMITED: Too many requests. Try again in ${res.resetInSeconds} seconds.`,
      res.resetInSeconds
    );
  }
  return res;
}

// ---------------------------------------------------------------------------
// Standard PRS Section 8 / FR-042 Rate Limit Helpers
// ---------------------------------------------------------------------------

export async function checkLoginRateLimit(identifier: string) {
  // 5 / min
  return await assertRateLimit(
    `login:${identifier}`,
    5,
    60,
    "RATE_LIMITED: Too many failed login attempts. Try again in 1 minute."
  );
}

export async function checkEmailOtpRateLimit(email: string) {
  // 3 per 10 min per address
  return await assertRateLimit(
    `otp:${email.toLowerCase().trim()}`,
    3,
    600,
    "RATE_LIMITED: Too many verification emails requested. Please wait before requesting another."
  );
}

export async function checkJoinRateLimit(ip: string) {
  // 10 / hour / IP
  return await assertRateLimit(
    `join:${ip}`,
    10,
    3600,
    "RATE_LIMITED: Enrollment limit reached for this connection. Please try again later."
  );
}

export async function checkScanResolveRateLimit(staffUserId: string) {
  // 60 / min / staff
  return await assertRateLimit(
    `scan:${staffUserId}`,
    60,
    60,
    "RATE_LIMITED: Scanner lookup rate limit reached. Slow down scans."
  );
}

export async function checkEarnRateLimit(staffUserId: string) {
  // 30 / min / staff
  return await assertRateLimit(
    `earn:${staffUserId}`,
    30,
    60,
    "RATE_LIMITED: Earning transaction limit reached. Please wait a moment."
  );
}

export async function checkRedemptionValidateRateLimit(staffUserId: string) {
  // 20 / min / staff
  return await assertRateLimit(
    `redeem_val:${staffUserId}`,
    20,
    60,
    "RATE_LIMITED: Redemption validation rate limit reached."
  );
}

export async function checkFeedbackRateLimit(memberOrIp: string) {
  // 5 / hour / member
  return await assertRateLimit(
    `feedback:${memberOrIp}`,
    5,
    3600,
    "RATE_LIMITED: You can submit at most 5 messages per hour. Thank you."
  );
}

export async function checkGoRedirectRateLimit(ip: string) {
  // 60 / min / IP
  return await assertRateLimit(
    `go:${ip}`,
    60,
    60,
    "RATE_LIMITED: Redirect limit exceeded."
  );
}

export async function checkPublicTenantRateLimit(ip: string) {
  // 120 / min / IP
  return await assertRateLimit(
    `public:${ip}`,
    120,
    60,
    "RATE_LIMITED: Public request rate limit exceeded."
  );
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

export function rateLimitResponse(
  retryAfterOrErr: number | RateLimitError = 60,
  customMessage?: string
) {
  const retryAfterSeconds =
    typeof retryAfterOrErr === "number"
      ? retryAfterOrErr
      : retryAfterOrErr?.retryAfterSeconds || 60;
  const message =
    customMessage ||
    (typeof retryAfterOrErr === "object" && retryAfterOrErr?.message
      ? retryAfterOrErr.message
      : `Too many requests. Please try again in ${retryAfterSeconds} seconds.`);

  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export function resetRateLimitBucketsForTesting() {
  localBuckets.clear();
}
