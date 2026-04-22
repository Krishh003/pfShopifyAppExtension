# AI Instructions: Pristine Forests Shopify Portal (Claude)

This file provides context and rules for Claude when working on this repository.

## 🧠 Obsidian Context
The source of truth for project history, status, and long-term memory is the **Obsidian Brain**. 
- **Project Note**: `01-Projects/PF Shopify User Profile App Extension.md`
- **Daily Logs**: `03-Daily/`
- **Decisions**: `02-Decisions/log.md`

Always refer to these notes to understand previous work, architectural decisions, and the current task state before starting new work.

## 🎯 Project Vision
Create a premium, forest-themed customer portal for Pristine Forests using Shopify UI Extensions. The design should feel "Organic Luxury" – spacious, clean, and professional.

## 🛠️ Technical Rules

### 1. API & Configuration
- **API Version**: Use `2026-04` for all extensions and app configurations.
- **Extension Targets**: 
  - `customer-account.profile.block.render` (Profile)
  - `customer-account.order-index.block.render` (Order List)

### 2. React & Components
- **Data Fetching**: Always use `useApi().query` for GraphQL queries. Avoid `useAppMetafields` as it has been less reliable in this environment.
- **Resilience**: Wrap new components in an `ErrorSafeWrapper` or similar error-handling logic.
- **Loading States**: Always provide an immediate loading state (outlines/text) to ensure components are visible even before data arrives.

### 3. Styling & Branding
- **Color Palette**: Use forest-themed colors (greens, earthy tones) but prefer **Shopify Semantic Tokens** (e.g., `surfaceSecondary`, `critical`, `success`) for platform consistency.
- **Typography**: Use standard Shopify headings (Level 2 for block headers).
- **Tone**: Professional and product-focused. **Avoid** mentions of sustainability or impact unless explicitly asked.

## 📁 Key Files
- `pristine-ext/extensions/pristine-forests-ui/src/theme.js`: Design tokens.
- `pristine-ext/extensions/pristine-forests-ui/shopify.extension.toml`: Block definitions.

## 🔍 Troubleshooting Guide
- **Invisible Blocks**: Check `api_version` and ensure the component renders a fallback UI if data is null.
- **GraphQL Errors**: Check for unsupported fields in the `tracking` query (e.g., `sortKey` on nested connections often fails).
