import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full) : [full];
  });
}

describe("Nothing sensitive is shipped in the app's own code", () => {
  const app = files(path.join(process.cwd(), "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

  it("has no default passwords or demo accounts in code that reaches a browser or a server", () => {
    const bad = app.filter((f) => /Password123!|@platform\.local|LoadTest-Password/.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("has no real-looking secrets or keys written into the code", () => {
    const pattern = /(sk_live_|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|xox[bap]-[0-9A-Za-z-]{10,}|ghp_[0-9A-Za-z]{30,}|postgres(ql)?:\/\/[^\s:]+:[^\s@]{6,}@(?!localhost|127\.0\.0\.1))/;
    const bad = app.filter((f) => pattern.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("never builds SQL by pasting text together", () => {
    const bad = app.filter((f) => /sql\.raw\(/.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("never uses dangerouslySetInnerHTML or eval", () => {
    const bad = app.filter((f) => /dangerouslySetInnerHTML|\beval\(|new Function\(/.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("keeps every route that needs a sign-in behind the guard", () => {
    // Routes that are public on purpose; everything else under /api must call a guard
    const publicRoutes = [
      "health", "v1/public", "v1/customer/hub-data", "v1/customer/join", "v1/auth/login", "v1/auth/signup", "v1/auth/logout", "v1/auth/session",
      "v1/auth/google", "v1/auth/password", "v1/auth/verify-email", "v1/auth/invite", "auth/callback", "internal/domain",
    ];
    const normal = (f: string) => f.split(path.sep).join("/");
    const routes = app.filter((f) => normal(f).includes("/api/") && normal(f).endsWith("route.ts"));
    const unguarded = routes.filter((f) => {
      const rel = normal(f).split("/api/")[1];
      if (publicRoutes.some((p) => rel.startsWith(p))) return false;
      const src = fs.readFileSync(f, "utf8");
      return !/guardApiRequest|guardCronRequest|authenticateApiKey|getSessionContext|requireOwnMembership|^export \{ .* \} from /m.test(src);
    });
    expect(unguarded.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
