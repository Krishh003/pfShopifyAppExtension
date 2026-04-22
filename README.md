# Pristine Forests Shopify Portal

This repository contains the Shopify App Extensions for the **Pristine Forests** customer portal. It provides a premium, "Organic Luxury" branded experience for customer accounts, featuring modular blocks for banners, coupons, store credits, and order tracking.

## 🚀 Features

- **Modular Architecture**: 5 independent UI extension blocks that can be positioned dynamically in the Shopify Editor.
- **Premium Design System**: Forest-themed aesthetic using Shopify's native semantic tokens.
- **Dynamic Data Fetching**: Standardized GraphQL queries for metafields and order tracking.
- **Resilient UI**: Built-in error boundaries and loading states for a seamless user experience.

## 📁 Repository Structure

- `pristine-ext/`: Main Shopify app directory.
  - `extensions/pristine-forests-ui/`: Source code for the UI extensions.
    - `src/`: React components and design tokens.
    - `shopify.extension.toml`: Extension configuration.

## 🛠️ Development

### Prerequisites

- Shopify CLI
- Node.js & npm

### Setup

1. Navigate to the app directory:
   ```bash
   cd pristine-ext
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   shopify app dev
   ```

### Deployment

To deploy the extensions to Shopify:
```bash
shopify app deploy
```

## 📜 Documentation

- [HANDOVER.md](./HANDOVER.md): Project status and implementation details.
- [CLAUDE.md](./CLAUDE.md): Instructions for AI assistants (Claude).
- [GEMINI.md](./GEMINI.md): Instructions for AI assistants (Gemini).
