import "dotenv/config";
import crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as verifyRoute } from "@/app/api/v1/auth/login/verify/route";
import { GET as reauthStatus, POST as reauthRoute } from "@/app/api/v1/auth/reauth/route";
import { POST as mfaRoute, GET as mfaStatus } from "@/app/api/v1/auth/mfa/route";
import { GET as exportRoute } from "@/app/api/v1/owner/reports/export/route";
import { registerOwnerAndTenant } from "../services/tenant";

const PASSWORD = "Password123!";
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = `owner-${stamp}@stepup.test`;
const BASE = "http://localhost:3000";

let ip = 1;
const headers = (cookie?: string) => ({
  "Content-Type": "application/json",
  "x-forwarded-for": `10.8.${Math.floor(ip / 250)}.${ip++ % 250}`,
  ...(cookie ? { cookie } : {}),
});
const post = (path: string, body: unknown, cookie?: string) =>
  new NextRequest(`${BASE}${path}`, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) });
const get = (path: string, cookie?: string) => new NextRequest(`${BASE}${path}`, { headers: headers(cookie) });
const cookieOf = (res: Response) => {
  const raw = res.headers.getSetCookie().find((c) => c.includes("loyalty_session="));
  return raw ? raw.split(";")[0] : undefined;
};

const CODE = "123456";
beforeAll(async () => {
  vi.spyOn(crypto, "randomInt").mockReturnValue(Number(CODE) as never);
  await registerOwnerAndTenant({ email, password: PASSWORD, name: "Step Up", businessName: "Step Up Cafe", slug: `stepup-${stamp}`, emailVerified: true });
});
afterAll(() => vi.restoreAllMocks());

describe("Email code at sign-in (FR-008)", () => {
  it("turns on with a code sent to the inbox, then asks for a code after the password", async () => {
    const first = await loginRoute(post("/api/v1/auth/login", { email, password: PASSWORD }));
    expect(first.status).toBe(200);
    const cookie = cookieOf(first)!;
    expect(cookie).toBeDefined();

    // Turning it on needs a code first, so a wrong code must not enable it
    expect((await mfaRoute(post("/api/v1/auth/mfa", { action: "send" }, cookie))).status).toBe(200);
    expect((await mfaRoute(post("/api/v1/auth/mfa", { action: "enable", code: "000000" }, cookie))).status).toBe(401);
    expect((await (await mfaStatus(get("/api/v1/auth/mfa", cookie))).json()).data.enabled).toBe(false);
    expect((await mfaRoute(post("/api/v1/auth/mfa", { action: "enable", code: CODE }, cookie))).status).toBe(200);

    // Now the password alone no longer signs in
    const second = await loginRoute(post("/api/v1/auth/login", { email, password: PASSWORD }));
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.data.mfaRequired).toBe(true);
    expect(body.data.emailHint).toMatch(/^o\*\*\*@/);
    expect(cookieOf(second)).toBeUndefined();

    // A wrong code is refused, the right one signs in, and it cannot be used twice
    const wrong = await verifyRoute(post("/api/v1/auth/login/verify", { challenge: body.data.challenge, code: "999999" }));
    expect(wrong.status).toBe(401);
    const ok = await verifyRoute(post("/api/v1/auth/login/verify", { challenge: body.data.challenge, code: CODE }));
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toBeDefined();
    const replay = await verifyRoute(post("/api/v1/auth/login/verify", { challenge: body.data.challenge, code: CODE }));
    expect(replay.status).toBe(401);
  });

  it("refuses a made-up challenge, and a code meant for another sign-in", async () => {
    const bad = await verifyRoute(post("/api/v1/auth/login/verify", { challenge: "nope", code: CODE }));
    expect(bad.status).toBe(400);
    const stranger = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
    expect((await verifyRoute(post("/api/v1/auth/login/verify", { challenge: stranger, code: CODE }))).status).toBe(401);
  });
});

describe("Sensitive actions need a recent confirmation (Section 8)", () => {
  it("blocks an export until the password is confirmed, and refuses a wrong password", async () => {
    // Sign in (with the code, as it is switched on from the test above)
    const login = await (await loginRoute(post("/api/v1/auth/login", { email, password: PASSWORD }))).json();
    const signedIn = await verifyRoute(post("/api/v1/auth/login/verify", { challenge: login.data.challenge, code: CODE }));
    const cookie = cookieOf(signedIn)!;

    expect((await (await reauthStatus(get("/api/v1/auth/reauth", cookie))).json()).data.recent).toBe(false);
    const blocked = await exportRoute(get("/api/v1/owner/reports/export?type=ledger", cookie));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("REAUTH_REQUIRED");

    expect((await reauthRoute(post("/api/v1/auth/reauth", { password: "wrong-password" }, cookie))).status).toBe(401);
    expect((await exportRoute(get("/api/v1/owner/reports/export?type=ledger", cookie))).status).toBe(403);

    expect((await reauthRoute(post("/api/v1/auth/reauth", { password: PASSWORD }, cookie))).status).toBe(200);
    expect((await (await reauthStatus(get("/api/v1/auth/reauth", cookie))).json()).data.recent).toBe(true);
    expect((await exportRoute(get("/api/v1/owner/reports/export?type=ledger", cookie))).status).toBe(200);
  });

  it("also accepts an emailed code, and is needed to turn sign-in codes off", async () => {
    const login = await (await loginRoute(post("/api/v1/auth/login", { email, password: PASSWORD }))).json();
    const cookie = cookieOf(await verifyRoute(post("/api/v1/auth/login/verify", { challenge: login.data.challenge, code: CODE })))!;

    expect((await mfaRoute(post("/api/v1/auth/mfa", { action: "disable" }, cookie))).status).toBe(403);
    expect((await reauthRoute(post("/api/v1/auth/reauth", { sendCode: true }, cookie))).status).toBe(200);
    expect((await reauthRoute(post("/api/v1/auth/reauth", { code: "111111" }, cookie))).status).toBe(401);
    expect((await reauthRoute(post("/api/v1/auth/reauth", { code: CODE }, cookie))).status).toBe(200);
    expect((await mfaRoute(post("/api/v1/auth/mfa", { action: "disable" }, cookie))).status).toBe(200);

    // Back to a plain password sign-in
    const plain = await loginRoute(post("/api/v1/auth/login", { email, password: PASSWORD }));
    expect((await plain.json()).data.mfaRequired).toBeUndefined();
    expect(cookieOf(plain)).toBeDefined();
  });
});
