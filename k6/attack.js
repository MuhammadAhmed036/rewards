// Does the shop keep working for normal people while someone attacks it?
// Normal visitors browse and staff earn points while attackers flood sign-in, password reset, join and sign-up,
// send huge bodies, and guess passwords on real accounts. Pass = normal traffic stays fast, attackers get 429s.
//   k6 run k6/attack.js
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import { BASE, data, login, authed, pick, fakeIp } from "./common.js";

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 400, 401, 403, 404, 409, 413, 422, 429));
const blocked = new Counter("attack_blocked_429_or_413");
const got500 = new Rate("server_errors");
const hdr = (ip) => ({ headers: { "Content-Type": "application/json", "x-forwarded-for": ip } });

export const options = {
  scenarios: {
    // The people the shop actually cares about
    customers: { executor: "constant-arrival-rate", rate: 25, timeUnit: "1s", duration: "90s", preAllocatedVUs: 30, maxVUs: 300, exec: "normalVisitor" },
    tills: { executor: "constant-arrival-rate", rate: 4, timeUnit: "1s", duration: "90s", preAllocatedVUs: 10, maxVUs: 50, exec: "normalEarn" },
    // The attackers
    guessOneAccount: { executor: "constant-arrival-rate", rate: 40, timeUnit: "1s", duration: "90s", preAllocatedVUs: 20, maxVUs: 200, exec: "guessOneAccount" },
    sprayManyAccounts: { executor: "constant-arrival-rate", rate: 40, timeUnit: "1s", duration: "90s", preAllocatedVUs: 20, maxVUs: 200, exec: "sprayManyAccounts" },
    oneConnectionFlood: { executor: "constant-arrival-rate", rate: 60, timeUnit: "1s", duration: "90s", preAllocatedVUs: 20, maxVUs: 200, exec: "oneConnectionFlood" },
    mailBomb: { executor: "constant-arrival-rate", rate: 10, timeUnit: "1s", duration: "90s", preAllocatedVUs: 10, maxVUs: 100, exec: "mailBomb" },
    bigBodies: { executor: "constant-arrival-rate", rate: 3, timeUnit: "1s", duration: "90s", preAllocatedVUs: 5, maxVUs: 30, exec: "bigBody" },
  },
  thresholds: {
    "http_req_duration{kind:normal}": ["p(95)<1500"],
    "http_req_failed{kind:normal}": ["rate<0.01"],
    server_errors: ["rate<0.001"],
  },
};

const note = (res) => {
  got500.add(res.status >= 500);
  if (res.status === 429 || res.status === 413) blocked.add(1);
};

export function setup() {
  return data.staff.slice(0, 6).map((s) => login(s.email, s.password, "staff")).filter(Boolean);
}

export function normalVisitor() {
  const r = http.get(`${BASE}/api/v1/customer/hub-data?slug=${data.baseSlug}`, { tags: { kind: "normal", name: "hub-data" } });
  check(r, { "visitor served": (x) => x.status === 200 });
  note(r);
}

export function normalEarn(tokens) {
  const c = pick(data.customers);
  const res = http.post(
    `${BASE}/api/v1/staff/earn`,
    JSON.stringify({ membershipId: c.membershipId, locationId: data.locationId, amountMinor: 900 }),
    { ...authed(pick(tokens), { "Idempotency-Key": `${Date.now()}-${Math.random()}` }), tags: { kind: "normal", name: "earn" } }
  );
  check(res, { "earn answered": (x) => x.status === 200 || x.status === 429 });
  note(res);
}

// 1. Many passwords against one real account: must be locked out quickly
export function guessOneAccount() {
  const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: data.owner.email, password: `guess-${Math.random()}` }), { ...hdr(fakeIp()), tags: { kind: "attack" } });
  note(res);
  check(res, { "wrong guess never lets anyone in": (x) => x.status !== 200 });
}

// 2. One guess each on very many accounts, from many addresses: costs the database, must not cause errors
export function sprayManyAccounts() {
  const c = pick(data.customers);
  const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: c.email, password: "Wrong-password-1!", portal: "customer", tenantSlug: data.baseSlug }), { ...hdr(fakeIp()), tags: { kind: "attack" } });
  note(res);
  check(res, { "spray never lets anyone in": (x) => x.status !== 200 });
}

// 3. One machine hammering sign-in with a different email every time: its connection should be cut off
export function oneConnectionFlood() {
  const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: `x${Math.random()}@flood.test`, password: "Wrong-password-1!" }), { ...hdr("198.51.100.77"), tags: { kind: "attack" } });
  note(res);
}

// 4. Trying to use password reset to flood someone's inbox (and the mail server)
export function mailBomb() {
  const res = http.post(`${BASE}/api/v1/auth/password/forgot`, JSON.stringify({ email: data.customers[0].email, role: "customer" }), { ...hdr(fakeIp()), tags: { kind: "attack" } });
  note(res);
}

// 5. Huge request bodies
export function bigBody() {
  const res = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email: "a@b.co", password: "x".repeat(1_900_000) }), { ...hdr(fakeIp()), tags: { kind: "attack" } });
  note(res);
  check(res, { "huge body refused": (x) => x.status === 413 });
}
