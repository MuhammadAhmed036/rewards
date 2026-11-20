# Deploying to an Ubuntu VM (Docker)

This covers running the loyalty platform on a plain Ubuntu VM with Docker — no Vercel, no managed
Postgres. It builds the app into a container, runs it next to its own Postgres database, and
brings everything up with one `docker compose` command.

## 1. Prerequisites on the VM

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # log out and back in after this
```

Check both are installed:

```bash
docker --version
docker compose version
```

## 2. Get the project onto the VM

If you have the packaged archive:

```bash
mkdir -p ~/rewards && tar -xzf rewards-deploy.tar.gz -C ~/rewards
cd ~/rewards
```

Or clone the branch directly:

```bash
git clone --branch check https://github.com/MuhammadAhmed036/rewards.git ~/rewards
cd ~/rewards
```

## 3. Configure environment variables

```bash
cp .env.vm.example .env
```

Edit `.env` and fill in:

- `POSTGRES_PASSWORD` — any strong password, used only between the app and its database container.
- `APP_URL` — **must be `https://`**, e.g. `https://<vm-ip>` (no port — Caddy serves on the
  standard 443). The app runs with `NODE_ENV=production`, so its session cookies are marked
  `Secure` and use the `__Host-` prefix; browsers refuse to store those over plain `http://`, so
  sign-in silently wouldn't work without HTTPS. That's what the `caddy` service in
  `docker-compose.vm.yml` is for — see step 4.
- `AUTH_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET` — three **different**, random 32+ character
  strings. Generate each with:

  ```bash
  openssl rand -hex 32
  ```

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional. Leave blank to run without Google
  sign-in (email/password sign-in still works normally).

There's no real mail provider configured for this setup, so outgoing emails (sign-in codes,
password resets, welcome emails) are caught locally by Mailpit instead of actually being sent —
its web inbox is at `http://<vm-ip>:8025`.

## 4. Build and start

```bash
docker compose -f docker-compose.vm.yml up -d --build
```

This builds the app image, starts Postgres, waits for it to be healthy, then starts the app.
Database migrations run automatically every time the app container starts (`docker-entrypoint.sh`),
so this same command is also how you redeploy after pulling new code.

Check it's up:

```bash
docker compose -f docker-compose.vm.yml ps
docker compose -f docker-compose.vm.yml logs -f app
```

The app is now reachable at `https://<vm-ip>`. Caddy mints its own local certificate (there's no
real domain to get a public one for), so the browser will show a "not trusted" / "not private"
warning the first time — that's expected for a lab VM; click through it ("Advanced" → "Proceed").
The connection is still genuinely HTTPS underneath, which is all the app needs.

A small `cron` container also starts alongside the app. Vercel's own scheduler normally fires
the jobs listed in `vercel.json` (expiring unused redemption claims, data retention, balance
reconciliation, the daily loyalty job, sending queued emails); this container calls the same
endpoints on the same UTC schedule instead, so nothing needs a separate Vercel account to work
here. Check it's running with `docker compose -f docker-compose.vm.yml logs -f cron`.

## 5. Create the platform admin account

Don't use the database seed script in a shared environment — it wipes data and creates demo
accounts with a public password. Instead:

```bash
docker compose -f docker-compose.vm.yml exec app node_modules/.bin/tsx scripts/create-admin.ts \
  you@example.com "a-strong-password-here" "Your Name"
```

Sign in at `https://<vm-ip>/login` with that email and password.

## 6. Approve a new business

A business that registers through `/signup` doesn't go live immediately — it's created with
`status: "pending"` until the platform team checks it. As the platform admin:

1. Sign in at `https://<vm-ip>/admin`.
2. Open the businesses list, filter by "⏳ Pending Approval".
3. Open the business and approve it (sets its status to `active`).

Until this happens, that business's owner account can't sign in and its page won't accept
customers. This is normal app behaviour, not specific to this deployment.

## 7. Day-to-day operations

Stop everything:

```bash
docker compose -f docker-compose.vm.yml down
```

Stop and also delete the database volume (full reset):

```bash
docker compose -f docker-compose.vm.yml down -v
```

View logs:

```bash
docker compose -f docker-compose.vm.yml logs -f app
docker compose -f docker-compose.vm.yml logs -f postgres
```

Redeploy after pulling new code:

```bash
git pull
docker compose -f docker-compose.vm.yml up -d --build
```

## 8. Health checks

- `GET https://<vm-ip>/api/health` — basic liveness, no auth required.
- `GET https://<vm-ip>/api/health/deep` — checks the database connection; requires
  `Authorization: Bearer <CRON_SECRET>`.

## 9. Ports used

| Port | What |
|---|---|
| 443 | The app (HTTPS, via Caddy) |
| 80 | Redirects to 443 |
| 5434 | Postgres (mapped to the host for convenience when debugging from the VM itself) |
| 8025 | Mailpit web inbox |
| 1025 | Mailpit SMTP |

For anything beyond a short-lived lab/test environment: point a real domain at the VM, set
`APP_URL` to it, and edit `Caddyfile` to replace `:443 { tls internal ... }` with your domain
(`yourdomain.example { reverse_proxy app:3000 }`) — Caddy then fetches a real Let's Encrypt
certificate automatically instead of using its local self-signed one. Also restrict
5434/8025/1025 to localhost or close them in the VM's firewall.

## 10. What works out of the box here, and what doesn't

This setup is meant to be self-contained — no Vercel account, no managed Postgres, no third-party
services required. A few things that depend on an external provider behave differently without
one configured, by design rather than by accident:

- **Email** — with no real SMTP/API key set, every email the app sends (sign-in codes, password
  resets, welcome emails, campaigns) is caught by Mailpit instead of actually delivered. Set
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (or `RESEND_API_KEY`) to a real provider to send
  real mail.
- **Google sign-in** — stays off unless you set real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
  Email/password sign-in works regardless.
- **Custom domains for a shop's own page** (`owner/domain` settings) — the verification and DNS
  checks run fine; actually attaching the domain to this host still needs a real reverse proxy or
  Vercel API token, so without one the owner is told "the platform team adds this by hand."
- **Rate limiting** — falls back to an in-memory limiter per container instance (fine for one
  `app` container, as this setup runs). Set `UPSTASH_REDIS_REST_URL`/`_TOKEN` if you scale to
  multiple app containers behind a load balancer, so limits are shared across them.

Everything else — sign-up, sign-in, staff/owner dashboards, earning and redeeming points, QR
codes, webhooks, campaigns, member import/export, the scheduled jobs — runs the same as it does
anywhere else this code is deployed.
