# Preorder Promotion — E2E Checkout Test Plan

Validates the full loop on the dev store (`main-site-test.myshopify.com`): storefront add-to-cart
→ backend `/api/preorder-cart/plan` auto-adds samples/travel/oils → discount function marks them
free + applies the % tier → checkout charges the correct total.

## Preconditions (must all be true before testing)

1. **Backend redeployed from latest `main`.** Commit `a17cfc2` must be pushed and live on
   `pristine-preorder-backend.onrender.com`. Otherwise the backend (old `preorderCart.js`) and the
   discount function metafield (new split bands) disagree — at ₹2000–2999 a travel oil gets added
   but not discounted. Confirm with `GET /status` and a `/api/preorder-cart/plan` smoke test.
2. **Config deployed:** `node scripts/deploy-preorder.mjs` already run (function metafields + shop
   `pristine:preorder_cart_config`).
3. **Inventory:** full-size products stocked; 🎁 sample/travel variants `tracked=false`; Lavender +
   Peppermint essential oils stocked (or untracked). Run `node scripts/set-inventory.mjs` if needed.
4. **Theme:** `header-group.json` loads `preorder-cart.js` and calls `init({ planUrl: ... })`.

## Price reference (fill in actual dev-store prices)

Pick real full-size products per category so carts land in each band. Record unit prices so the
band math is unambiguous.

## Test matrix — tier bands

| # | Cart (full-size) | Subtotal | Expect % | Expect samples | Expect travel | Expect oils |
|---|------------------|----------|----------|----------------|---------------|-------------|
| T1 | any 1 item | < ₹2000 | PREORDER25 25% | 1 + floor(₹/1000) | none | none |
| T2 | items | ₹2000–2999 | PREORDER30 30% | per band | **none** | none |
| T3 | items | ₹3000–4999 | PREORDER30 30% | per band | 1 travel (per full-size, any category) | none |
| T4 | items | ≥ ₹5000 | PREORDER40 40% | per band | 1 travel | Lavender + Peppermint (1 each) |

For each: verify (a) freebies auto-add to cart, (b) each freebie shows ₹0 / 100% off, (c) the % is
applied to the order subtotal, (d) checkout total = paid items × (1 − %), (e) checkout completes.

## Sample tests

- **S1 sample curve:** ₹500→1, ₹1500→2, ₹2500→3, ₹3500→4, ₹4500→5, ₹5500→6 samples.
- **S2 per-category:** Face Mist only → 🎁 Face Mist sample. Body Mist only → 🎁 Body Mist sample.
  Body Oil OR Essential Oil only → 🎁 Body Oil sample.
- **S3 distribution:** Face Mist + Body Oil at ₹5200 → 6 samples split 3 Face + 3 Body Oil.
- **S4 non-selectable:** samples cannot be removed/edited by the customer (re-added on reconcile).

## Travel / oils

- **TR1:** ₹3500 with 2 full-size → 2 travel oils (1 per full-size). 1 full-size → 1.
- **TR2 becomes-paid:** at ₹3500 remove the full-size → travel oil removed (or charged). Cart recalcs.
- **OIL1:** ≥₹5000 → exactly 2 oils (Lavender 1 + Peppermint 1), both ₹0.

## Coupon override

- **C1 FREETRAVEL:** apply code on any qualifying cart → forces free travel-size even when the %
  tier would save more. Confirm override beats auto best-value.
- **C2 codes:** PREORDER25/30/40 entered manually behave same as auto for their band.

## Edge / recalc

- **E1 downgrade:** build ₹5200 (PREORDER40 + oils), reduce to ₹2500 → drops to PREORDER30, oils
  removed, travel removed, samples recalc to 3.
- **E2 upgrade:** ₹1500 → add items to ₹5200 → upgrades to PREORDER40, oils + travel appear.
- **E3 empty:** clear cart → all auto-added freebies gone.
- **E4 stock:** confirm no "out of stock" block on any freebie or full-size at add or checkout.
- **E5 cold start:** first add after backend idle (Render free tier may sleep) still settles cart.

## Automated smoke (no browser)

`POST https://pristine-preorder-backend.onrender.com/api/preorder-cart/plan` with a synthetic
`{ cart: { items_subtotal_price, items:[{variant_id, quantity, product_type, original_line_price}] } }`
for each band; assert `plan.adds` matches the matrix. (Mirrors the local `planPreorderCartMutations`
unit tests, but against the deployed backend to catch version drift.)

## Sign-off

All T/S/TR/OIL/C/E cases pass, checkout totals correct, and the automated smoke matches the matrix
against the **deployed** backend.
