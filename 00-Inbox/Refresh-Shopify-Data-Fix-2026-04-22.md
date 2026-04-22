---
date: 2026-04-22
type: refresh
tags: [shopify, ui-extension, debugging, graphql, success]
---

# Refresh: Shopify UI Extension Data Fetching Fix

## 🎯 Summary
Successfully resolved a multi-layered data fetching issue in the Pristine Forests Shopify UI App Extension. The components (Credits, Coupons, and Tracking) are now pulling live metafield data from the Shopify backend and rendering correctly on the Customer Account profile and order index pages.

## 🛠️ Debugging Journey

### 1. The Prohibited Hook (`useAppMetafields`)
Initially, the extension used `useAppMetafields`, which was restricted or failing on specific surfaces, leading to "Access Denied" or invisible components.

### 2. The API Type Mismatch (`api.query`)
We migrated to `api.query`, but encountered:
- **Error**: `Field 'customer' is missing required arguments: customerAccessToken`
- **Cause**: `api.query` defaults to the **Storefront API**, which requires a `customerAccessToken` for private data.

### 3. The Protocol Shift (`shopify://`)
Switched to the native **Customer Account API** protocol:
- **Method**: `fetch("shopify://customer-account/api/2026-04/graphql.json", ...)`
- **Benefit**: Scoped to the currently authenticated customer, bypassing the need for manual tokens.

### 4. The Permissions Block (PCD & Scopes)
Encountered two final hurdles:
- **PCD**: `Level 1 protected customer data access is required`. (Resolved by user in Partner Dashboard).
- **Scopes**: `Access denied for customer field. Required access: customer_read_customers`. (Resolved by adding `customer_read_customers` and `customer_read_orders` to `shopify.app.toml` and re-installing).

## 📁 Key Files Modified
- `shopify.app.toml`: Added `customer_` scopes.
- `ProfileCredits.jsx`: Migrated to `shopify://` fetch.
- `ProfileCoupons.jsx`: Migrated to `shopify://` fetch.
- `OrderIndexBlock.jsx`: Migrated to `shopify://` fetch and fixed a variable shadowing bug.

## ✅ Result
- **ProfileCredits**: Shows live INR balance.
- **ProfileCoupons**: Shows parsed JSON coupon codes.
- **OrderIndexBlock**: Shows order milestones and tracking status.

---
*Ready for new chat.*
