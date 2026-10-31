// Finds where the app starts to struggle: the arrival rate climbs steadily until errors or slow answers appear.
//   k6 run k6/stress.js
import http from "k6/http";
import { check } from "k6";
import { BASE, data, login, authed, pick, fakeIp } from "./common.js";

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

export const options = {
  scenarios: {
    readRamp: {
      executor: "ramping-arrival-rate",
      startRate: 20, timeUnit: "1s", preAllocatedVUs: 100, maxVUs: 1500,
      stages: [
        { target: 100, duration: "30s" },
        { target: 250, duration: "45s" },
        { target: 500, duration: "45s" },
        { target: 800, duration: "45s" },
        { target: 0, duration: "20s" },
      ],
      exec: "reads",
    },
    // Writes keep happening while the reads climb: people at tills don't stop because the shop page is busy
    writes: { executor: "constant-arrival-rate", rate: 8, timeUnit: "1s", duration: "3m", preAllocatedVUs: 20, maxVUs: 100, exec: "tillEarn" },
  },
  thresholds: {
    "http_req_duration{name:hub-data}": ["p(95)<1000"],
    "http_req_duration{name:earn}": ["p(95)<2000"],
    http_req_failed: ["rate<0.02"],
  },
};

export function setup() {
  // Sign in a handful of staff once; every write reuses them (the app limits each person to a sensible pace)
  return data.staff.slice(0, 12).map((s) => login(s.email, s.password, "staff")).filter(Boolean);
}

export function reads() {
  const r = Math.random();
  if (r < 0.45) check(http.get(`${BASE}/api/v1/customer/hub-data?slug=${data.baseSlug}`, { tags: { name: "hub-data" } }), { ok: (x) => x.status === 200 });
  else if (r < 0.9) check(http.get(`${BASE}/b/${data.baseSlug}`, { tags: { name: "shop-page" } }), { ok: (x) => x.status === 200 });
  else check(http.get(`${BASE}/api/health`, { tags: { name: "health" } }), { ok: (x) => x.status === 200 });
}

export function tillEarn(tokens) {
  const token = pick(tokens);
  const c = pick(data.customers);
  const res = http.post(
    `${BASE}/api/v1/staff/earn`,
    JSON.stringify({ membershipId: c.membershipId, locationId: data.locationId, amountMinor: 700 + Math.floor(Math.random() * 3000) }),
    { ...authed(token, { "Idempotency-Key": `${Date.now()}-${Math.random()}` }), tags: { name: "earn" } }
  );
  check(res, { "earn ok or limited": (r) => r.status === 200 || r.status === 429 });
}
