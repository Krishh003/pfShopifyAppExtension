# Pristine Forests Shopify Customer Portal

> A production-oriented Shopify customer-account extension with modular UI blocks, Admin GraphQL mutations, preorder discount logic, store-credit workflows and storefront cart reconciliation.

**Shopify · React · Node.js · Express · GraphQL · Rust · WebAssembly · JavaScript**

## Engineering highlights

| Area | Implementation |
| --- | --- |
| Customer portal | Five modular Shopify customer-account UI extension blocks |
| Backend | Node/Express service for privileged Shopify Admin GraphQL mutations |
| Store credit | Native Shopify store-credit reads and backend transaction support |
| Discounts | App-managed preorder discount setup through Admin GraphQL |
| Checkout logic | Rust Shopify Discount Function compiled for Shopify Functions |
| Cart automation | Storefront reconciliation for samples/freebies and stale managed lines |
| Resilience | Loading states, error boundaries and legacy metafield fallbacks |
| Verification | Backend and UI-extension test suites |

The system separates **customer-facing reads**, **privileged backend mutations**, **checkout-time discount computation**, and **storefront cart orchestration** so each concern runs in the environment Shopify expects.

---

## Architecture

```text
Customer Account UI Extensions
        |
        +--> Customer Account API
        |       |
        |       +--> profile / order / display data
        |
        +--> Node / Express backend
                |
                +--> Shopify Admin GraphQL
                |       +--> store credit
                |       +--> discounts
                |       +--> metafield snapshots
                |
                +--> preorder cart planner
                        |
                        v
                storefront reconciliation script

Checkout
   |
   v
Rust Shopify Discount Function
   |
   +--> preorder percentage tiers
   +--> configured free-item discounts
   +--> sample entitlement discounts
```

---

## Customer portal

The customer-account extension provides modular blocks that can be positioned independently through Shopify's editor.

Capabilities include:

- customer-facing banners and offer surfaces
- coupon / preorder offer presentation
- store-credit balance display
- order and customer information blocks
- backend-owned display metafields with legacy fallbacks
- loading and failure states for resilient rendering

The UI uses Shopify's native semantic tokens to remain consistent with the host customer-account experience.

---

## Backend

`pristine-ext/web/` contains the Node/Express backend responsible for operations that require Shopify Admin API privileges.

It handles:

- Admin GraphQL store-credit transactions
- app-managed discount creation and updates
- customer/order metafield display snapshots
- preorder offer configuration
- cart-planning logic for samples and freebies

Run it with:

```bash
cd pristine-ext/web
cp .env.example .env
npm install
npm test
npm start
```

Secrets are configured through environment variables and are not intended to be committed.

---

## Preorder discount system

The preorder workflow spans three separate Shopify surfaces because each has different platform permissions.

### 1. Customer portal

Displays available preorder offers and backend-managed offer state.

### 2. Shopify Discount Function

A Rust function computes checkout/cart discount candidates for:

- `PREORDER25`
- `PREORDER30`
- `PREORDER40`
- configured free-item benefits
- same-category travel-size rewards
- configured sample entitlements
- manual coupon overrides

It also performs best-value selection across eligible benefits.

### 3. Storefront cart integration

Shopify Discount Functions can discount existing cart lines but cannot add or remove lines. The storefront integration therefore handles missing rewards and stale auto-managed lines separately.

`pristine-ext/web/public/preorder-cart.js`:

- reconciles managed lines after cart mutations
- observes both `fetch` and `XMLHttpRequest` cart traffic
- plans projected rewards through `POST /api/preorder-cart/plan`
- removes stale rewards before adding updated lines
- exposes `window.PristinePreorderCart.addProductWithRewards(...)`
- prevents concurrent reconciliation from racing against an in-flight product add

This separation avoids treating checkout functions as if they have storefront mutation capabilities they do not actually possess.

---

## Repository structure

```text
pfShopifyAppExtension/
├── pristine-ext/
│   ├── extensions/
│   │   ├── pristine-forests-ui/
│   │   │   └── src/                  # Customer Account UI extensions
│   │   └── pristine-preorder-discount/
│   │       └── ...                   # Rust Shopify Discount Function
│   └── web/
│       ├── public/preorder-cart.js   # Storefront cart integration
│       └── ...                       # Express backend + Admin GraphQL
├── HANDOVER.md
└── README.md
```

---

## Development

### Prerequisites

- Node.js / npm
- Shopify CLI
- Rust
- `wasm32-unknown-unknown` target

```bash
rustup target add wasm32-unknown-unknown
```

Install and run the Shopify app:

```bash
git clone https://github.com/Krishh003/pfShopifyAppExtension.git
cd pfShopifyAppExtension/pristine-ext
npm install
shopify app dev
```

### Tests

Backend:

```bash
cd pristine-ext/web
npm test
```

UI extension:

```bash
cd pristine-ext/extensions/pristine-forests-ui
npm test
```

### Deploy

```bash
cd pristine-ext
shopify app deploy
```

---

## Documentation

- [Project handover](./HANDOVER.md)
- [Backend documentation](./pristine-ext/web/README.md)
- [Discount Function documentation](./pristine-ext/extensions/pristine-preorder-discount/README.md)

The repository also contains implementation notes used during development, while this README is intended as the high-level engineering overview.
