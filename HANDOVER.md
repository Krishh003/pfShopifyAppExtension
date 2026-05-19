# Project Handover: Pristine Forests Shopify Portal

## Current Status: UI, Operational Backend, Preorder Discount Function, and Storefront Cart Auto-Reconcile

The Customer Account UI extension builds and now reads backend-owned display snapshots before falling back to older metafields. The backend has been refactored from loose metafield update endpoints into a tested Shopify Admin GraphQL service layer. Preorder coupon implementation items 1-12 from the PDF have been added locally. A storefront-ready cart integration now plans and applies sample/freebie auto-add and cleanup through Shopify's Ajax Cart API, including an optimistic drawer overlay and a race-safe inflight lock. The preorder Discount Function has been converted to Rust and deployed to the development store.

## Implemented

### UI Extension

- Five modular blocks remain in place:
  - Pristine Banner
  - Pristine Coupons
  - Pristine Credits
  - Pristine Actions
  - Pristine Tracking
- `shopify.extension.toml` now uses `api_version = "2026-04"`.
- Credits prefer Shopify's built-in `customer.storeCreditAccounts` balance, then fall back to `pristine.portal_status.storeCreditBalance.amount`, then `pristine.Credits` / `pristine.credits`.
- Coupons prefer `pristine.visible_coupons`, then fall back to `pristine.Coupons` / `pristine.coupons`.
- Coupons merge configured preorder display offers with any customer-specific coupon snapshot.
- Tracking prefers `pristine.tracking_summary`, then falls back to `pristine.Tracking` / `pristine.tracking`.

### Backend

- `pristine-ext/web` now exports a testable Express app via `createApp()`.
- New Admin GraphQL operation layer:
  - Store credit credit/debit mutations.
  - Native basic discount code creation.
  - Customer metafield display mirroring.
  - Order tracking metafield updates.
- Operational routes:
  - `POST /api/store-credit/credit`
  - `POST /api/store-credit/debit`
  - `POST /api/coupons/create`
  - `POST /api/preorder-discounts/setup`
  - `POST /api/preorder-cart/plan`
  - `POST /api/orders/tracking`
  - `POST /api/prepaid-conversion/intent`
- Browser integration:
  - `GET /preorder-cart.js`
- Legacy routes remain:
  - `POST /api/credits/update`
  - `POST /api/coupons/update`
- Tests use built-in `node:test`.

### Preorder Coupon Items 1-12

- Item 1, customer portal display: `couponOffers.js` adds the preorder offer summaries and `ProfileCoupons.jsx` displays them with existing customer coupons.
- Item 2, static/app-managed discount codes: backend setup builds app discount payloads for `PREORDER25`, `PREORDER30`, `PREORDER40`, and `FREETRAVEL`.
- Item 3, backend offer configuration: `preorderOffers.js` owns tier thresholds, display summaries, and function metafield configuration.
- Item 4, Admin setup endpoint: `POST /api/preorder-discounts/setup` creates the automatic app discount and code app discounts through Admin GraphQL.
- Item 5, Rust Discount Function: `pristine-preorder-discount` calculates the preorder percentage tier from cart subtotal.
- Item 6, manual coupon override plumbing: setup configuration carries the override codes and the function skips automatic tiering when `mode = "manual_override"`.
- Item 7, free fixed-SKU item discounting: the function discounts configured variant IDs at 100% when those lines are already in cart.
- Item 8, free travel-size same-category mapping: the function matches configured full-size product types to configured travel-size variant IDs.
- Item 9, best-value auto-selection: the function estimates savings for percentage and free-item benefits and returns only the highest-value eligible benefit group.
- Item 10, cart messaging and savings display: discount candidates now return messages such as `PREORDER40`, `Free item`, `Free travel-size item`, and `Free sample`.
- Item 11, sample auto-add: `preorder-cart.js` and `POST /api/preorder-cart/plan` add missing sample lines through the Ajax Cart API. `PREORDER_CART_CONFIG.sampleRewards` can select different sample variants by cart value, currently intended as 5 lower-cost samples below INR 5000 and 1 premium sample from INR 5000 upward.
- Item 12, cleanup: the cart planner removes or reduces stale auto-managed lines through the Ajax Cart API.

Important limit: Shopify Discount Functions still cannot insert or remove cart lines. The new cart integration handles that outside the function and must be installed on the Shopify storefront/theme.

### Storefront Cart Behaviour (2026-05-18)

`pristine-ext/web/public/preorder-cart.js` is now `SCRIPT_VERSION = "gift-card-instant-20260518-v8"` and provides:

- `window.PristinePreorderCart.addProductWithRewards(formData, { variantPrices, productType, cartRoot })`: optimistic cart drawer open with a loading overlay, projected plan against the backend, removals first, paid item added with Section Rendering payload, reward lines added in the background, and a single reconcile pass on completion. Bundled `/cart/add.js` with `items: [...]` is only attempted when no item has `selling_plan` to avoid Shopify rejecting mixed selling-plan/non-selling-plan bulk adds.
- Mutation observer reconciles on every cart write. URL matcher widened to the regex `/\/cart\/(add|change|update|clear)(\.js)?$/` so Dawn's drawer `+`/`-` controls (which POST to `/cart/change` without the `.js` suffix) now trigger reconcile. Without this widening, drawer quantity changes that pushed subtotal above a tier boundary never removed the stale sample or added the new sample until a page refresh.
- `pristineAddInflight` counter is incremented for the entire lifecycle of an `addProductWithRewards` call (including its background reward adds). `scheduleRun`, `runSettleCart`, and `reconcile` all bail while the counter is above zero, so background reconciles cannot interleave with the click flow and accidentally re-add sample lines that the click flow just removed.
- Optimistic loading overlay is attached as a direct child of `<cart-drawer>` (not `#CartDrawer`), so it survives the theme's `renderContents` innerHTML replace and re-appears on subsequent adds.
- `SETTLE_DELAYS` was tightened to `[100, 250, 500, 1000, 2000]` and `FINAL_REFRESH_DELAY` to `400` ms so reconcile converges faster on local backends.

`.tmp-theme-live/sections/header-group.json` keeps `<script src="http://localhost:8081/preorder-cart.js?v=gift-card-instant-20260518-v8">` for local development; a public Cloudflare tunnel was used temporarily for cross-machine verification and is no longer running.

## Important Operational Notes

- Metafields are no longer treated as the source of truth for money.
- The Store Credit block now reads Shopify's built-in Store Credit balance directly from the Customer API when available.
- Store credit issuance/redemption should use Shopify Store Credit account transactions, not `pristine.credits`.
- Coupons should use native Shopify discounts first.
- A Shopify Discount Function now exists for preorder percentage tiers, free configured items, travel-size matching, sample discounts, and best-value selection.
- The preorder function is Rust-based. Keep `export = "run"` in `shopify.extension.toml`; otherwise Shopify can invoke the fallback `_start` export and checkout will fail with an immediate `Unreachable` trap.
- The prepaid conversion endpoint records intent only. A live payment/order-edit/draft-order workflow still needs to be selected and implemented.
- The preorder setup endpoint has been executed against the development store, and the app has been released as `pristine-forests-portal-48`.
- The free item and sample discounts require the cart integration to add the relevant variants before checkout.
- The cart integration expects numeric Shopify Ajax variant IDs in `PREORDER_CART_CONFIG`.

## Shopify Setup Still Required

- Reinstall or reauthorize the app after scope changes.
- Confirm Admin API access token has:
  - `read_discounts`, `write_discounts`
  - `read_store_credit_accounts`
  - `write_store_credit_account_transactions`
  - customer/order read scopes and customer-account customer write scope
- Confirm protected customer data access if Shopify requires it.
- Confirm store credit is enabled at checkout; Shopify does not return store credit accounts when checkout store credit is disabled.
- Add verified webhook handlers for orders/refunds/customer changes before relying on automatic backend sync.
- Keep `write_discounts` / `read_discounts` active for future preorder discount updates.
- Install `GET /preorder-cart.js` in the Shopify theme or app proxy storefront surface.
- Configure `PREORDER_CART_CONFIG` with real numeric sample, free item, and travel-size variant IDs. Use `sampleRewards` for the lower-cost and premium sample variant split.
- Live-test the created automatic discount and coupon codes in the development store checkout.

## Verification

Completed on 2026-05-13:

```powershell
cd pristine-ext/web
npm test
```

Result: 26 tests passed.

```powershell
cd pristine-ext/extensions/pristine-forests-ui
npm test
```

Result: 6 tests passed.

```powershell
cd pristine-ext
npm run build
```

Result: Shopify app build passed.

Completed on 2026-05-14:

```powershell
cd pristine-ext/extensions/pristine-preorder-discount
cargo build --target=wasm32-unknown-unknown --release
```

Result: Rust Discount Function build passed.

```powershell
cd pristine-ext
npm run deploy -- --allow-updates
```

Result: `pristine-forests-portal-48` released to the development store.

Shopify Dev MCP validation was also run against the Customer Account GraphQL query, Admin GraphQL discount mutations, Discount Function input query, and a customer-account component shape. The expanded Discount Function input query validated successfully on 2026-05-13 with artifact `artifact-1dd502c3-1314-40c2-afb1-a3be3c5a74e0`.

Completed on 2026-05-18:

```powershell
cd pristine-ext/web
npm test -- test/api.test.js test/preorderCart.test.js
```

Result: 26 tests passed against the v8 storefront script.

Live verification on `main-site-test.myshopify.com` (theme `158672322809`):

- Cart drawer `+`/`-` controls now trigger backend reconcile through the widened URL matcher.
- Crossing the INR 5000 boundary auto-replaces the sample ski wax with the configured gift card variant `48272373678329` without a page refresh.
- Network log captured (`/cart/change` → `/api/preorder-cart/plan` → `/cart/update.js` → `/cart/add.js`) confirms the observer is firing for the `.js`-less Dawn cart change URL.

Useful commands:

Run from `pristine-ext/web`:

```powershell
npm test
```

Run from `pristine-ext`:

```powershell
npm run build
```
