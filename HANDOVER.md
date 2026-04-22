# Project Handover: Pristine Forests Shopify Portal

## 📌 Current Status: UI Visible & Enhanced
The UI extensions are currently functional and deployed. They utilize the `2026-04` API version (standardized across `shopify.app.toml`) and have been refactored for modularity and resilience.

## 🛠️ Technical Highlights

### 1. Modular Architecture
The extension has been deconstructed into 5 independent blocks:
- **Pristine Banner**: Hero section with customizable titles.
- **Pristine Coupons**: Displays personalized customer coupons.
- **Pristine Credits**: Shows store credit balance in Rupees (₹).
- **Pristine Actions**: Quick links/grid for common actions.
- **Pristine Tracking**: Real-time order status on the Order Index page.

### 2. Data Fetching Strategy
- **GraphQL over Metafields**: Replaced `useAppMetafields` with `useApi().query` for better reliability.
- **Direct Access**: Queries use non-aliased fields to avoid validation errors.
- **Logging**: Comprehensive console logs (`Pristine [Component] - Data:`) are included for debugging.

### 3. UX & Resilience
- **Loading States**: Outlines and "Loading..." text render immediately to prevent layout shift or perceived "invisibility".
- **Error Boundaries**: `ErrorSafeWrapper` prevents a single component crash from breaking the entire page.

## ⚠️ Known Issues & Dead Ends
- **API Versioning**: Ensure all `shopify.extension.toml` and `shopify.app.toml` files are synced. Some files may still refer to `2025-07` or `2024-10` and should be updated to `2026-04`.
- **Metafield Population**: If credits or coupons don't appear, verify the `pristine` namespace metafields on the Customer object in Shopify Admin.

## ⏭️ Next Steps
- **Live Testing**: Monitor production logs for data population.
- **Design Polish**: Further refinement of the "Organic Luxury" aesthetic if new brand assets are provided.
- **Sustainability Copy**: Currently removed per request; re-evaluate if needed in the future.
