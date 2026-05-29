# Deploying the Pristine Forests Preorder App to a Live Shopify Store

This is the cutover runbook to take the app from the dev store
(`main-site-test.myshopify.com`) to a production store. It is **not**
plug-and-play — follow the steps in order.

## Architecture (what gets installed where)

| Component | Lives on | Purpose |
|-----------|----------|---------|
| Discount function `pristine-preorder-discount` (Rust) | Shopify (deployed) | Applies % tiers + marks free samples/travel/oils to ₹0 |
| Customer-account UI extensions (Banner, Coupons, Credits, Actions, Tracking) | Shopify (deployed) | Customer portal blocks |
| Backend (`pristine-preorder-backend`) | Render (or Fly) | Admin panel, cart auto-add (`/api/preorder-cart/plan`), store credit, config publish |
| `preorder-cart.js` storefront script | Loaded by the theme from the backend | Auto-adds samples/travel/oils to the cart |
| Discounts (PREORDER25/30/40, FREETRAVEL, automatic) | Shopify store | The actual offers, each holding a `$app:function-configuration` metafield |

Two config stores must stay in sync (the admin "Publish" does both):
- `$app:function-configuration` on each discount → drives discounting.
- shop metafield `pristine:preorder_cart_config` → drives auto-add.

## Prerequisites

- Shopify Partner access to the app `pristine-forests-app` (or create a new app for production).
- Admin access to the live store.
- Shopify CLI logged in (`shopify auth login`).
- Render (or Fly) access to deploy/configure the backend.
- Node 18+ locally.

---

## Step 1 — Fix the app URLs (one-time, blocking)

`shopify.app.toml` currently has placeholders that break a clean install:
```toml
application_url = "https://example.com"
[auth]
redirect_urls = ["https://shipify-connector.locallink.sh/api/shopify/callback", "http://localhost:8082/api/shopify/callback"]
```
Set these to the production backend before deploying:
```toml
application_url = "https://pristine-preorder-backend.onrender.com"
[auth]
redirect_urls = ["https://pristine-preorder-backend.onrender.com/api/shopify/callback"]
```
(If the admin is only the standalone `/admin/coupons` page and you do not embed
the app in Shopify admin, you may also set `embedded = false`.)

## Step 2 — Deploy the app to Shopify

From `pristine-ext/`:
```powershell
shopify app deploy
```
This pushes the discount function, the 5 UI extensions, the access scopes, and the
config. Approve the scope diff (must include `write_inventory`, `read_locations`,
`write_products`, `write_discounts`).

## Step 3 — Install the app on the live store

In the Partner dashboard → app → **Test your app / Install** → select the live store,
or open the generated install URL. Approve the permission grant (this is what makes
the granted scopes reach the token — see the dev-store note below).

> Scopes only reach the API token after the merchant approves the install/permission
> update. A deploy alone does not grant them.

## Step 4 — Point the backend at the live store

In Render → service → **Environment**, set for the live store:

| Var | Value |
|-----|-------|
| `SHOP_DOMAIN` | `your-live-store.myshopify.com` |
| `SHOPIFY_API_KEY` | live app client id |
| `SHOPIFY_API_SECRET` | live app secret |
| `SHOPIFY_ACCESS_TOKEN` | live store admin token (or leave blank to use client_credentials) |
| `WEBHOOK_SECRET` | live webhook secret |
| `API_VERSION` | `2026-04` |
| `ADMIN_CREDENTIALS` | `node scripts/hash-password.mjs '<pw>' '<user>'` output |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `INTERNAL_API_TOKEN` | optional, for the setup curl in Step 5 |

Save → Render redeploys. Confirm: `GET /status` shows the live shop; `GET /api/admin/me`
shows `configured:true`.

> If production traffic matters, move off the Render free tier — it sleeps after 15 min
> (≈50s cold start), which delays the first cart auto-add.

## Step 5 — Create the discounts on the live store

The discounts don't exist on a fresh store. Create them once (the admin "Publish" only
*updates* existing discounts). Get the function id, then call the setup endpoint:

```powershell
# function id (run against the live store admin API, or read it from the Partner dashboard)
# then create the 5 discounts:
$body = @{ functionId = "<FUNCTION_ID>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://pristine-preorder-backend.onrender.com/api/preorder-discounts/setup" `
  -Headers @{ "X-Pristine-Internal-Token" = "<INTERNAL_API_TOKEN>"; "Content-Type" = "application/json" } `
  -Body $body
```
This creates PREORDER25/30/40, FREETRAVEL, and the automatic "Best Value" discount.

## Step 6 — Configure freebies with LIVE variant IDs

Open `https://pristine-preorder-backend.onrender.com/admin/coupons`, sign in, and in
**Preorder Freebies & Discount Tiers** enter the **live** store's variant IDs:
- Discount tiers (PREORDER25/30/40 bands + %).
- Sample entitlement curve (`1 + 1 per ₹1000` → one row: min 0, no max, base 1, +qty per ₹ 1000).
- Sample category mappings (full-size product types → sample variant).
- Travel-size mappings (category, full-size types, travel variant).
- Essential oils (PREORDER40 free items).

Click **Publish**. This writes both config stores in one shot.

> Dev-store variant IDs are baked into `scripts/deploy-preorder.mjs` — do **not** run that
> against production. Use the admin UI instead.

## Step 7 — Inventory

- Full-size products: stocked.
- Freebie variants (samples / travel / oils): set inventory tracking **off** (always
  sellable) or give them stock. Otherwise checkout blocks on a free item.
- A scoped helper exists: `node scripts/set-inventory.mjs` (needs `write_inventory`),
  but review which variants it targets before running on production.

## Step 8 — Wire the storefront theme

In the live theme, add a custom-liquid block (or `theme.liquid`) with:
```html
<script src="https://pristine-preorder-backend.onrender.com/preorder-cart.js?v=gift-card-instant-20260518-v9"></script>
<script>
  window.PristinePreorderCart?.init({
    planUrl: 'https://pristine-preorder-backend.onrender.com/api/preorder-cart/plan',
    cartRoot: window.Shopify?.routes?.root || '/'
  });
</script>
```
Without this, the discount function still discounts items already in the cart, but
samples/travel/oils never get **added**.

## Step 9 — Activate + verify

- Ensure the discounts are **Active** in Shopify admin → Discounts.
- Run the full checkout matrix in `PREORDER_E2E_TEST_PLAN.md` against the live store:
  each band, sample distribution, travel, oils, FREETRAVEL override, recalc edges.

## Rollback / disable

- Deactivate the discounts in Shopify admin (instant, reversible).
- Remove the theme `<script>` block to stop auto-adds.
- Re-publish config from the admin UI to change variant IDs/tiers.

## Known limitations / to confirm before launch

- App URLs were placeholders (Step 1) — must be fixed.
- Backend currently targets the dev store — must be repointed (Step 4).
- Render free tier cold start (Step 4 note).
- `pf123` dev admin password is weak + was shared in chat — rotate (Step 4 `ADMIN_CREDENTIALS`).
- If this ever becomes a **public/listed** app (not a custom install on your own store),
  Shopify also requires the GDPR/compliance webhooks (`customers/data_request`,
  `customers/redact`, `shop/redact`) — not currently implemented.
- E2E checkout on a live store is unverified until Step 9 is done.
