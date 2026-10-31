import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

export const BASE = __ENV.BASE || "http://localhost:3100";
export const data = new SharedArray("data", () => [JSON.parse(open("./data.json"))])[0];

const COOKIE = "__Host-loyalty_session";
const json = { "Content-Type": "application/json" };

/** A different "connection" each time, so one test machine behaves like many customers (the app limits per address). */
export function fakeIp() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

/** Signs in and returns the session as a bearer token (the cookie is Secure, so a plain-http test can't carry it). */
export function login(email, password, portal) {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email, password, portal, tenantSlug: data.baseSlug }),
    { headers: { ...json, "x-forwarded-for": fakeIp() }, tags: { name: `login ${portal}` } }
  );
  const ok = check(res, { [`${portal} login 200`]: (r) => r.status === 200 });
  const c = res.cookies[COOKIE] || res.cookies["loyalty_session"];
  return ok && c && c[0] ? c[0].value : null;
}

export const authed = (token, extra = {}) => ({
  headers: { ...json, Authorization: `Bearer ${token}`, "x-tenant-id": data.baseSlug, "x-forwarded-for": fakeIp(), ...extra },
});

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((Math.random() * 16) | 0).toString(16));
