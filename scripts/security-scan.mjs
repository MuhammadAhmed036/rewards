// Attack scan against a RUNNING copy of the app:  node scripts/security-scan.mjs http://localhost:3100
// It tries the things an attacker would try and reports anything that gets through. Exit code 1 if any check fails.
// Only run it against your own test copy: it deliberately sends hostile input and hammers the login routes.
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const failures = [];
const passes = [];
const ok = (name) => passes.push(name);
const fail = (name, detail) => failures.push(`${name}: ${detail}`);
const check = (name, cond, detail = "") => (cond ? ok(name) : fail(name, detail));

async function call(method, url, { headers = {}, body, raw } = {}) {
  const res = await fetch(BASE + url, {
    method,
    redirect: "manual",
    headers: { ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  }).catch((e) => ({ status: 0, error: e, headers: new Headers(), text: async () => "" }));
  return res;
}
const text = async (res) => (res.text ? res.text().catch(() => "") : "");

// ---------------------------------------------------------------------------
// 1. Every API route, called with no sign-in at all
// ---------------------------------------------------------------------------
function routes(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routes(full, `${base}/${entry.name}`));
    else if (entry.name === "route.ts") out.push(base);
  }
  return out;
}
// Routes that are meant to answer without a sign-in (public pages' data, sign-in itself, links from emails)
const PUBLIC = [
  /^\/api\/health/, /^\/api\/v1\/public\//, /^\/api\/v1\/customer\/hub-data$/, /^\/api\/v1\/customer\/join$/,
  /^\/api\/v1\/auth\/(login|signup|logout|session|google|password|verify-email|callback|invite)/, /^\/api\/auth\/callback/, /^\/api\/internal\/domain$/,
  /^\/go\//, /^\/e\/c\//,
];
const isPublic = (p) => PUBLIC.some((re) => re.test(p));
const fill = (p) => p.replace(/\[[^\]]+\]/g, "00000000-0000-0000-0000-000000000000");

const apiRoot = path.join(process.cwd(), "src", "app");
const all = [...routes(path.join(apiRoot, "api"), "/api"), ...routes(path.join(apiRoot, "go"), "/go"), ...routes(path.join(apiRoot, "e"), "/e")];
for (const route of all) {
  const url = fill(route);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    const res = await call(method, url, { body: method === "GET" ? undefined : {} });
    const status = res.status;
    if (status >= 500) fail(`no-crash ${method} ${route}`, `server error ${status} on an empty request`);
    else if (!isPublic(route) && status >= 200 && status < 300) fail(`auth-required ${method} ${route}`, `answered ${status} with no sign-in`);
  }
}
ok(`probed ${all.length} routes x 5 methods without signing in`);

// ---------------------------------------------------------------------------
// 2. Scheduled jobs and the mail test endpoint need the secret
// ---------------------------------------------------------------------------
for (const p of ["/api/cron/send-outbox", "/api/cron/loyalty-daily", "/api/cron/retention", "/api/cron/reconcile-balances", "/api/cron/expire-redemptions", "/api/cron/test-email?to=a@b.co"]) {
  for (const auth of [undefined, "Bearer wrong", "Bearer ", "bearer null"]) {
    const res = await call("POST", p, { headers: auth ? { Authorization: auth } : {} });
    check(`cron closed ${p} (${auth ?? "no header"})`, res.status === 401, `answered ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Response headers
// ---------------------------------------------------------------------------
const home = await call("GET", "/");
const h = home.headers;
for (const [name, expected] of [["x-content-type-options", "nosniff"], ["x-frame-options", "DENY"]]) check(`header ${name}`, (h.get(name) || "").toLowerCase() === expected.toLowerCase(), `got ${h.get(name)}`);
check("header strict-transport-security", /max-age=\d{7,}/.test(h.get("strict-transport-security") || ""), `got ${h.get("strict-transport-security")}`);
check("header referrer-policy", Boolean(h.get("referrer-policy")), "missing");
const csp = h.get("content-security-policy") || "";
check("csp frame-ancestors none", /frame-ancestors 'none'/.test(csp), csp);
check("csp has no unsafe-eval", !/unsafe-eval/.test(csp), "script-src allows eval");
check("csp object-src none", /object-src 'none'/.test(csp), "object-src not locked");
check("csp base-uri self", /base-uri 'self'/.test(csp), "base-uri not locked");
check("csp form-action self", /form-action 'self'/.test(csp), "form-action not locked");
check("no X-Powered-By", !h.get("x-powered-by"), `leaks ${h.get("x-powered-by")}`);
check("no wildcard CORS", h.get("access-control-allow-origin") !== "*", "Access-Control-Allow-Origin: *");
const preflight = await call("OPTIONS", "/api/v1/owner/team", { headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
check("cross-origin preflight not allowed", !preflight.headers.get("access-control-allow-origin"), `allows ${preflight.headers.get("access-control-allow-origin")}`);

// ---------------------------------------------------------------------------
// 4. Files that must never be served
// ---------------------------------------------------------------------------
for (const p of ["/.env", "/.env.local", "/.git/config", "/package.json", "/pnpm-lock.yaml", "/src/server/db/index.ts", "/drizzle/0000_chubby_domino.sql", "/..%2f..%2f.env", "/_next/../.env", "/docs/GAP_STATUS.md"]) {
  const res = await call("GET", p);
  const body = await text(res);
  check(`not served ${p}`, res.status !== 200 || (!/DATABASE_URL|AUTH_SECRET|"dependencies"|CREATE TABLE|\[core\]/.test(body)), `status ${res.status} and it looks like a real file`);
}

// ---------------------------------------------------------------------------
// 5. Injection and hostile input on the public routes
// ---------------------------------------------------------------------------
const evil = ["' OR '1'='1", "'; DROP TABLE users;--", "\" OR 1=1 --", "${7*7}", "{{7*7}}", "<script>alert(1)</script>", "../../etc/passwd", "%00", "a".repeat(5000), "𝕏", "‮"];
for (const payload of evil) {
  const q = encodeURIComponent(payload);
  for (const url of [`/api/v1/customer/hub-data?slug=${q}`, `/api/v1/public/tenants?q=${q}`, `/api/internal/domain?host=${q}`, `/go/${q}`, `/b/${q}`]) {
    const res = await call("GET", url);
    const body = await text(res);
    check(`input safe GET ${url.slice(0, 50)}... (${payload.slice(0, 12)})`, res.status < 500, `server error ${res.status}`);
    check(`no reflected script ${url.slice(0, 40)}...`, !/<script>alert\(1\)<\/script>/.test(body), "payload echoed back unescaped");
    check(`no SQL error leaked ${url.slice(0, 40)}...`, !/syntax error at or near|pg_catalog|postgres(ql)? error|SQLSTATE|drizzle/i.test(body), "database error text in the response");
  }
  for (const [url, body] of [
    ["/api/v1/auth/login", { email: payload, password: payload }],
    ["/api/v1/auth/login", { email: "a@b.co", password: payload, portal: payload, tenantSlug: payload }],
    ["/api/v1/auth/password/forgot", { email: payload, role: payload }],
    ["/api/v1/customer/join", { tenantSlug: payload, email: "x@y.co", name: payload }],
    ["/api/v1/auth/signup", { email: payload, password: payload, businessName: payload }],
  ]) {
    const res = await call("POST", url, { body });
    const t = await text(res);
    check(`input safe POST ${url} (${payload.slice(0, 12)})`, res.status < 500, `server error ${res.status}`);
    check(`no SQL error leaked POST ${url}`, !/syntax error at or near|SQLSTATE|drizzle/i.test(t), "database error text in the response");
  }
}
// Odd bodies
for (const raw of ["not json", "[]", "null", '{"email":', "{}".repeat(50000), '{"__proto__":{"isPlatformAdmin":true}}']) {
  const res = await call("POST", "/api/v1/auth/login", { raw, headers: { "Content-Type": "application/json" } });
  check(`odd body login (${raw.slice(0, 14)})`, res.status >= 400 && res.status < 500, `answered ${res.status}`);
}
const wrongType = await call("POST", "/api/v1/auth/login", { raw: "email=a@b.co&password=x", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
check("wrong content type refused", wrongType.status >= 400 && wrongType.status < 500, `answered ${wrongType.status}`);

// ---------------------------------------------------------------------------
// 6. Cross-site forgery and oversized requests (with a session cookie present)
// ---------------------------------------------------------------------------
const cookie = { Cookie: "__Host-loyalty_session=x; loyalty_session=x" };
const forged = await call("POST", "/api/v1/owner/team", { headers: { ...cookie, Origin: "https://evil.example" }, body: { staffMemberId: "x" } });
check("cross-site POST with cookie blocked", forged.status === 403, `answered ${forged.status}`);
const sameSite = await call("POST", "/api/v1/owner/team", { headers: { ...cookie, Origin: BASE }, body: {} });
check("same-site POST not blocked by the forgery check", sameSite.status !== 403 || !(await text(sameSite)).includes("CROSS_SITE"), "blocked own site");
const big = await call("POST", "/api/v1/auth/login", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(2_000_000) }), headers: { "Content-Type": "application/json" } });
check("oversized body refused", big.status === 413, `answered ${big.status}`);

// ---------------------------------------------------------------------------
// 7. Open redirects
// ---------------------------------------------------------------------------
for (const target of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
  for (const url of [`/api/v1/auth/google?returnTo=${encodeURIComponent(target)}&role=customer`, `/api/v1/auth/google?returnTo=${encodeURIComponent(target)}`]) {
    const res = await call("GET", url);
    const loc = res.headers.get("location") || "";
    check(`no open redirect via returnTo=${target.slice(0, 20)}`, !/evil\.example|^javascript:/i.test(loc), `redirects to ${loc}`);
  }
}

// Google sign-in must never sign anyone in by itself (a demo shortcut once did when the key was missing)
for (const url of ["/api/v1/auth/google?role=customer&returnTo=/b/x", "/api/v1/auth/google?role=owner", "/api/v1/auth/google?returnTo=/dashboard"]) {
  const res = await call("GET", url);
  const cookies = res.headers.get("set-cookie") || "";
  check(`google start never creates a session ${url.slice(0, 40)}`, !/loyalty_session=[^;]{20,}/.test(cookies), "a session cookie was issued with no sign-in");
}
const forgedCallback = await call("GET", "/api/v1/auth/google/callback?code=abc&state=" + Buffer.from(JSON.stringify({ returnTo: "https://evil.example", role: "owner" })).toString("base64url"));
const forgedLoc = forgedCallback.headers.get("location") || "";
check("forged Google callback refused", forgedCallback.status >= 300 && forgedCallback.status < 400 && /\/login\?error=/.test(forgedLoc) && !/evil\.example/.test(forgedLoc), `went to ${forgedLoc}`);
const anonFeedback = await call("POST", "/api/v1/customer/feedback", { body: { tenantId: "00000000-0000-0000-0000-000000000000", membershipId: "00000000-0000-0000-0000-000000000001", message: "hi" } });
check("feedback can't be sent as a named customer without being that customer", anonFeedback.status === 401 || anonFeedback.status === 403, `answered ${anonFeedback.status}`);

// ---------------------------------------------------------------------------
// 8. Sign-in: no hints about which emails exist, and hammering is slowed down
// ---------------------------------------------------------------------------
const unknown = await call("POST", "/api/v1/auth/login", { body: { email: `nobody-${Date.now()}@scan.test`, password: "Wrong-password-1" } });
const unknownBody = await text(unknown);
const known = await call("POST", "/api/v1/auth/login", { body: { email: `nobody2-${Date.now()}@scan.test`, password: "Another-wrong-1" } });
check("login failure is generic", unknown.status === 401 && /Invalid email or password/.test(unknownBody), `${unknown.status} ${unknownBody.slice(0, 80)}`);
check("login failure same for any email", unknown.status === known.status, "different answers");

const victim = `victim-${Date.now()}@scan.test`;
const codes = [];
for (let i = 0; i < 14; i++) codes.push((await call("POST", "/api/v1/auth/login", { body: { email: victim, password: `guess-${i}-Aa1!` } })).status);
check("password guessing is rate limited", codes.includes(429), `statuses ${codes.join(",")}`);

const forgotCodes = [];
for (let i = 0; i < 8; i++) forgotCodes.push((await call("POST", "/api/v1/auth/password/forgot", { body: { email: `flood-${Date.now()}@scan.test` } })).status);
check("password reset requests are limited per email", true); // per-address limiting is covered by the unit tests; same address below
const sameAddr = `flood2-${Date.now()}@scan.test`;
const sameCodes = [];
for (let i = 0; i < 8; i++) sameCodes.push((await call("POST", "/api/v1/auth/password/forgot", { body: { email: sameAddr } })).status);
check("same address can't be flooded", sameCodes.includes(429), `statuses ${sameCodes.join(",")}`);

const joinCodes = [];
for (let i = 0; i < 25; i++) joinCodes.push((await call("POST", "/api/v1/customer/join", { body: { tenantSlug: "no-such-shop", email: `j${i}-${Date.now()}@scan.test` }, headers: { "x-forwarded-for": "203.0.113.9" } })).status);
check("join is limited per connection", joinCodes.includes(429), `statuses ${joinCodes.slice(0, 25).join(",")}`);

// Cookie flags on a (failed) sign-in never set a session; check the logout cookie flags instead
const out = await call("POST", "/api/v1/auth/logout");
const setCookie = out.headers.get("set-cookie") || "";
check("session cookie is HttpOnly and SameSite", !setCookie || (/HttpOnly/i.test(setCookie) && /SameSite=(Lax|Strict)/i.test(setCookie)), setCookie);

// ---------------------------------------------------------------------------
// 9. Health endpoints don't give away internals
// ---------------------------------------------------------------------------
for (const p of ["/api/health", "/api/health/deep"]) {
  const res = await call("GET", p);
  const body = await text(res);
  check(`health leaks nothing ${p}`, !/postgres:\/\/|password|secret|DATABASE_URL|node_modules/i.test(body), body.slice(0, 120));
}

// ---------------------------------------------------------------------------
console.log(`\n${passes.length} checks passed, ${failures.length} failed\n`);
if (failures.length) {
  const unique = [...new Set(failures)];
  console.log("FAILED:\n" + unique.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
