# Pristine Forests Shopify Portal

This repository contains the Shopify App Extensions for the **Pristine Forests** customer portal. It provides a premium, "Organic Luxury" branded experience for customer accounts, featuring modular blocks for banners, coupons, store credits, and order tracking.

## Features

- **Modular Architecture**: 5 independent UI extension blocks that can be positioned dynamically in the Shopify Editor.
- **Premium Design System**: Forest-themed aesthetic using Shopify's native semantic tokens.
- **Dynamic Data Fetching**: Customer Account API reads for backend-owned display metafields and legacy fallbacks.
- **Store Credit Display**: Reads Shopify's built-in Store Credit account balance in the customer profile block, with legacy metafield fallback.
- **Operational Backend**: Optional Node/Express backend for Admin GraphQL store credit transactions, native discount codes, and order/customer metafield display snapshots.
- **Preorder Coupon Foundation**: Customer portal offer display, backend offer configuration, Admin GraphQL discount setup endpoint, and a Rust Shopify Discount Function for preorder tiers.
- **Preorder Cart Integration**: Backend cart planner and storefront browser script for adding missing samples/freebies and cleaning stale auto-managed lines.
- **Resilient UI**: Built-in error boundaries and loading states for a seamless user experience.

## Repository Structure

- `pristine-ext/`: Main Shopify app directory.
  - `extensions/pristine-forests-ui/`: Source code for the UI extensions.
    - `src/`: React components and design tokens.
    - `shopify.extension.toml`: Extension configuration.
  - `extensions/pristine-preorder-discount/`: Shopify Discount Function for the preorder percentage tiers.
  - `web/`: Operational backend for Shopify Admin GraphQL mutations.

## Development

### Prerequisites

- Shopify CLI
- Node.js & npm
- Rust with the `wasm32-unknown-unknown` target:
  ```powershell
  rustup target add wasm32-unknown-unknown
  ```

### Setup

1. Navigate to the app directory:
   ```powershell
   cd pristine-ext
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Start the dev server:
   ```powershell
   shopify app dev
   ```

### Backend

The backend is in `pristine-ext/web` and owns Shopify mutations. It uses Admin GraphQL for store credit, discounts, and metafield display snapshots.

```powershell
cd pristine-ext/web
npm test
npm start
```

Configure `pristine-ext/web/.env` from `.env.example`. Do not commit secrets.

### Preorder Discounts

The preorder coupon implementation is now represented locally across items 1-12:

1. Customer portal display for preorder offers.
2. Static/app-managed discount code setup payloads.
3. Backend offer configuration.
4. Admin endpoint to create/update app-managed preorder discounts.
5. Rust Shopify Discount Function for `PREORDER25`, `PREORDER30`, and `PREORDER40` percentage tiers.
6. Manual coupon override plumbing in the function configuration.
7. Fixed free item discounts for configured variant IDs when the qualifying item is already in cart.
8. Travel-size same-category matching through configured product type and travel variant mappings.
9. Best-value selection by estimated savings across eligible percentage and free-item benefits.
10. Discount messages returned from the function candidates for checkout/cart display surfaces.
11. Sample entitlement discounts when configured sample variant lines are already in cart.
12. Cart cleanup contract metadata for the later cart integration.

Important platform limit: Shopify Discount Functions can discount eligible cart lines, but they cannot add or remove cart lines. Sample auto-add and cleanup still need a storefront/cart integration to insert missing sample/freebie lines and remove stale lines. The function will discount those lines when they are present.

The storefront integration now lives in `pristine-ext/web/public/preorder-cart.js` (current `SCRIPT_VERSION = "gift-card-instant-20260518-v8"`) and is backed by `POST /api/preorder-cart/plan`. It must be loaded by the Shopify theme or app proxy storefront surface to affect a real customer cart. Configure `PREORDER_CART_CONFIG.sampleRewards` with numeric Ajax variant IDs to auto-add 5 lower-cost samples below INR 5000 and 1 premium sample from INR 5000 upward.

The script does three things on the storefront:

1. Reconciles auto-managed lines on page load and after any cart mutation by hooking into `fetch`/`XMLHttpRequest` and matching cart paths with the regex `/\/cart\/(add|change|update|clear)(\.js)?$/`. Matching `/cart/change` without the `.js` suffix is required for Dawn-based themes whose drawer `+`/`-` controls call `/cart/change`.
2. Provides `window.PristinePreorderCart.addProductWithRewards(formData, options)` for the patched theme product form. When called, it opens the cart drawer immediately with a loading overlay, fetches the projected plan, applies removals first, adds the paid item with Section Rendering payload, and adds reward lines in the background.
3. Holds a `pristineAddInflight` counter while any add-with-rewards call is in flight. The mutation observer and `settleCart` reconcile loop both bail when the counter is above zero so background reconciles never re-add a sample that the click flow just removed.

The preorder function is deployed as Rust. Its Shopify extension config must keep `export = "run"` so checkout invokes the discount logic instead of the fallback `_start` entrypoint. The latest verified dev-store release is `pristine-forests-portal-48`.

Run the related tests from each package:

```powershell
cd pristine-ext/web
npm test

cd ../extensions/pristine-forests-ui
npm test
```

### Deployment

To deploy the extensions to Shopify:
```powershell
shopify app deploy
```

## Documentation

- [HANDOVER.md](./HANDOVER.md): Project status and implementation details.
- [pristine-ext/web/README.md](./pristine-ext/web/README.md): Backend endpoints, scopes, and setup.
- [pristine-ext/extensions/pristine-preorder-discount/README.md](./pristine-ext/extensions/pristine-preorder-discount/README.md): Discount Function behavior and limits.
- [CLAUDE.md](./CLAUDE.md): Instructions for AI assistants (Claude).
- [GEMINI.md](./GEMINI.md): Instructions for AI assistants (Gemini).
