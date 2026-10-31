import "dotenv/config";
import { describe, it, expect } from "vitest";
import { generateLiveQrToken, generateMemberQrToken, verifyAnyMemberQrToken } from "../qr";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme, resolveMemberByNumberForStaff, resolveMemberQrForStaff, setLiveQr, tenantUsesLiveQr } from "./member";
import { RequestContext } from "../security/permissions";

describe("Live QR codes: the token (FR-039)", () => {
  const now = Date.UTC(2026, 10, 1, 12, 0, 0);
  const token = generateLiveQrToken("mem_abc", 3, now);

  it("is good now and for one window either side, then expires", () => {
    expect(verifyAnyMemberQrToken(token, now)).toMatchObject({ valid: true, live: true, membershipPublicId: "mem_abc", qrVersion: 3 });
    expect(verifyAnyMemberQrToken(token, now + 25_000).valid).toBe(true);
    expect(verifyAnyMemberQrToken(token, now + 55_000).valid).toBe(true); // within the grace window
    const late = verifyAnyMemberQrToken(token, now + 95_000);
    expect(late.valid).toBe(false);
    expect(late.error).toMatch(/expired/);
    expect(verifyAnyMemberQrToken(token, now - 95_000).valid).toBe(false); // nor from the future
  });

  it("changes every 30 seconds and can't be edited", () => {
    expect(generateLiveQrToken("mem_abc", 3, now + 31_000)).not.toBe(token);
    expect(generateLiveQrToken("mem_abc", 3, now + 5_000)).toBe(token); // same window, same code
    const [p, id, v, slot, sig] = token.split(".");
    expect(verifyAnyMemberQrToken([p, id, "4", slot, sig].join("."), now).valid).toBe(false); // version changed
    expect(verifyAnyMemberQrToken([p, "mem_other", v, slot, sig].join("."), now).valid).toBe(false); // someone else's card
    expect(verifyAnyMemberQrToken([p, id, v, String(Number(slot) + 1), sig].join("."), now).valid).toBe(false); // slot moved on
  });

  it("still reads the ordinary printed code", () => {
    const printed = generateMemberQrToken("mem_abc", 3);
    expect(verifyAnyMemberQrToken(printed)).toMatchObject({ valid: true, live: false });
  });
});

describe("Live QR codes at the till", () => {
  async function shop() {
    const stamp = `live-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const s = await registerOwnerAndTenant({ email: `owner-${stamp}@live.test`, password: "Password123!", name: "Live Owner", businessName: `Live ${stamp}`, slug: stamp, emailVerified: true });
    const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "live" };
    return { ...s, ctx, slug: stamp };
  }

  it("accepts a printed code until the business turns live codes on, then only a fresh live code, once", async () => {
    const s = await shop();
    const joined = await joinProgramme({ tenantSlug: s.slug, email: `lq-${Date.now()}@live.test` });
    const publicId = joined.membership.publicId;
    const version = joined.membership.qrVersion;

    expect((await resolveMemberQrForStaff(s.ctx, joined.qrToken, s.location.id)).membershipId).toBe(joined.membership.id);

    await setLiveQr({ ...s.ctx, role: "owner" }, true);
    expect(await tenantUsesLiveQr(s.tenant.id)).toBe(true);
    // The old printed or screenshotted code no longer works
    await expect(resolveMemberQrForStaff(s.ctx, joined.qrToken, s.location.id)).rejects.toThrow(/live QR codes/);

    const live = generateLiveQrToken(publicId, version);
    expect((await resolveMemberQrForStaff(s.ctx, live, s.location.id)).membershipId).toBe(joined.membership.id);
    // Scanning the very same code again (a photo of it) is refused
    await expect(resolveMemberQrForStaff(s.ctx, live, s.location.id)).rejects.toThrow(/already scanned/);
    // A stale one is refused too
    await expect(resolveMemberQrForStaff(s.ctx, generateLiveQrToken(publicId, version, Date.now() - 120_000), s.location.id)).rejects.toThrow(/expired/);
    // Typing the customer ID is always possible
    expect((await resolveMemberByNumberForStaff(s.ctx, joined.membership.memberNumber, s.location.id)).membershipId).toBe(joined.membership.id);

    await setLiveQr(s.ctx, false);
    expect((await resolveMemberQrForStaff(s.ctx, joined.qrToken, s.location.id)).membershipId).toBe(joined.membership.id);
  });

  it("only the owner can switch it", async () => {
    const s = await shop();
    await expect(setLiveQr({ ...s.ctx, role: "staff" }, true)).rejects.toThrow(/FORBIDDEN/);
  });
});
