# Security and load testing

What was tested, how to run it again, what it found, and what it cannot promise.

**Honest limit first:** nobody can promise a site is "100% safe from every attack". What this gives you is: the common attacks are tested and blocked, the findings below were fixed, and there are repeatable scripts so every future release can be checked the same way. Large floods of traffic (DDoS) are stopped at the network edge (Vercel Firewall), not by application code; see `docs/MONITORING.md`.

## How to run everything

```bash
pnpm install
docker compose up -d                 # local Postgres + Mailpit
pnpm db:migrate
pnpm test                            # 238 automated tests, including the security rules
pnpm build && pnpm exec next start -p 3100 &
node scripts/security-scan.mjs http://localhost:3100     # attack scan (354 checks)
pnpm exec tsx k6/setup-data.ts       # one shop, 24 staff, 300 customers  -> k6/data.json
k6 run k6/smoke.js                   # walk the main paths once
k6 run k6/load.js                    # a busy day (2 minutes)
k6 run k6/stress.js                  # climb until it struggles (3 minutes)
k6 run k6/attack.js                  # normal customers while attackers flood (90 seconds)
bash scripts/backup-restore-test.sh  # backup, restore, compare
pnpm audit --prod                    # known vulnerabilities in dependencies
```

Only ever run the scan, k6 and setup scripts against your **own test copy**. They send hostile input and create test data.

## What the attack scan checks (`scripts/security-scan.mjs`)
- Every API route, with every method, with **no sign-in**: none may answer 2xx unless it is public on purpose, and none may crash (5xx).
- Scheduled-job and mail-test endpoints refuse a missing or wrong secret.
- Security headers (CSP without `unsafe-eval`, `object-src`, `base-uri`, `form-action`, framing, HSTS, no `X-Powered-By`), no open CORS.
- Files that must never be served (`.env`, `.git`, lock files, source, migrations).
- SQL-injection, script, template, path-traversal and oversized payloads on public routes and sign-in; no database error text leaks.
- Malformed JSON and wrong content types return 4xx, never 500.
- Cross-site request forgery (a request with the session cookie from another website) is refused; oversized bodies are refused with 413.
- Open redirects through the Google sign-in `returnTo`; a forged Google callback.
- Password guessing, password-reset flooding and join flooding are rate limited; failed sign-in gives the same answer for every email.
- Health endpoints leak nothing.

## Findings, and what was done

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Critical** | If `GOOGLE_CLIENT_ID` was missing or a placeholder, `/api/v1/auth/google` signed anyone in as a demo customer or the seeded demo owner, with no password. | Demo sign-in only exists in development; production refuses. |
| 2 | **Critical** | **Rate limiting never limited anything in production.** The Upstash token was read-only; Upstash answers 200 with an error, which the code read as "first request". Password guessing, reset flooding and join flooding were unlimited. | A refused command now falls back to the in-memory limiter and logs a clear error. **You must still put a full-access Upstash token in Vercel**, otherwise limits are per server instance only. |
| 3 | High | The public login page contained the admin's default password (`Password123!`) behind a "quick login" button, pre-filled in the form, and demo owner/staff emails were shown on shop pages. | All removed. A test now fails the build if a default password or demo email appears in the app's code. |
| 4 | High | Google sign-in `state` was unsigned and not tied to the browser: login forgery and open redirect through `returnTo`. | State is signed, expires in 10 minutes and is tied to a cookie; `returnTo` can only be a path on this site. |
| 5 | High | An existing account could be matched to a Google profile whose email Google had not verified. | Unverified Google emails are refused. |
| 6 | High | Dependencies: Next.js (unauthenticated RCE in image optimisation, DoS), drizzle-orm (SQL injection through identifiers), nodemailer (address-parser issues), postcss. | Upgraded: Next 15.5.28, drizzle-orm 0.45.4, nodemailer 10.3.1, postcss override. |
| 7 | Medium | zod 3 can use a lot of memory on huge arrays (fix only exists in zod 4). | Requests over 1.6 MB are refused before any code runs; passwords limited to 256 characters. Move to zod 4 when convenient. |
| 8 | Medium | No protection against another website making a signed-in browser post a form. | Middleware refuses cross-site writes that carry the session cookie (`Origin` / `Sec-Fetch-Site`). |
| 9 | Medium | Only per-email limits on sign-in: one machine could try thousands of different emails. | Added per-connection limits on sign-in, sign-in code, password reset and sign-up. |
| 10 | Medium | Sign-in took longer for emails that exist, revealing who has an account. | Same work is done for unknown emails. |
| 11 | Medium | Feedback could be filed "as" any customer by naming their id, or against another business's location. | The named customer must be the signed-in one; business and location are checked. |
| 12 | Medium | Emails put shop and customer text straight into HTML (a business called `<a href=...>` could inject links into emails to its customers). | HTML versions are escaped; plain text keeps the words as typed. |
| 13 | Medium | Malformed JSON produced 500 errors (57 routes). | Treated as a bad request (400). |
| 14 | Low | CSP allowed `unsafe-eval` in production; `X-Powered-By` named the framework. | Removed; extra CSP and cross-origin headers added. |
| 15 | Medium | `scripts/seed.ts` switches off the ledger protection and wipes data; one wrong `DATABASE_URL` could run it on production. | It now refuses to run unless the database is on this machine. |

## Results

**Attack scan:** all checks pass against a production build.

**Backup and restore (local Docker Postgres, 12.6 MB):** backup 1 s, restore 4 s, every table's row count identical, the ledger total identical, the append-only ledger trigger and row-level security both back. Run `scripts/backup-restore-test.sh` again before launch and quarterly; for production do the same on a Neon branch from a point in time.

**k6 (single Next.js process on a laptop that also ran k6 and Postgres, so real hosting will do better):**

| Test | Load | Result |
|---|---|---|
| Busy day (`load.js`) | 30 page views/s, 3 sign-ups/s, 4 customer sign-ins/s, 24 tills, owner dashboard, ~92 requests/s for 2 min | 0 failed requests, 0 unexpected errors. Shop page p95 9 ms, public data p95 3 ms, earn p95 368 ms. A retried earn is never paid twice. |
| Stress (`stress.js`) | climbing to 800 page loads/s plus 8 earns/s, 3 min | **0 errors, 0 crashes** (38,523 requests). Past about 200 requests/s on this one process, answers queue and slow down (seconds), then recover. Real hosting scales out instead. Added a 5-second cache on the public shop data after this. |
| Under attack (`attack.js`) | 25 customers/s and 4 tills/s while attackers send 40/s password guesses on one account, 40/s across many accounts, 60/s from one connection, 10/s password-reset floods, huge bodies | Normal visitors: p95 369 ms, 0 failures. Attack traffic: 11,366 requests refused (429/413). **0 server errors.** Nobody was signed in by a wrong guess. |
| Data integrity after load | hundreds of concurrent earns | 0 duplicate idempotency keys, 0 negative balances, 0 balance-vs-ledger mismatches in the load-test shops. |

## What still needs doing by you
1. **Upstash**: create a token with read **and write** access and set `UPSTASH_REDIS_REST_TOKEN` in Vercel. Check the logs after deploy for `Rate limiting: Upstash refused the command`.
2. **Vercel Firewall**: enable managed rules and an `/api/*` rate-limit rule (see `docs/MONITORING.md`). This is what absorbs a large flood.
3. **Environment**: `AUTH_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET` must each be long random strings (32+ characters) that exist only in Vercel. Set a real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never run `pnpm db:seed` against production; create the admin with `pnpm admin:create`.
4. **If you ever had the demo accounts in production** (`admin@platform.local`, `*-owner@platform.local`, `*-staff@platform.local`, `google.customer@loyalty.demo`): delete them or change their passwords now.
5. **An independent penetration test** by a person before a large launch. These scripts catch common problems and keep catching them on every release; a human tester finds the unusual ones.
6. Run all of the above against the real deployed site (staging first), not only a laptop: network, database distance and Vercel's scaling change the numbers.
