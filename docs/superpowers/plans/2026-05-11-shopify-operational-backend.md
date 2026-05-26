# Shopify Operational Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Pristine Forests customer-account backend use Shopify-native operational primitives for store credit, discounts, and customer/order state.

**Architecture:** Keep the customer account UI extension as a display/action surface. Move business authority into the Node backend, using Shopify Admin GraphQL for mutations, Store Credit API for real credit balances, native discount code mutations for coupons, and metafields only as display snapshots or tracking metadata.

**Update:** The Store Credit profile block should read Shopify built-in Store Credit accounts directly from the Customer API when available. `pristine.credits` remains a fallback only.

**Update 2026-05-13:** Preorder coupon items 1-12 are implemented locally. The Discount Function now covers percentage tiers, free configured cart-line discounts, travel-size mapping, sample discounts when sample lines are present, and best-value selection. Shopify Functions cannot add or remove cart lines, so sample auto-add and cleanup remain a storefront/cart integration responsibility.

**Tech Stack:** Shopify Customer Account UI Extensions, Node.js, Express, Shopify Admin GraphQL, built-in `node:test`.

---

### Task 1: Backend Service Boundary

**Files:**
- Create: `pristine-ext/web/src/adminClient.js`
- Create: `pristine-ext/web/src/shopifyOperations.js`
- Create: `pristine-ext/web/src/validation.js`
- Create: `pristine-ext/web/test/shopifyOperations.test.js`
- Modify: `pristine-ext/web/package.json`

- [x] Write tests for operation validation and GraphQL payloads.
- [x] Run `npm test` in `pristine-ext/web` and verify the tests fail because the service files do not exist yet.
- [x] Implement a small Admin GraphQL client wrapper and operation functions.
- [x] Re-run `npm test` and verify the backend service tests pass.

### Task 2: Express API

**Files:**
- Modify: `pristine-ext/web/index.js`
- Test: `pristine-ext/web/test/api.test.js`

- [x] Write endpoint tests for health, credit, coupon, tracking, and prepaid intent validation.
- [x] Run endpoint tests and verify they fail against the current backend shape.
- [x] Refactor `index.js` to export `createApp()` and start the server only when executed directly.
- [x] Add operational endpoints backed by injected Shopify operations.
- [x] Re-run endpoint tests and verify they pass.

### Task 3: Shopify Config Alignment

**Files:**
- Modify: `pristine-ext/shopify.app.toml`
- Modify: `pristine-ext/extensions/pristine-forests-ui/shopify.extension.toml`
- Modify: `pristine-ext/web/.env.example`

- [x] Update API versions to `2026-04`.
- [x] Add required scopes for discounts, store credit accounts, and customer account writes.
- [x] Keep `network_access` disabled until a UI action directly calls the backend.

### Task 4: Documentation

**Files:**
- Modify: `README.md`
- Modify: `HANDOVER.md`
- Create: `pristine-ext/web/README.md`

- [x] Document which backend operations are now implemented locally.
- [x] Document Shopify Dashboard actions still required: scope approval, app reinstall, PCD approval if needed, preorder function deployment, and live discount testing.
- [x] Document test and build commands.

### Task 5: Obsidian Notes

**Files:**
- Modify: `C:/Users/Krishh/brain/01-Projects/Pristine Forests/Shopify Portal.md`
- Create: `C:/Users/Krishh/brain/03-Daily/Shopify Portal/2026-05-11.md`
- Create or modify: `C:/Users/Krishh/brain/02-Decisions/Shopify-Portal.md`
- Modify: `C:/Users/Krishh/brain/02-Decisions/log.md`

- [x] Record the backend architecture decision.
- [x] Record what was implemented and what remains as live Shopify setup.
- [x] Link the daily note, project note, and decision log.

### Task 6: Verification

- [x] Run `npm test` in `pristine-ext/web`.
- [x] Run `npm run build` in `pristine-ext`.
- [x] Check `git status --short --branch`.
- [x] Report implemented changes, verification evidence, and next steps.
