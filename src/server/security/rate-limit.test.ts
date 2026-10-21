import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginRateLimit,
  checkEmailOtpRateLimit,
  checkJoinRateLimit,
  checkEarnRateLimit,
  checkFeedbackRateLimit,
  resetRateLimitBucketsForTesting,
  RateLimitError,
} from "./rate-limit";

describe("Rate Limiting Engine (FR-042, PRS Section 8)", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTesting();
  });

  it("enforces login rate limit: allows 5 attempts, blocks 6th with RATE_LIMITED", async () => {
    const ip = "192.168.1.100";

    // 5 attempts allowed
    for (let i = 0; i < 5; i++) {
      const res = await checkLoginRateLimit(ip);
      expect(res.success).toBe(true);
    }

    // 6th attempt must throw RateLimitError
    await expect(checkLoginRateLimit(ip)).rejects.toThrowError(RateLimitError);
    await expect(checkLoginRateLimit(ip)).rejects.toThrow(/RATE_LIMITED/);
  });

  it("enforces email OTP rate limit: allows 3 per 10 min, blocks 4th", async () => {
    const email = "user@example.com";

    for (let i = 0; i < 3; i++) {
      const res = await checkEmailOtpRateLimit(email);
      expect(res.success).toBe(true);
    }

    await expect(checkEmailOtpRateLimit(email)).rejects.toThrow(/RATE_LIMITED/);
  });

  it("enforces enrollment join limit: allows 10 / hour / IP, blocks 11th", async () => {
    const ip = "10.0.0.55";

    for (let i = 0; i < 10; i++) {
      const res = await checkJoinRateLimit(ip);
      expect(res.success).toBe(true);
    }

    await expect(checkJoinRateLimit(ip)).rejects.toThrow(/RATE_LIMITED/);
  });

  it("enforces staff earn rate limit: allows 30 / min / staff, blocks 31st", async () => {
    const staffId = "staff-user-123";

    for (let i = 0; i < 30; i++) {
      const res = await checkEarnRateLimit(staffId);
      expect(res.success).toBe(true);
    }

    await expect(checkEarnRateLimit(staffId)).rejects.toThrow(/RATE_LIMITED/);
  });

  it("enforces customer feedback rate limit: allows 5 / hour / member, blocks 6th", async () => {
    const memberId = "member-xyz";

    for (let i = 0; i < 5; i++) {
      const res = await checkFeedbackRateLimit(memberId);
      expect(res.success).toBe(true);
    }

    await expect(checkFeedbackRateLimit(memberId)).rejects.toThrow(/RATE_LIMITED/);
  });
});

