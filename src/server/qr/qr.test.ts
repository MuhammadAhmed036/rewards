import { describe, it, expect } from "vitest";
import {
  generateMemberQrToken,
  verifyMemberQrToken,
  generateRedemptionCode,
  hashRedemptionCode,
  generateCrockfordCode,
} from "./index";

describe("QR Tokens & Cryptographic Verification (M3)", () => {
  const testPublicId = "mem_1234567890abcdef";
  const testSecret = "01234567890123456789012345678901"; // 32 bytes

  it("generates a valid Member QR token and verifies successfully", () => {
    const token = generateMemberQrToken(testPublicId, 1, testSecret);
    expect(token.startsWith("LP1.mem_1234567890abcdef.1.")).toBe(true);

    const verified = verifyMemberQrToken(token, testSecret);
    expect(verified.valid).toBe(true);
    expect(verified.membershipPublicId).toBe(testPublicId);
    expect(verified.qrVersion).toBe(1);
  });

  it("rejects tampered token where publicId is altered", () => {
    const token = generateMemberQrToken(testPublicId, 1, testSecret);
    const tampered = token.replace(testPublicId, "mem_attack_other_id");

    const verified = verifyMemberQrToken(tampered, testSecret);
    expect(verified.valid).toBe(false);
    expect(verified.error).toMatch(/tampered/i);
  });

  it("rejects tampered token where version is altered", () => {
    const token = generateMemberQrToken(testPublicId, 1, testSecret);
    const tampered = token.replace(".1.", ".2.");

    const verified = verifyMemberQrToken(tampered, testSecret);
    expect(verified.valid).toBe(false);
  });

  it("rejects token signed with wrong secret", () => {
    const token = generateMemberQrToken(testPublicId, 1, testSecret);
    const wrongSecret = "different_secret_key_123456789012";

    const verified = verifyMemberQrToken(token, wrongSecret);
    expect(verified.valid).toBe(false);
  });

  it("rejects malformed token strings", () => {
    expect(verifyMemberQrToken("garbage", testSecret).valid).toBe(false);
    expect(verifyMemberQrToken("LP1.only.three", testSecret).valid).toBe(false);
  });

  it("generates Crockford Base32 codes without ambiguous characters", () => {
    const code = generateCrockfordCode(8);
    expect(code.length).toBe(8);
    // Crockford excludes: 0, 1, I, L, O
    expect(code).not.toMatch(/[01ILOilo]/);
  });

  it("generates and verifies 8-char redemption codes and hashes", () => {
    const { code, codeHash, codeLast4 } = generateRedemptionCode();
    expect(code.length).toBe(8);
    expect(codeLast4).toBe(code.slice(-4));

    const recomputedHash = hashRedemptionCode(code);
    expect(recomputedHash).toBe(codeHash);

    // Case-insensitivity check
    expect(hashRedemptionCode(code.toLowerCase())).toBe(codeHash);
  });
});
