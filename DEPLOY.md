# Deploy Mneme to mnemedb.dev (DigitalOcean App Platform)

Step-by-step. Follow top to bottom. Estimated cost: **~$6.50 / month** (DO $5
+ domain $1.50 amortized). Neon stays free.

---

## 0. Prerequisites checklist

| | Item | Notes |
|---|---|---|
| ☐ | Neon project running | Already done (`ep-spring-feather-alja1yba`) |
| ☐ | `mnemedb.dev` registered | Buy at Cloudflare ($10/yr) or Namecheap ($15/yr); avoid Google Domains successor |
| ☐ | GitHub account | Free |
| ☐ | DigitalOcean account | Free; new accounts get $200 credit |
| ☐ | This repo pushed to GitHub | See step 1 |
| ☐ | Coinbase Smart Wallet or MetaMask | For testing live site |

---

## 1. Push the repo to GitHub

From the repo root (`C:\Users\celik\Desktop\mneme`):

```powershell
git add -A
git commit -m "Mneme MVP — ready for deploy"

# Create an empty private repo at github.com/new (call it `mneme`)
# then:
git branch -M main
git remote add origin https://github.com/<your-username>/mneme.git
git push -u origin main
```

> **Important:** `.env` files are gitignored — your `DATABASE_URL` and
> `GATEWAY_JWT_SECRET` will NOT be in the GitHub repo. You'll paste them into
> DigitalOcean's secret env vars in step 3.

---

## 2. Buy `mnemedb.dev`

Cheapest path: **Cloudflare Registrar** (cost = wholesale + $0, no markup).

1. Go to cloudflare.com → Sign up if you haven't.
2. Domains → Register domain → search `mnemedb.dev` → buy ($10-12/yr).
3. **Leave DNS at Cloudflare for now** — we'll add records in step 4.

Alternative: Namecheap ($15/yr) — same flow.

---

## 3. Create DigitalOcean App #1 — Gateway

1. Log into DigitalOcean → **Apps** (left sidebar) → **Create App**.
2. Source: **GitHub** → authorize → pick the `mneme` repo → branch `main`.
3. **Edit resource detected** screen:
   - Detected one resource. Click it → **Edit**.
   - **Type:** Web Service
   - **Source Directory:** `/gateway`
   - **Autodeploy:** ✓ (deploy on every push to main)
   - **Build Strategy:** Dockerfile (detected from `gateway/Dockerfile`)
   - **HTTP Port:** `8787`
   - **Plan:** Basic, **Basic XXS — $5/mo** (512 MB / 1 vCPU)
   - **Region:** Frankfurt (FRA1) — closest to your Neon DB
4. **Environment Variables** section — add these (mark the secrets):

   | Key | Value | Type |
   |---|---|---|
   | `DATABASE_URL` | (paste from Neon — same as your local `.env`) | **Secret** |
   | `GATEWAY_JWT_SECRET` | (paste from your local `gateway/.env`) | **Secret** |
   | `MNEME_DOMAIN_NAME` | `Mneme` | Plain |
   | `MNEME_DOMAIN_VERSION` | `1` | Plain |
   | `CHAIN_ID` | `8453` | Plain |
   | `SIG_WINDOW_SECONDS` | `60` | Plain |
   | `BASE_RPC_URL` | `https://mainnet.base.org` | Plain |

5. **App-level Settings** → **App Info** → name it `mneme-gateway`.
6. **Create Resources** → wait 3-5 min for first build.
7. Test: open the DO-generated URL (e.g. `https://mneme-gateway-xxx.ondigitalocean.app/health`) → should return `{"ok":true}`.

> **Rate-limit note:** `https://mainnet.base.org` is the free public Base RPC. It will rate-limit at scale. When you start getting real traffic, swap to Alchemy or QuickNode (free tier ~300 req/s) and update `BASE_RPC_URL`.

---

## 4. Create DigitalOcean App #2 — Dashboard

1. **Apps** → **Create App** (a fresh app, not a resource added to gateway).
2. Source: same GitHub repo, branch `main`.
3. **Edit resource detected** → if it suggests anything other than what we want, click **Edit** and override:
   - **Type:** Static Site
   - **Source Directory:** `/` (the repo root, NOT `/dashboard`)
   - **Build Command:** `bun install && bun --filter mneme-dashboard build`
   - **Output Directory:** `dashboard/dist`
   - **Autodeploy:** ✓
4. **Environment Variables**:

   | Key | Value | Scope |
   |---|---|---|
   | `VITE_MNEME_GATEWAY_URL` | `https://gateway.mnemedb.dev` | **Build-time** |

5. **App Info** → name it `mneme-dashboard`.
6. **Plan:** Starter (free).
7. **Create Resources** → wait for build.
8. Test: open DO-generated URL (e.g. `https://mneme-dashboard-yyy.ondigitalocean.app`) — should show Landing.

---

## 5. Attach custom domains

### 5a. In DigitalOcean (gateway app)

1. Open `mneme-gateway` app → **Settings** → **Domains** → **Add Domain**.
2. Domain: `gateway.mnemedb.dev`
3. Choose **You manage your domain** (CNAME-based).
4. DO will show a CNAME target like `mneme-gateway-xxx.ondigitalocean.app`. Copy it.

### 5b. In DigitalOcean (dashboard app)

1. Open `mneme-dashboard` app → **Settings** → **Domains** → **Add Domain**.
2. Domain: `mnemedb.dev` (root) → choose **PRIMARY**.
3. Also add: `www.mnemedb.dev` → choose **REDIRECT to PRIMARY**.
4. DO will show records to add at your DNS provider.

### 5c. In Cloudflare (DNS)

1. Cloudflare dashboard → your `mnemedb.dev` domain → **DNS** → **Records**.
2. Add the records DO showed you:
   - **CNAME** `gateway` → `mneme-gateway-xxx.ondigitalocean.app` (Proxy: DNS only / grey cloud)
   - **A** or **CNAME** `@` (root) → DO's value for the dashboard (Proxy: DNS only)
   - **CNAME** `www` → `mnemedb.dev`

   > **Proxy setting:** Use **DNS only (grey cloud)**, not Proxied (orange). DO handles SSL itself via Let's Encrypt; Cloudflare proxy can interfere.

3. Wait 1-10 min for propagation. DO will auto-provision SSL once it sees the DNS pointing correctly. You'll get a green ✓ in the Domains panel.

---

## 6. Verify

```powershell
curl https://gateway.mnemedb.dev/health
# Expect: {"ok":true}

curl https://mnemedb.dev
# Expect: HTML containing "Mneme" and "Memory for agents"
```

Then in browser:

1. Open `https://mnemedb.dev`
2. Connect wallet (Coinbase Smart Wallet works)
3. Pick a handle → sign → see project Home
4. (Optional) Run the smoke test against production:
   ```powershell
   $env:MNEME_GATEWAY="https://gateway.mnemedb.dev"
   & "$env:USERPROFILE\.bun\bin\bun.exe" run scripts/smoke.ts
   ```

---

## 7. Update social references

After domains are live, update your social bios and the GitLawb pitch:

- Twitter bio: `mnemedb.dev`
- DMs to founders: link to `mnemedb.dev` and live demo
- README "Status" line: update from "Pre-MVP" to "Live MVP"

---

## 8. Cost summary (recurring)

| Item | Monthly |
|---|---|
| DigitalOcean — gateway (Basic XXS) | $5.00 |
| DigitalOcean — dashboard (Starter) | $0.00 |
| Neon Postgres (Free) | $0.00 |
| `mnemedb.dev` domain (Cloudflare) | ~$1.00 amortized |
| **Total** | **~$6.00** |

When traffic grows:
- Gateway → Basic XS or S ($12-25/mo)
- Neon → Pro ($19/mo, 8 GB)
- BASE_RPC_URL → Alchemy free tier (300 req/s) or paid ($49/mo)

---

## 9. Iterating after deploy

Every `git push origin main` triggers both apps to rebuild automatically. No
manual deploy step. To debug a deploy:

- DigitalOcean app → **Activity** tab → see build/run logs
- DigitalOcean app → **Runtime Logs** for live server logs

To roll back: **Activity** → click an older successful deploy → **Rollback**.

---

## 10. Security tightening (after MVP)

| Item | When |
|---|---|
| Restrict CORS in `gateway/src/index.ts` from `cors()` wildcard to `cors({ origin: ["https://mnemedb.dev"] })` | After dashboard is the only legit caller |
| Rotate `GATEWAY_JWT_SECRET` periodically | Quarterly |
| Add rate limiting (e.g. `hono-rate-limiter` middleware) | Before token launch / GitLawb traffic |
| Move `DATABASE_URL` to DO's per-app secret rotation | If team grows beyond solo |
| Enable Neon's "branch-per-PR" for staging | When you have collaborators |

Good luck. When this is live, both Mneme MVP and the GitLawb pitch are
unblocked.
