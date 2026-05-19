# Pristine Forests Backend

Operational backend for the Pristine Forests customer account portal.

## Purpose

This service owns Shopify-side mutations. The customer account UI extension should display account state and start customer actions, but it should not be the source of truth for money, prices, or discount behavior.

## Implemented Operations

- `POST /api/store-credit/credit` credits a customer's real Shopify Store Credit account through Admin GraphQL.
- `POST /api/store-credit/debit` debits a customer's real Shopify Store Credit account through Admin GraphQL.
- `POST /api/coupons/create` creates a native Shopify basic discount code, then mirrors a display summary to `pristine.visible_coupons` when `customerId` is provided.
- `POST /api/preorder-discounts/setup` creates app-managed preorder discounts for the PDF-derived coupon foundation.
- `POST /api/orders/tracking` writes order tracking display state to `pristine.tracking_summary`.
- `POST /api/prepaid-conversion/intent` records a prepaid conversion intent. It deliberately does not mutate prices directly.
- Legacy routes `/api/credits/update` and `/api/coupons/update` remain for compatibility, but new work should use the operational routes above.

## Preorder Discount Setup

`POST /api/preorder-discounts/setup` expects a deployed Shopify Discount Function id:

```json
{
  "functionId": "YOUR_FUNCTION_ID"
}
```

Optional fields:

```json
{
  "startsAt": "2026-05-13T00:00:00.000Z",
  "endsAt": "2026-06-01T00:00:00.000Z",
  "freeFixedItems": [
    { "variantId": "gid://shopify/ProductVariant/ESSENTIAL_OIL_ID", "quantity": 2 }
  ],
  "travelSizeMappings": [
    {
      "category": "Face Care",
      "fullSizeProductTypes": ["Face Care"],
      "travelSizeVariantIds": ["gid://shopify/ProductVariant/TRAVEL_SIZE_ID"]
    }
  ],
  "sampleVariantIds": ["gid://shopify/ProductVariant/SAMPLE_ID"],
  "autoBenefits": [
    {
      "code": "FREETRAVEL",
      "freeFixedItems": [
        { "variantId": "gid://shopify/ProductVariant/TRAVEL_SIZE_ID", "quantity": 1 }
      ]
    }
  ]
}
```

The endpoint creates:

- One automatic app discount for the percentage preorder tiers.
- Code app discounts for `PREORDER25`, `PREORDER30`, `PREORDER40`, and `FREETRAVEL`.
- Portal display summaries suitable for `pristine.visible_coupons`.
- Function configuration for fixed free item variants, travel-size category matching, sample entitlements, auto-benefit comparison, and cart mutation requirements.

Shopify Discount Functions can discount lines that already exist in cart. They cannot add missing sample/freebie lines or remove stale lines. Use the `cartMutation` metadata in the generated function config as the contract for the later storefront/cart integration.

## Preorder Cart Integration

The backend now exposes a cart reconciler for samples/freebies:

- `POST /api/preorder-cart/plan` accepts a Shopify Ajax cart payload and returns `adds`, `changes`, and customer-facing messages.
- `GET /preorder-cart.js` serves a browser integration script for Shopify themes.

The browser script:

- Fetches the current cart from `/{locale}/cart.js`.
- Sends the cart to `/api/preorder-cart/plan`.
- Removes or reduces stale auto-managed lines with `/{locale}/cart/update.js` / `/{locale}/cart/change.js`.
- Adds missing samples/freebies with `/{locale}/cart/add.js`.
- Marks managed lines with private line item properties:
  - `_pristine_preorder_auto`
  - `_pristine_preorder_reason`
- Hooks `window.fetch` and `XMLHttpRequest` to detect cart mutations. The URL matcher is the regex `/\/cart\/(add|change|update|clear)(\.js)?$/`, which catches Dawn's drawer `+`/`-` requests that hit `/cart/change` without the `.js` suffix.
- Exposes `window.PristinePreorderCart.addProductWithRewards(formData, options)` for the patched theme product form. This call:
  - Opens the cart drawer immediately and injects a loading overlay attached to the `<cart-drawer>` element so it survives `renderContents` innerHTML replacement.
  - Increments a `pristineAddInflight` counter. The mutation observer and the `settleCart` reconcile loop both bail while the counter is above zero, so background reconciles cannot interleave with the click flow.
  - Awaits any in-flight `settleCart` promise before mutating, so an older reconcile cannot finish writing stale plan output on top of the click flow's changes.
  - Computes the projected cart, posts it to `POST /api/preorder-cart/plan`, and applies removals first.
  - Tries one bundled `/cart/add.js` with `items: [...]` when no item carries `selling_plan`; otherwise falls back to a sequential paid add (with sections) and background reward adds.
  - On completion the counter is released and a single `reconcile` pass is fired for final consistency.

The current script identifies itself with `SCRIPT_VERSION = "gift-card-instant-20260518-v8"`. Bump this constant and the theme `?v=` query whenever the script behaviour changes so browsers refetch the new version.

Example theme install snippet (production):

```html
<script src="https://YOUR_APP_DOMAIN/preorder-cart.js?v=gift-card-instant-20260518-v8" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    window.PristinePreorderCart.init({
      planUrl: 'https://YOUR_APP_DOMAIN/api/preorder-cart/plan',
      cartRoot: window.Shopify?.routes?.root || '/'
    });
  });
</script>
```

For local development the `.tmp-theme-live/sections/header-group.json` Custom Liquid block currently points to `http://localhost:8081/preorder-cart.js?v=gift-card-instant-20260518-v8`, which only resolves when the Node backend is running on the same machine as the browser. Swap in a tunnel URL (e.g. `cloudflared tunnel --url http://localhost:8081`) when verifying from a different device.

### Deploying to Fly.io

`fly.toml`, `Dockerfile`, `.dockerignore`, and `scripts/fly-deploy.ps1` are checked in for a Fly.io free-tier deployment. One-time setup:

```powershell
iwr https://fly.io/install.ps1 -useb | iex     # install flyctl
flyctl auth signup                              # or `flyctl auth login`
cd pristine-ext/web
flyctl launch --no-deploy --copy-config --name pristine-preorder-backend  # pick region "bom" or "sin"
```

Subsequent deploys:

```powershell
powershell -ExecutionPolicy Bypass -File pristine-ext\web\scripts\fly-deploy.ps1
```

The script reads `.env` at runtime, uploads the whitelisted keys via `flyctl secrets set --stage`, then runs `flyctl deploy --remote-only`. After a successful deploy, swap the script and plan URLs in `.tmp-theme-live/sections/header-group.json` to `https://pristine-preorder-backend.fly.dev/...` and push the theme.

Set `PREORDER_CART_CONFIG` as JSON in the backend environment:

```json
{
  "sampleRewards": [
    {
      "minimumSubtotal": 0,
      "maximumSubtotal": 4999.99,
      "variantId": 48272374104313,
      "quantity": 5,
      "label": "Sample Selling Plans Ski Wax - 9.95"
    },
    {
      "minimumSubtotal": 5000,
      "maximumSubtotal": null,
      "variantId": 48272374038777,
      "quantity": 1,
      "label": "Selling Plans Ski Wax - 24.95"
    }
  ],
  "sampleVariantIds": [48272374104313, 48272374038777],
  "freeFixedItems": [{ "variantId": 201, "quantity": 2 }],
  "travelSizeMappings": [
    {
      "category": "Face Care",
      "fullSizeProductTypes": ["Face Care"],
      "travelSizeVariantIds": [301]
    }
  ]
}
```

Use numeric variant IDs for Shopify Ajax cart operations. `sampleRewards` controls what the cart script auto-adds: 5 units of the lower-cost sample below INR 5000, then 1 unit of the premium sample from INR 5000 upward. Keep both sample variants in `sampleVariantIds` so the Discount Function can discount the auto-added sample line when it reaches checkout. The Discount Function can still use Shopify GIDs in its own config.

## Environment

Create `.env` from `.env.example` and provide:

- `SHOPIFY_ACCESS_TOKEN`: Admin API access token with the required scopes.
- `SHOP_DOMAIN`: Store domain, for example `your-store.myshopify.com`.
- `API_VERSION`: `2026-04`.
- `WEBHOOK_SECRET`: Required before webhook handlers are added.
- `PREORDER_CART_CONFIG`: Optional JSON config for the storefront cart auto-add/cleanup planner.

Never commit `.env`.

## Required Shopify Scopes

The app config requests:

- `read_customers`, `write_customers`
- `read_orders`, `write_orders`
- `read_discounts`, `write_discounts`
- `read_store_credit_accounts`
- `write_store_credit_account_transactions`
- `customer_read_customers`, `customer_write_customers`
- `customer_read_orders`

After changing scopes, reinstall or reauthorize the app in the Shopify development store.

## Commands

```powershell
npm test
npm run dev
npm start
```

Run from `pristine-ext/web`.

## Remaining Shopify Setup

- Confirm store credit scopes are available for the app/store.
- Reinstall the app after scope changes.
- Confirm protected customer data access if Shopify requires it for customer/order fields.
- Add webhook handlers before relying on automatic sync from orders/refunds.
- Deploy the preorder Discount Function before calling `/api/preorder-discounts/setup`.
- Live-test Admin GraphQL discount creation against the development store; local and MCP validation have passed, but the endpoint has not been executed against a live store in this session.
