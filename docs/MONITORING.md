# Monitoring and alerts

The aim: **you hear about a problem before a customer does.** Nothing here needs code changes; it is setup in the services you already use. Do these once.

## 1. Know when the site is down (free, 5 minutes)
Create an uptime monitor (UptimeRobot, Better Stack or similar), checking every 1 to 5 minutes, alerting your phone and email:

| Check | URL | Alert when |
|---|---|---|
| Site is up | `https://YOUR-DOMAIN/api/health` | not 200 for 2 checks in a row |
| Database is reachable | `https://YOUR-DOMAIN/api/health/deep` | not 200 |
| A shop page renders | `https://YOUR-DOMAIN/b/YOUR-SHOP-SLUG` | not 200, or text "Collect points" missing |
| Sign-in page | `https://YOUR-DOMAIN/login` | not 200 |

## 2. Know when something is breaking (Sentry)
`SENTRY_DSN` is already read by the app. Add a project in Sentry, put the DSN in Vercel, then create these **alert rules** (Alerts → Create alert):

| Alert | Condition | Why |
|---|---|---|
| New error | any *new* issue first seen | catches a fresh bug right after a deploy |
| Error spike | more than 20 events in 5 minutes | something is broadly broken |
| Money path failing | issue whose title contains `earn`, `redeem`, `ledger` or `reconcile`, any event | points are what customers care about |
| Reconcile mismatch | message contains `Balance reconciliation mismatch` | a balance no longer matches its ledger: investigate the same day |
| Slow API | p95 transaction duration above 2 s for 10 minutes | users waiting |

Send them to email and a chat channel someone actually reads.

## 3. Hosting alerts
- **Vercel**: Project → Settings → Notifications: failed deployments, and *Usage* alerts (function duration, bandwidth) at 75%.
- **Vercel Firewall / WAF** (Project → Firewall): turn on *Attack Challenge Mode* only during an attack; add a rate-limit rule (for example 100 requests per minute per IP on `/api/*`) and the managed rules. This is the layer that stops large floods before they reach the app. The app's own limits are a second line.
- **Neon**: enable the *Backup & restore* history (point-in-time), alert on storage 80% and on compute hitting its limit; watch *Connections* during busy hours.
- **Upstash** (rate-limit store): the token must be a **full-access** one, not read-only. The app logs `Rate limiting: Upstash refused the command` if it isn't. Search your logs for it after every deploy.
- **Email**: Gmail's sending limit is about 500 a day. Watch for `failed`/`dead` rows in `email_outbox` (the support view shows them per shop).

## 4. What to check every week (10 minutes)
1. Sentry: open issues, anything new this week.
2. `SELECT status, count(*) FROM email_outbox GROUP BY 1;` — `failed` and `dead` should be tiny.
3. `SELECT count(*) FROM webhook_deliveries WHERE status IN ('failed','dead');`
4. Ledger → *Worth a look* for each big shop.
5. Vercel usage and Neon storage.

## 5. If something is down: first 15 minutes
1. Is it everyone or one shop? Check `/api/health` and `/api/health/deep`.
2. **Vercel → Deployments**: did it start after a deploy? If yes, **Promote the previous deployment** (instant rollback). Database changes in this project only ever *add* columns and tables, so rolling code back is safe.
3. **Neon**: is the database up and under its connection limit?
4. Under attack (many 429s, one IP or one account)? Turn on Vercel Attack Challenge Mode and block the address.
5. Tell affected shop owners plainly what happened and when it will be fixed. Customers can still show their QR card; staff can type customer IDs. Nothing is lost: points are only added when the server confirms.

## 6. Backups
See `docs/RUNBOOK.md` §5 and run `bash scripts/backup-restore-test.sh` to prove a restore works. Do the same drill on a **Neon branch of production** once before launch, and every quarter after.

| Target | Value to agree with your clients |
|---|---|
| RPO (most data you could lose) | Neon point-in-time restore: minutes. Set retention to at least 7 days (30 recommended). |
| RTO (time to be back) | Measured by the drill (see the result in `docs/SECURITY_TESTING.md`). Add 10 minutes to switch the app to a restored branch. |
