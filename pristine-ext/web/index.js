import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAdminGraphqlClient, DEFAULT_API_VERSION } from './src/adminClient.js';
import { buildPreorderCartConfig, planPreorderCartMutations } from './src/preorderCart.js';
import { buildPreorderDiscountSetup, buildPreorderVisibleCoupons } from './src/preorderOffers.js';
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

    if (operations.setShopMetafield) {
      try {
        await operations.setShopMetafield({
          namespace: PREORDER_CART_CONFIG_NAMESPACE,
          key: PREORDER_CART_CONFIG_KEY,
          value: JSON.stringify(sanitized),
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

    res.json({ success: true, config: cfg, saved: sanitized });
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

  const explicitVariantIds = Array.isArray(input.sampleVariantIds)
    ? input.sampleVariantIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const rewardVariantIds = sampleRewards.map((reward) => reward.variantId);
  const sampleVariantIds = Array.from(new Set([...explicitVariantIds, ...rewardVariantIds]));

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

  return { sampleRewards, sampleVariantIds, freeFixedItems, travelSizeMappings };
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
