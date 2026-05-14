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
- Removes or reduces stale auto-managed lines with `/{locale}/cart/change.js`.
- Adds missing samples/freebies with `/{locale}/cart/add.js`.
- Marks managed lines with private line item properties:
  - `_pristine_preorder_auto`
  - `_pristine_preorder_reason`

Example theme install snippet:

```html
<script src="https://YOUR_APP_DOMAIN/preorder-cart.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', function () {
    window.PristinePreorderCart.init({
      planUrl: 'https://YOUR_APP_DOMAIN/api/preorder-cart/plan'
    });
  });
</script>
```

Set `PREORDER_CART_CONFIG` as JSON in the backend environment:

```json
{
  "sampleVariantIds": [101],
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

Use numeric variant IDs for Shopify Ajax cart operations. The Discount Function can still use Shopify GIDs in its own config.

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
