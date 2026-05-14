# Pristine Preorder Discount Function

Rust Shopify Discount Function for the preorder coupon tiers described in the preorder coupon PDF.

## Module Overview

The function reads the cart subtotal, cart lines, discount classes, and `$app/function-configuration` JSON. It returns Shopify Discount API operations for the best eligible preorder benefit.

## Dependencies

- Rust toolchain with `wasm32-unknown-unknown`.
- `shopify_function = "2.1.0"` from `Cargo.toml`.
- Shopify CLI for schema generation, build packaging, and deployment.

## Files

- `src/main.rs`: Rust function implementation.
- `src/run.graphql`: Shopify Function input query.
- `schema.graphql`: Generated Shopify Function schema used by Rust typegen.
- `Cargo.toml` / `Cargo.lock`: Rust package and locked dependency graph.
- `shopify.extension.toml`: Shopify extension configuration.

The old JavaScript function files and JS tests have been removed. This extension now builds through Cargo, not Javy.

## Behavior

When the active discount class includes `ORDER`, the function can apply one preorder percentage tier:

- `PREORDER25`: 25% off carts below 2000.
- `PREORDER30`: 30% off carts from 2000 through 4999.99.
- `PREORDER40`: 40% off carts from 5000 and above.

When the active discount class includes `PRODUCT`, it can also discount configured cart lines at 100% for:

- Fixed free item variant IDs.
- Travel-size variant mappings.
- Sample variant entitlements.

For automatic mode, the function estimates savings across eligible percentage and product benefits, then returns the highest-value eligible benefit group.

For manual override mode, `forcedCode = "FREETRAVEL"` returns the configured free travel-size benefit instead of automatic tiering.

## Platform Boundary

Shopify Discount Functions cannot add or remove cart lines. This function only discounts eligible lines that are already present in the cart. The storefront cart integration is responsible for adding missing samples/freebies and cleaning stale auto-managed lines before checkout.

## Configuration Notes

`shopify.extension.toml` must keep:

```toml
[[targeting]]
target = "cart.lines.discounts.generate.run"
input_query = "src/run.graphql"
export = "run"
```

The Rust WASM also exports `_start` as a fallback entrypoint for Shopify validation. Checkout must invoke `run`; invoking `_start` aborts immediately.

## Commands

Run from this directory:

```powershell
cargo build --target=wasm32-unknown-unknown --release
```

Run the full Shopify build from `pristine-ext`:

```powershell
npm run build
```

Deploy from `pristine-ext`:

```powershell
npm run deploy -- --allow-updates
```

## Deployment Status

The latest verified development-store release is `pristine-forests-portal-48`.
