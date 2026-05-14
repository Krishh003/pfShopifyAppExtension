# Pristine Preorder Discount Function

Shopify Discount Function for the preorder percentage tiers described in the preorder coupon PDF.

## Implemented Behavior

The function reads cart subtotal and app-owned function configuration from `$app/function-configuration`.

When the active discount class includes `ORDER`, it can apply one preorder percentage tier:

- Under 2000: `PREORDER25`, 25% off.
- 2000 to 2999.99: `PREORDER30`, 30% off.
- 3000 to 4999.99: `PREORDER30`, 30% off.
- 5000 and above: `PREORDER40`, 40% off.

When the active discount class includes `PRODUCT`, it can also apply 100% cart-line discounts for configured free item variants, matching travel-size variants, and configured sample variants.

When configuration has `mode = "manual_override"` and `forcedCode = "FREETRAVEL"`, the function returns the configured free travel-size benefit instead of the automatic percentage tier.

For automatic mode, the function estimates savings for the eligible percentage tier, configured auto benefits, and sample entitlement benefit, then returns only the highest-value eligible benefit group.

## Platform Boundary

Shopify Discount Functions cannot add or remove cart lines. This function discounts free-item and sample lines only when those lines already exist in the cart. A storefront/cart integration still needs to:

- Add eligible sample/freebie variants to the cart.
- Remove stale sample/freebie variants when qualifying items are removed.
- Render richer cart messaging before checkout if the storefront needs it.

## Files

- `src/run.graphql`: Function input query.
- `src/run.js`: Discount selection, free item, travel-size, sample, and best-value logic.
- `src/index.js`: Function export entrypoint.
- `scripts/build-function.mjs`: Local build script used by Shopify CLI.
- `test/run.test.js`: Node test coverage for percentage tiering and manual override mode.
- `test/run.test.js`: Node test coverage for percentage tiering, manual override, free fixed items, travel-size matching, best-value selection, and sample entitlements.

## Commands

Run from this directory:

```powershell
npm test
```

Run the full Shopify build from `pristine-ext`:

```powershell
npm run build
```

## Setup Notes

Deploy the function through Shopify CLI, then pass the resulting function id to the backend endpoint:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/preorder-discounts/setup" `
  -ContentType "application/json" `
  -Body '{"functionId":"YOUR_FUNCTION_ID"}'
```

The backend creates the automatic app discount and the code app discounts that reference this function.
