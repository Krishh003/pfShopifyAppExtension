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

  app.post('/api/preorder-discounts/setup', requireInternalToken(config), asyncHandler(async (req, res) => {
    assertRequired(req.body.functionId, 'functionId');

    const setup = buildPreorderDiscountSetup({
      functionId: req.body.functionId,
      startsAt: req.body.startsAt,
      endsAt: req.body.endsAt,
      freeFixedItems: req.body.freeFixedItems,
      travelSizeMappings: req.body.travelSizeMappings,
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

  app.get('/api/preorder-cart/config', asyncHandler(async (req, res) => {
    res.json({
      success: true,
      config: buildPreorderCartConfig(config.preorderCart || {}),
    });
  }));

  app.post('/api/preorder-cart/plan', asyncHandler(async (req, res) => {
    assertRequired(req.body.cart, 'cart');

    res.json({
      success: true,
      plan: planPreorderCartMutations(
        req.body.cart,
        buildPreorderCartConfig(req.body.config || config.preorderCart || {})
      ),
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
