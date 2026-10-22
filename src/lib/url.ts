import { env } from "./env";

/**
 * Returns the canonical base URL for the application.
 * Automatically resolves Vercel production/preview URLs if APP_URL is unset or localhost.
 */
export function getBaseUrl(request?: Request | { headers: Headers } | null): string {
  // 1. If request is provided, inspect x-forwarded-host or host header
  if (request) {
    const headers = "headers" in request ? request.headers : undefined;
    if (headers) {
      const forwardedHost = headers.get("x-forwarded-host");
      const host = forwardedHost || headers.get("host");
      if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
        const proto = headers.get("x-forwarded-proto") || "https";
        return `${proto}://${host}`;
      }
    }
  }

  // 2. Explicit production APP_URL set in environment
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  // 3. Explicit NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  // 4. Vercel deployment URLs (automatically injected by Vercel platform)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  // 5. If request is provided even for localhost, preserve port
  if (request) {
    const headers = "headers" in request ? request.headers : undefined;
    if (headers) {
      const host = headers.get("x-forwarded-host") || headers.get("host");
      const proto = headers.get("x-forwarded-proto") || "http";
      if (host) return `${proto}://${host}`;
    }
  }

  return env.APP_URL || "http://localhost:3000";
}

