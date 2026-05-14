import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp, isCliEntrypoint } from '../index.js';

function createOperationsStub() {
  const calls = [];
  return {
    calls,
    operations: {
      async creditStoreCreditAccount(input) {
        calls.push({ name: 'creditStoreCreditAccount', input });
        return { account: { balance: { amount: input.amount, currencyCode: input.currencyCode } } };
      },
      async debitStoreCreditAccount(input) {
        calls.push({ name: 'debitStoreCreditAccount', input });
        return { account: { balance: { amount: '5.00', currencyCode: input.currencyCode } } };
      },
      async createDiscountCode(input) {
        calls.push({ name: 'createDiscountCode', input });
        return { id: 'gid://shopify/DiscountCodeNode/1' };
      },
      async createAutomaticAppDiscount(input) {
        calls.push({ name: 'createAutomaticAppDiscount', input });
        return { discountId: 'gid://shopify/DiscountAutomaticNode/1' };
      },
      async createCodeAppDiscount(input) {
        calls.push({ name: 'createCodeAppDiscount', input });
        return { discountId: 'gid://shopify/DiscountCodeNode/2' };
      },
      async mirrorCustomerMetafield(input) {
        calls.push({ name: 'mirrorCustomerMetafield', input });
        return { key: input.key };
      },
      async updateOrderTrackingMetafield(input) {
        calls.push({ name: 'updateOrderTrackingMetafield', input });
        return { key: 'tracking_summary' };
      },
    },
  };
}

async function request(app, method, path, body) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json();
    return { status: response.status, payload };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('health endpoint reports backend readiness', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'GET', '/status');

  assert.equal(response.status, 200);
  assert.equal(response.payload.status, 'ok');
  assert.equal(response.payload.shop, 'pristine.myshopify.com');
});

test('detects Windows CLI entrypoint paths', () => {
  const moduleUrl = 'file:///C:/Users/Krishh/Pristine%20Forests/shopifyAppExtension/pristine-ext/web/index.js';
  const argvPath = 'C:\\Users\\Krishh\\Pristine Forests\\shopifyAppExtension\\pristine-ext\\web\\index.js';

  assert.equal(isCliEntrypoint(moduleUrl, argvPath), true);
});

test('credit endpoint uses real store credit operation and mirrors display state', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/store-credit/credit', {
    customerId: '42',
    amount: '10.00',
    currencyCode: 'INR',
  });

  assert.equal(response.status, 200);
  assert.equal(calls[0].name, 'creditStoreCreditAccount');
  assert.equal(calls[1].name, 'mirrorCustomerMetafield');
  assert.equal(calls[1].input.key, 'portal_status');
});

test('coupon endpoint creates a native discount and mirrors visible coupon summary', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/coupons/create', {
    customerId: '42',
    title: 'Welcome',
    code: 'PRISTINE10',
    percentage: 10,
  });

  assert.equal(response.status, 200);
  assert.equal(calls[0].name, 'createDiscountCode');
  assert.equal(calls[1].name, 'mirrorCustomerMetafield');
  assert.equal(calls[1].input.key, 'visible_coupons');
});

test('preorder setup endpoint creates automatic and manual app discounts', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/preorder-discounts/setup', {
    functionId: '11111111-1111-1111-1111-111111111111',
    startsAt: '2026-05-13T00:00:00Z',
  });

  assert.equal(response.status, 200);
  assert.equal(calls[0].name, 'createAutomaticAppDiscount');
  assert.equal(calls[1].name, 'createCodeAppDiscount');
  assert.equal(calls[4].name, 'createCodeAppDiscount');
  assert.equal(response.payload.discountCodes.length, 4);
});

test('preorder setup endpoint passes free item and cart integration config into function setup', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/preorder-discounts/setup', {
    functionId: '11111111-1111-1111-1111-111111111111',
    freeFixedItems: [{ variantId: 'gid://shopify/ProductVariant/oil-1', quantity: 2 }],
    travelSizeMappings: [
      {
        category: 'Face Care',
        fullSizeProductTypes: ['Face Care'],
        travelSizeVariantIds: ['gid://shopify/ProductVariant/travel-face'],
      },
    ],
    sampleVariantIds: ['gid://shopify/ProductVariant/sample'],
    autoBenefits: [
      {
        code: 'FREETRAVEL',
        freeFixedItems: [{ variantId: 'gid://shopify/ProductVariant/travel-face', quantity: 1 }],
      },
    ],
  });
  const functionConfig = JSON.parse(calls[0].input.metafields[0].value);

  assert.equal(response.status, 200);
  assert.equal(functionConfig.tiers[2].freeFixedItems[0].quantity, 2);
  assert.equal(functionConfig.travelSizeMappings[0].category, 'Face Care');
  assert.equal(functionConfig.sampleVariantIds[0], 'gid://shopify/ProductVariant/sample');
  assert.equal(functionConfig.autoBenefits[0].code, 'FREETRAVEL');
  assert.equal(functionConfig.cartMutation.required, true);
});

test('preorder cart plan endpoint returns add and cleanup actions', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({
    operations,
    config: {
      shopDomain: 'pristine.myshopify.com',
      preorderCart: {
        sampleVariantIds: [101],
        freeFixedItems: [{ variantId: 201, quantity: 2 }],
      },
    },
  });

  const response = await request(app, 'POST', '/api/preorder-cart/plan', {
    cart: {
      items_subtotal_price: 520000,
      items: [
        {
          key: 'stale-oil',
          id: 201,
          variant_id: 201,
          quantity: 3,
          properties: { _pristine_preorder_auto: 'free_fixed' },
        },
      ],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.plan.adds[0].id, 101);
  assert.deepEqual(response.payload.plan.changes, [{ id: 'stale-oil', quantity: 2 }]);
});

test('serves the preorder cart browser integration script', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/preorder-cart.js`);
    const script = await response.text();

    assert.equal(response.status, 200);
    assert.match(script, /PristinePreorderCart/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('tracking endpoint writes order tracking summary metafield', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/orders/tracking', {
    orderId: '99',
    tracking: { status: 'Packed' },
  });

  assert.equal(response.status, 200);
  assert.equal(calls[0].name, 'updateOrderTrackingMetafield');
});

test('prepaid intent endpoint records intent instead of mutating prices directly', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/prepaid-conversion/intent', {
    customerId: '42',
    orderId: '99',
  });

  assert.equal(response.status, 202);
  assert.equal(calls[0].name, 'mirrorCustomerMetafield');
  assert.equal(calls[0].input.key, 'prepaid_conversion_intent');
});

test('endpoints reject missing required fields', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const response = await request(app, 'POST', '/api/store-credit/credit', {
    amount: '10.00',
    currencyCode: 'INR',
  });

  assert.equal(response.status, 400);
  assert.match(response.payload.error, /customerId/);
});
