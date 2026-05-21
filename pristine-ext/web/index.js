import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAdminGraphqlClient, DEFAULT_API_VERSION } from './src/adminClient.js';
import { buildPreorderCartConfig, planPreorderCartMutations } from './src/preorderCart.js';
import { buildPreorderDiscountSetup, buildPreorderFunctionConfiguration, buildPreorderVisibleCoupons, PREORDER_OFFER_CONFIG } from './src/preorderOffers.js';
import { createShopifyOperations } from './src/shopifyOperations.js';
import { ValidationError, assertRequired } from './src/validation.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp({
  operations = createDefaultOperations(),
  config = {
    shopDomain: process.env.SHOP_DOMAIN,
    apiVersion: process.env.API_VERSION || DEFAULT_API_VERSION,
    preorderCart: buildPreorderCartConfigFromEnv(),
    internalApiToken: process.env.INTERNAL_API_TOKEN,
  },
} = {}) {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: '*' }));
  app.use(express.static(join(__dirname, 'public')));

  app.get('/status', (req, res) => {
    res.json({
      status: 'ok',
      shop: config.shopDomain || null,
      apiVersion: config.apiVersion || DEFAULT_API_VERSION,
    });
  });

  app.post('/api/store-credit/credit', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.customerId, 'customerId');
    assertRequired(req.body.amount, 'amount');
    assertRequired(req.body.currencyCode, 'currencyCode');

    const transaction = await operations.creditStoreCreditAccount(req.body);

    await operations.mirrorCustomerMetafield({
      customerId: req.body.customerId,
      key: 'portal_status',
      value: JSON.stringify({
        storeCreditBalance: transaction.account.balance,
        updatedAt: new Date().toISOString(),
      }),
      type: 'json',
    });

    res.json({ success: true, transaction });
  }));

  app.post('/api/store-credit/debit', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.customerId, 'customerId');
    assertRequired(req.body.amount, 'amount');
    assertRequired(req.body.currencyCode, 'currencyCode');

    const transaction = await operations.debitStoreCreditAccount(req.body);

    await operations.mirrorCustomerMetafield({
      customerId: req.body.customerId,
      key: 'portal_status',
      value: JSON.stringify({
        storeCreditBalance: transaction.account.balance,
        updatedAt: new Date().toISOString(),
      }),
      type: 'json',
    });

    res.json({ success: true, transaction });
  }));

  app.post('/api/coupons/create', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.title, 'title');
    assertRequired(req.body.code, 'code');

    const discount = await operations.createDiscountCode(req.body);

    if (req.body.customerId) {
      await operations.mirrorCustomerMetafield({
        customerId: req.body.customerId,
        key: 'visible_coupons',
        value: JSON.stringify([
          {
            code: req.body.code,
            title: req.body.title,
            discountId: discount.id,
            expiresAt: req.body.endsAt || null,
          },
        ]),
        type: 'json',
      });
    }

    res.json({ success: true, discount });
  }));

  app.get('/api/coupons', requireInternalToken(config), asyncHandler(async (req, res) => {
    const discounts = await operations.listDiscountCodes({
      first: req.query.first,
      query: req.query.query,
    });

    res.json({ success: true, discounts });
  }));

  app.post('/api/coupons/:discountId/enable', requireInternalToken(config), asyncHandler(async (req, res) => {
    const discount = await operations.activateDiscountCode({
      discountId: req.params.discountId,
    });

    res.json({ success: true, discount });
  }));

  app.post('/api/coupons/:discountId/disable', requireInternalToken(config), asyncHandler(async (req, res) => {
    const discount = await operations.deactivateDiscountCode({
      discountId: req.params.discountId,
    });

    res.json({ success: true, discount });
  }));

  app.get('/admin/coupons', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'admin-coupons.html'));
  });

  app.post('/api/preorder-discounts/setup', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.functionId, 'functionId');

    const setup = buildPreorderDiscountSetup({
      functionId: req.body.functionId,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
      freeFixedItems: req.body.freeFixedItems,
      travelSizeMappings: req.body.travelSizeMappings,
      sampleRewards: req.body.sampleRewards,
      sampleVariantIds: req.body.sampleVariantIds,
      autoBenefits: req.body.autoBenefits,
    });
    const automaticDiscount = await operations.createAutomaticAppDiscount(setup.automatic);
    const discountCodes = [];

    for (const codeDiscount of setup.codes) {
      discountCodes.push(await operations.createCodeAppDiscount(codeDiscount));
    }

    res.json({
      success: true,
      automaticDiscount,
      discountCodes,
      visibleCoupons: buildPreorderVisibleCoupons(),
    });
  }));

  const PREORDER_CART_CONFIG_NAMESPACE = 'pristine';
  const PREORDER_CART_CONFIG_KEY = 'preorder_cart_config';
  const PREORDER_CART_CONFIG_CACHE_MS = 60_000;
  let preorderCartConfigCache = null;
  let preorderCartConfigCacheAt = 0;

  function resetPreorderCartConfigCache() {
    preorderCartConfigCache = null;
    preorderCartConfigCacheAt = 0;
  }

  async function loadPreorderCartOverride() {
    if (!operations.getShopMetafield) return null;
    try {
      const metafield = await operations.getShopMetafield({
        namespace: PREORDER_CART_CONFIG_NAMESPACE,
        key: PREORDER_CART_CONFIG_KEY,
      });
      if (!metafield?.value) return null;
      const parsed = typeof metafield.value === 'string' ? JSON.parse(metafield.value) : metafield.value;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('[pristine] failed to load preorder_cart_config metafield', error.message);
      return null;
    }
  }

  async function getActivePreorderCartConfig({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && preorderCartConfigCache && (now - preorderCartConfigCacheAt) < PREORDER_CART_CONFIG_CACHE_MS) {
      return preorderCartConfigCache;
    }
    const override = await loadPreorderCartOverride();
    const merged = override ? { ...(config.preorderCart || {}), ...override } : (config.preorderCart || {});
    preorderCartConfigCache = buildPreorderCartConfig(merged);
    preorderCartConfigCacheAt = now;
    return preorderCartConfigCache;
  }

  app.get('/api/preorder-cart/config', asyncHandler(async (req, res) => {
    const cfg = await getActivePreorderCartConfig({ forceRefresh: req.query.refresh === '1' });
    res.json({ success: true, config: cfg });
  }));

  app.put('/api/preorder-cart/config', requireInternalToken(config), asyncHandler(async (req, res) => {
    const sanitized = sanitizePreorderCartConfigInput(req.body);

    // Merge over the existing override so this endpoint only touches the fields it was sent.
    // The unified /api/preorder/config publish writes tiers + sampleEntitlements into the same
    // metafield; without a merge, a partial save here would silently drop them.
    const existing = (await loadPreorderCartOverride()) || {};
    const merged = { ...existing };
    for (const key of ['sampleRewards', 'sampleCategoryMappings', 'freeFixedItems', 'travelSizeMappings']) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        merged[key] = sanitized[key];
      }
    }
    merged.sampleVariantIds = deriveSampleVariantIds(merged);

    if (operations.setShopMetafield) {
      try {
        await operations.setShopMetafield({
          namespace: PREORDER_CART_CONFIG_NAMESPACE,
          key: PREORDER_CART_CONFIG_KEY,
          value: JSON.stringify(merged),
          type: 'json',
        });
      } catch (error) {
        return res.status(502).json({
          success: false,
          error: `Failed to persist shop metafield: ${error.message}`,
        });
      }
    }

    resetPreorderCartConfigCache();
    const cfg = await getActivePreorderCartConfig({ forceRefresh: true });

    res.json({ success: true, config: cfg, saved: merged });
  }));

  app.post('/api/preorder-cart/plan', asyncHandler(async (req, res) => {
    assertRequired(req.body.cart, 'cart');
    const cartConfig = await getActivePreorderCartConfig();
    const plan = planPreorderCartMutations(req.body.cart, cartConfig);

    res.json({
      success: true,
      plan,
      debug: req.query.debug === '1' ? buildPreorderCartDebug(req.body.cart, cartConfig, plan) : undefined,
    });
  }));

  app.get('/api/preorder/config', asyncHandler(async (req, res) => {
    if (!operations.listPreorderAppDiscounts) {
      return res.json({ success: true, config: emptyPreorderConfig() });
    }
    const discounts = await operations.listPreorderAppDiscounts();
    const automatic = discounts.find((discount) => discount.kind === 'automatic') || discounts[0] || null;
    const cartOverride = await loadPreorderCartOverride();

    res.json({
      success: true,
      config: buildCanonicalPreorderConfig(automatic?.config, cartOverride),
      discounts: discounts.map((discount) => ({ id: discount.id, kind: discount.kind, title: discount.title, code: discount.code })),
    });
  }));

  app.post('/api/preorder/config', requireInternalToken(config), asyncHandler(async (req, res) => {
    if (!operations.listPreorderAppDiscounts || !operations.setAppDiscountFunctionConfig) {
      return res.status(501).json({ success: false, error: 'Preorder config operations are not available' });
    }

    const input = sanitizePreorderConfigInput(req.body);

    // Function-config side (GIDs): drives the discount function.
    const { base, byCode } = buildPreorderFunctionConfiguration({
      tiers: input.tiers,
      sampleEntitlements: input.sampleEntitlements,
      travelSizeMappings: input.travelSizeMappings.map((mapping) => ({
        ...mapping,
        travelSizeVariantIds: mapping.travelSizeVariantIds.map(toVariantGid),
      })),
      freeFixedItems: input.freeFixedItems.map((item) => ({ ...item, variantId: toVariantGid(item.variantId) })),
      sampleVariantIds: input.sampleVariantIds.map(toVariantGid),
      sampleRewards: [],
    });

    const discounts = await operations.listPreorderAppDiscounts();
    const updated = [];
    for (const discount of discounts) {
      if (discount.kind === 'automatic') {
        await operations.setAppDiscountFunctionConfig({ ownerId: discount.id, value: base });
        updated.push({ id: discount.id, kind: 'automatic' });
      } else if (discount.code && byCode.has(discount.code)) {
        await operations.setAppDiscountFunctionConfig({ ownerId: discount.id, value: byCode.get(discount.code) });
        updated.push({ id: discount.id, code: discount.code });
      }
    }

    // Cart-config side (numeric IDs): drives the auto-add planner. Preserve existing sampleRewards.
    const existingCartConfig = (await loadPreorderCartOverride()) || {};
    const cartConfig = {
      ...existingCartConfig,
      tiers: input.tiers,
      sampleEntitlements: input.sampleEntitlements,
      sampleVariantIds: input.sampleVariantIds,
      sampleCategoryMappings: input.sampleCategoryMappings,
      travelSizeMappings: input.travelSizeMappings,
      freeFixedItems: input.freeFixedItems,
    };
    if (operations.setShopMetafield) {
      await operations.setShopMetafield({
        namespace: PREORDER_CART_CONFIG_NAMESPACE,
        key: PREORDER_CART_CONFIG_KEY,
        value: JSON.stringify(cartConfig),
        type: 'json',
      });
    }
    resetPreorderCartConfigCache();

    res.json({ success: true, updatedDiscounts: updated, config: buildCanonicalPreorderConfig({ tiers: input.tiers, sampleEntitlements: input.sampleEntitlements }, cartConfig) });
  }));

  app.post('/api/orders/tracking', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.orderId, 'orderId');
    assertRequired(req.body.tracking, 'tracking');

    const metafield = await operations.updateOrderTrackingMetafield({
      orderId: req.body.orderId,
      value: JSON.stringify(req.body.tracking),
    });

    res.json({ success: true, metafield });
  }));

  app.post('/api/prepaid-conversion/intent', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.customerId, 'customerId');
    assertRequired(req.body.orderId, 'orderId');

    const metafield = await operations.mirrorCustomerMetafield({
      customerId: req.body.customerId,
      key: 'prepaid_conversion_intent',
      value: JSON.stringify({
        orderId: req.body.orderId,
        status: 'requested',
        requestedAt: new Date().toISOString(),
      }),
      type: 'json',
    });

    res.status(202).json({
      success: true,
      metafield,
      nextAction: 'Create a Shopify-native prepaid conversion flow with discount, draft order, or payment workflow.',
    });
  }));

  app.post('/api/credits/update', requireInternalToken(config), asyncHandler(async (req, res) => {
    const transaction = await operations.creditStoreCreditAccount({
      customerId: req.body.customerId,
      amount: req.body.amount,
      currencyCode: req.body.currencyCode || 'INR',
    });

    res.json({ success: true, transaction, deprecated: '/api/store-credit/credit' });
  }));

  app.post('/api/coupons/update', requireInternalToken(config), asyncHandler(async (req, res) => {
    const metafield = await operations.mirrorCustomerMetafield({
      customerId: req.body.customerId,
      key: 'visible_coupons',
      value: JSON.stringify(req.body.coupons),
      type: 'json',
    });

    res.json({ success: true, metafield, deprecated: '/api/coupons/create' });
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const statusCode = error.statusCode || (error instanceof ValidationError ? 400 : 500);
    res.status(statusCode).json({ error: error.message });
  });

  return app;
}

function requireInternalToken(config) {
  return (req, res, next) => {
    if (!config.internalApiToken) {
      next();
      return;
    }

    if (req.get('X-Pristine-Internal-Token') !== config.internalApiToken) {
      res.status(401).json({ error: 'Internal API token is required' });
      return;
    }

    next();
  };
}

function buildPreorderCartConfigFromEnv() {
  if (!process.env.PREORDER_CART_CONFIG) {
    return {};
  }

  try {
    return JSON.parse(process.env.PREORDER_CART_CONFIG);
  } catch (error) {
    throw new Error('PREORDER_CART_CONFIG must be valid JSON');
  }
}

function sanitizePreorderCartConfigInput(input = {}) {
  const sampleRewardsInput = Array.isArray(input.sampleRewards) ? input.sampleRewards : [];

  const sampleRewards = sampleRewardsInput
    .map((reward) => {
      const variantId = Number(reward?.variantId);
      const minimumSubtotal = Number(reward?.minimumSubtotal ?? 0);
      const maxRaw = reward?.maximumSubtotal;
      const maximumSubtotal = maxRaw === null || maxRaw === undefined || maxRaw === ''
        ? null
        : Number(maxRaw);
      const quantity = Number(reward?.quantity ?? 1);
      const label = typeof reward?.label === 'string' ? reward.label.trim() : '';

      return {
        minimumSubtotal: Number.isFinite(minimumSubtotal) ? minimumSubtotal : 0,
        maximumSubtotal: Number.isFinite(maximumSubtotal) ? maximumSubtotal : null,
        variantId,
        quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
        ...(label ? { label } : {}),
      };
    })
    .filter((reward) => Number.isFinite(reward.variantId) && reward.variantId > 0);

  const sampleCategoryMappings = Array.isArray(input.sampleCategoryMappings)
    ? input.sampleCategoryMappings
        .map((mapping) => ({
          fullSizeProductTypes: Array.isArray(mapping?.fullSizeProductTypes)
            ? mapping.fullSizeProductTypes.map((entry) => String(entry).trim()).filter(Boolean)
            : [],
          sampleVariantId: Number(mapping?.sampleVariantId),
        }))
        .filter((mapping) => Number.isFinite(mapping.sampleVariantId) && mapping.sampleVariantId > 0 && mapping.fullSizeProductTypes.length)
    : [];

  const explicitVariantIds = Array.isArray(input.sampleVariantIds)
    ? input.sampleVariantIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const rewardVariantIds = sampleRewards.map((reward) => reward.variantId);
  const categoryVariantIds = sampleCategoryMappings.map((mapping) => mapping.sampleVariantId);
  const sampleVariantIds = Array.from(new Set([...explicitVariantIds, ...rewardVariantIds, ...categoryVariantIds]));

  const freeFixedItems = Array.isArray(input.freeFixedItems)
    ? input.freeFixedItems
        .map((item) => ({
          variantId: Number(item?.variantId),
          quantity: Number(item?.quantity ?? 1),
        }))
        .filter((item) => Number.isFinite(item.variantId) && item.variantId > 0 && item.quantity > 0)
    : [];

  const travelSizeMappings = Array.isArray(input.travelSizeMappings)
    ? input.travelSizeMappings
        .map((mapping) => ({
          category: String(mapping?.category || '').trim(),
          fullSizeProductTypes: Array.isArray(mapping?.fullSizeProductTypes)
            ? mapping.fullSizeProductTypes.map((entry) => String(entry).trim()).filter(Boolean)
            : [],
          travelSizeVariantIds: Array.isArray(mapping?.travelSizeVariantIds)
            ? mapping.travelSizeVariantIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
            : [],
        }))
        .filter((mapping) => mapping.category && mapping.travelSizeVariantIds.length)
    : [];

  return { sampleRewards, sampleVariantIds, sampleCategoryMappings, freeFixedItems, travelSizeMappings };
}

function deriveSampleVariantIds(config) {
  const rewardIds = Array.isArray(config.sampleRewards) ? config.sampleRewards.map((reward) => Number(reward.variantId)) : [];
  const categoryIds = Array.isArray(config.sampleCategoryMappings) ? config.sampleCategoryMappings.map((mapping) => Number(mapping.sampleVariantId)) : [];
  return Array.from(new Set([...rewardIds, ...categoryIds].filter((id) => Number.isFinite(id) && id > 0)));
}

function toVariantGid(id) {
  const value = String(id ?? '').trim();
  if (value.startsWith('gid://')) {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `gid://shopify/ProductVariant/${numeric}` : value;
}

function toNumericVariantId(value) {
  const text = String(value ?? '');
  const match = text.match(/ProductVariant\/(\d+)/);
  if (match) {
    return Number(match[1]);
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizePreorderTier(tier) {
  const code = String(tier?.code || '').trim().toUpperCase();
  if (!code) {
    return null;
  }
  const minimum = Number(tier?.minimumSubtotal ?? 0);
  const maxRaw = tier?.maximumSubtotal;
  const maximum = maxRaw === null || maxRaw === undefined || maxRaw === '' ? null : Number(maxRaw);
  const percentageRaw = tier?.percentage;
  const percentage = percentageRaw === null || percentageRaw === undefined || percentageRaw === '' ? undefined : Number(percentageRaw);
  const travel = Number(tier?.freeTravelSizeQuantity);
  const sanitized = {
    code,
    minimumSubtotal: Number.isFinite(minimum) ? minimum : 0,
    maximumSubtotal: Number.isFinite(maximum) ? maximum : null,
  };
  if (Number.isFinite(percentage)) {
    sanitized.percentage = percentage;
  }
  if (Number.isFinite(travel) && travel > 0) {
    sanitized.freeTravelSizeQuantity = travel;
  }
  return sanitized;
}

function sanitizeSampleEntitlement(entry) {
  const minimum = Number(entry?.minimumSubtotal ?? 0);
  const maxRaw = entry?.maximumSubtotal;
  const maximum = maxRaw === null || maxRaw === undefined || maxRaw === '' ? null : Number(maxRaw);
  const quantity = Number(entry?.quantity ?? 0);
  const stepRaw = entry?.additionalQuantityPerSubtotal;
  const step = stepRaw === null || stepRaw === undefined || stepRaw === '' ? undefined : Number(stepRaw);
  const sanitized = {
    minimumSubtotal: Number.isFinite(minimum) ? minimum : 0,
    maximumSubtotal: Number.isFinite(maximum) ? maximum : null,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
  };
  if (Number.isFinite(step) && step > 0) {
    sanitized.additionalQuantityPerSubtotal = step;
  }
  return sanitized;
}

function sanitizePreorderConfigInput(input = {}) {
  const cart = sanitizePreorderCartConfigInput(input);
  const tiersInput = Array.isArray(input.tiers) ? input.tiers.map(sanitizePreorderTier).filter(Boolean) : [];
  const entitlementsInput = Array.isArray(input.sampleEntitlements) ? input.sampleEntitlements.map(sanitizeSampleEntitlement) : [];

  return {
    tiers: tiersInput.length ? tiersInput : PREORDER_OFFER_CONFIG.tiers,
    sampleEntitlements: entitlementsInput.length ? entitlementsInput : PREORDER_OFFER_CONFIG.sampleEntitlements,
    sampleCategoryMappings: cart.sampleCategoryMappings,
    travelSizeMappings: cart.travelSizeMappings,
    freeFixedItems: cart.freeFixedItems,
    sampleVariantIds: cart.sampleVariantIds,
    sampleRewards: cart.sampleRewards,
  };
}

function stripTierFixedItems(tier) {
  const sanitized = {
    code: tier.code,
    minimumSubtotal: tier.minimumSubtotal ?? 0,
    maximumSubtotal: tier.maximumSubtotal ?? null,
  };
  if (tier.percentage !== undefined && tier.percentage !== null) {
    sanitized.percentage = tier.percentage;
  }
  if (tier.freeTravelSizeQuantity) {
    sanitized.freeTravelSizeQuantity = tier.freeTravelSizeQuantity;
  }
  return sanitized;
}

function emptyPreorderConfig() {
  return {
    tiers: PREORDER_OFFER_CONFIG.tiers.map(stripTierFixedItems),
    sampleEntitlements: PREORDER_OFFER_CONFIG.sampleEntitlements,
    sampleCategoryMappings: [],
    travelSizeMappings: [],
    freeFixedItems: [],
    sampleVariantIds: [],
    sampleRewards: [],
  };
}

function buildCanonicalPreorderConfig(functionConfig, cartOverride) {
  const fc = functionConfig || {};
  const co = cartOverride || {};
  const fcTiers = Array.isArray(fc.tiers) ? fc.tiers : [];
  const tiersSource = Array.isArray(co.tiers) && co.tiers.length ? co.tiers : fcTiers;
  const preorder40 = fcTiers.find((tier) => tier.code === 'PREORDER40');

  const freeFixedSource = co.freeFixedItems && co.freeFixedItems.length ? co.freeFixedItems : (preorder40?.freeFixedItems || []);
  const travelSource = co.travelSizeMappings && co.travelSizeMappings.length ? co.travelSizeMappings : (fc.travelSizeMappings || []);
  const sampleVariantSource = co.sampleVariantIds && co.sampleVariantIds.length ? co.sampleVariantIds : (fc.sampleVariantIds || []);

  return {
    tiers: tiersSource.map(stripTierFixedItems),
    sampleEntitlements: co.sampleEntitlements && co.sampleEntitlements.length ? co.sampleEntitlements : (fc.sampleEntitlements || []),
    sampleCategoryMappings: (co.sampleCategoryMappings || []).map((mapping) => ({
      fullSizeProductTypes: mapping.fullSizeProductTypes || [],
      sampleVariantId: toNumericVariantId(mapping.sampleVariantId),
    })),
    travelSizeMappings: travelSource.map((mapping) => ({
      category: mapping.category || '',
      fullSizeProductTypes: mapping.fullSizeProductTypes || [],
      travelSizeVariantIds: (mapping.travelSizeVariantIds || []).map(toNumericVariantId).filter((id) => id),
    })),
    freeFixedItems: freeFixedSource.map((item) => ({
      variantId: toNumericVariantId(item.variantId),
      quantity: Number(item.quantity) || 1,
    })),
    sampleVariantIds: sampleVariantSource.map(toNumericVariantId).filter((id) => id),
    sampleRewards: co.sampleRewards || [],
  };
}

function buildPreorderCartDebug(cart, cartConfig, plan) {
  return {
    sampleRewards: cartConfig.sampleRewards,
    sampleVariantIds: cartConfig.sampleVariantIds,
    items: (cart.items || []).map((item) => ({
      key: item.key,
      title: item.title,
      variantId: item.variant_id ?? item.id,
      quantity: item.quantity,
      auto: item.properties?.['_pristine_preorder_auto'] || null,
      reason: item.properties?.['_pristine_preorder_reason'] || null,
      linePrice: item.line_price,
      originalLinePrice: item.original_line_price,
    })),
    plan,
  };
}

function createDefaultOperations() {
  const client = createAdminGraphqlClient({
    shopDomain: process.env.SHOP_DOMAIN,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    clientId: process.env.SHOPIFY_API_KEY,
    clientSecret: process.env.SHOPIFY_API_SECRET,
    apiVersion: process.env.API_VERSION || DEFAULT_API_VERSION,
  });

  return createShopifyOperations(client);
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function isCliEntrypoint(moduleUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath) && moduleUrl === pathToFileURL(argvPath).href;
}

if (isCliEntrypoint(import.meta.url)) {
  const port = process.env.PORT || 8081;
  createApp().listen(port, () => {
    console.log(`Pristine Forests backend listening on port ${port}`);
  });
}
