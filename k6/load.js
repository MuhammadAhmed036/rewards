// Realistic busy-day mix: customers browsing and joining, staff at the till, an owner on the dashboard.
//   k6 run k6/load.js                       (BASE=http://localhost:3100 by default)
// Rate limits are part of the design, so only unexpected failures count against the thresholds.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { BASE, data, login, authed, pick, uuid, fakeIp } from "./common.js";

const unexpected = new Counter("unexpected_errors");
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 400, 401, 403, 404, 409, 422, 429));

export const options = {
  scenarios: {
    browsing: { executor: "constant-arrival-rate", rate: 30, timeUnit: "1s", duration: "2m", preAllocatedVUs: 40, maxVUs: 200, exec: "browse" },
    joining: { executor: "constant-arrival-rate", rate: 3, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, maxVUs: 100, exec: "join" },
    customerSignIn: { executor: "constant-arrival-rate", rate: 4, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, maxVUs: 100, exec: "customerSignIn" },
    tills: { executor: "per-vu-iterations", vus: 24, iterations: 1, maxDuration: "2m30s", exec: "till" },
    owner: { executor: "constant-vus", vus: 2, duration: "2m", exec: "owner" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{scenario:browsing}": ["p(95)<800"],
    "http_req_duration{name:hub-data}": ["p(95)<800"],
    "http_req_duration{name:earn}": ["p(95)<1500"],
    unexpected_errors: ["count<5"],
  },
};

const lacks = (res, ok = [200]) => {
  if (!ok.includes(res.status)) unexpected.add(1);
};

export function browse() {
  const page = http.get(`${BASE}/b/${data.baseSlug}`, { tags: { name: "shop-page" } });
  check(page, { "shop page 200": (r) => r.status === 200 });
  lacks(page);
  const hub = http.get(`${BASE}/api/v1/customer/hub-data?slug=${data.baseSlug}`, { tags: { name: "hub-data" } });
  check(hub, { "hub-data 200": (r) => r.status === 200 });
  lacks(hub);
}

export function join() {
  const email = `join-${Date.now()}-${Math.floor(Math.random() * 1e9)}@loadtest.local`;
  const res = http.post(
    `${BASE}/api/v1/customer/join`,
    JSON.stringify({ tenantSlug: data.baseSlug, email, name: "Load Joiner", password: "LoadTest-Password-1!" }),
    { headers: { "Content-Type": "application/json", "x-forwarded-for": fakeIp() }, tags: { name: "join" } }
  );
  check(res, { "join 200/201": (r) => r.status === 200 || r.status === 201 });
  lacks(res, [200, 201]);
}

export function customerSignIn() {
  const c = pick(data.customers);
  const token = login(c.email, data.password, "customer");
  if (!token) return unexpected.add(1);
  const me = http.get(`${BASE}/api/v1/customer/hub-data?slug=${data.baseSlug}`, authed(token));
  check(me, { "signed-in hub 200": (r) => r.status === 200 });
}

// One terminal per virtual user: sign in once, then serve customers for about two minutes
export function till() {
  const staff = data.staff[(__VU - 1) % data.staff.length];
  const token = login(staff.email, staff.password, "staff");
  if (!token) return unexpected.add(1);
  const end = Date.now() + 110_000;
  while (Date.now() < end) {
    const c = pick(data.customers);
    const scan = http.post(`${BASE}/api/v1/staff/scan/resolve`, JSON.stringify({ memberNumber: c.memberNumber, locationId: data.locationId }), { ...authed(token), tags: { name: "scan" } });
    check(scan, { "scan 200": (r) => r.status === 200 });
    lacks(scan, [200, 429]);
    const amountMinor = 500 + Math.floor(Math.random() * 4000);
    const body = JSON.stringify({ membershipId: c.membershipId, locationId: data.locationId, amountMinor });
    const preview = http.post(`${BASE}/api/v1/staff/earn/preview`, body, { ...authed(token), tags: { name: "earn-preview" } });
    lacks(preview, [200, 429]);
    const key = uuid();
    const earn = http.post(`${BASE}/api/v1/staff/earn`, body, { ...authed(token, { "Idempotency-Key": key }), tags: { name: "earn" } });
    check(earn, { "earn 200": (r) => r.status === 200 || r.status === 429 });
    lacks(earn, [200, 429]);
    // A double tap with the same key must not pay twice
    // Only when the first request really went through: a rate-limited first try (429) never ran, so its retry is the first
    if (earn.status === 200 && Math.random() < 0.1) {
      const again = http.post(`${BASE}/api/v1/staff/earn`, body, { ...authed(token, { "Idempotency-Key": key }), tags: { name: "earn-retry" } });
      check(again, { "retry is a duplicate, not a second award": (r) => r.status !== 200 || r.json("data.isDuplicate") === true });
    }
    sleep(1.5 + Math.random() * 2.5);
  }
}

let ownerToken = null; // one sign-in per virtual user, like a real person who stays signed in
export function owner() {
  if (!ownerToken) ownerToken = login(data.owner.email, data.owner.password, "owner");
  const token = ownerToken;
  if (!token) return unexpected.add(1);
  for (const path of ["/api/v1/owner/overview?range=30d", "/api/v1/owner/members?q=", "/api/v1/owner/analytics?range=30d", "/api/v1/owner/ledger", "/api/v1/owner/campaigns"]) {
    const res = http.get(`${BASE}${path}`, { ...authed(token), tags: { name: `owner ${path.split("?")[0].split("/").pop()}` } });
    check(res, { "owner page 200": (r) => r.status === 200 });
    lacks(res);
    sleep(2);
  }
}
