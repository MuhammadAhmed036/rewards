// One virtual user walks the main paths once. Run this first: if it fails, nothing else is worth running.
import http from "k6/http";
import { check } from "k6";
import { BASE, data, login, authed } from "./common.js";

export const options = { vus: 1, iterations: 1, thresholds: { checks: ["rate==1"] } };

export default function () {
  check(http.get(`${BASE}/api/health`), { "health 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/b/${data.baseSlug}`), { "shop page 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/customer/hub-data?slug=${data.baseSlug}`), { "hub-data 200": (r) => r.status === 200 });
  const owner = login(data.owner.email, data.owner.password, "owner");
  check(owner, { "owner token": (t) => !!t });
  check(http.get(`${BASE}/api/v1/owner/overview?range=30d`, authed(owner)), { "overview 200": (r) => r.status === 200 });
  const staff = login(data.staff[0].email, data.staff[0].password, "staff");
  check(staff, { "staff token": (t) => !!t });
  const c = data.customers[0];
  check(http.post(`${BASE}/api/v1/staff/scan/resolve`, JSON.stringify({ memberNumber: c.memberNumber, locationId: data.locationId }), authed(staff)), { "scan 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/owner/overview`, { jar: new http.CookieJar() }), { "owner API closed without sign-in": (r) => r.status === 401 });
}
