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
      async listDiscountCodes(input) {
        calls.push({ name: 'listDiscountCodes', input });
        return [
          {
            id: 'gid://shopify/DiscountCodeNode/1',
            title: 'Welcome',
            code: 'PRISTINE10',
            status: 'ACTIVE',
          },
        ];
      },
      async activateDiscountCode(input) {
        calls.push({ name: 'activateDiscountCode', input });
        return { id: input.discountId, status: 'ACTIVE' };
      },
      async deactivateDiscountCode(input) {
        calls.push({ name: 'deactivateDiscountCode', input });
        return { id: input.discountId, status: 'EXPIRED' };
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
      async getShopMetafield(input) {
        calls.push({ name: 'getShopMetafield', input });
        return null;
      },
      async setShopMetafield(input) {
        calls.push({ name: 'setShopMetafield', input });
        return { id: 'gid://shopify/Metafield/1', namespace: input.namespace, key: input.key, value: input.value };
      },
    },
  };
}

async function request(app, method, path, body, headers = {}) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
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

test('admin mutation endpoints require the configured internal API token', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({
    operations,
    config: {
      shopDomain: 'pristine.myshopify.com',
      internalApiToken: 'test-secret',
    },
  });

  const denied = await request(app, 'POST', '/api/store-credit/credit', {
    customerId: '42',
    amount: '10.00',
    currencyCode: 'INR',
  });
  const allowed = await request(app, 'POST', '/api/store-credit/credit', {
    customerId: '42',
    amount: '10.00',
    currencyCode: 'INR',
  }, { 'X-Pristine-Internal-Token': 'test-secret' });

  assert.equal(denied.status, 401);
  assert.equal(denied.payload.error, 'Internal API token is required');
  assert.equal(allowed.status, 200);
});

test('preorder cart endpoints remain public for storefront use', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({
    operations,
    config: {
      shopDomain: 'pristine.myshopify.com',
      internalApiToken: 'test-secret',
      preorderCart: { sampleVariantIds: [101] },
    },
  });

  const configResponse = await request(app, 'GET', '/api/preorder-cart/config');
  const planResponse = await request(app, 'POST', '/api/preorder-cart/plan', {
    cart: {
      items_subtotal_price: 1000,
      items: [],
    },
  });

  assert.equal(configResponse.status, 200);
  assert.equal(planResponse.status, 200);
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

test('coupon admin endpoints list and toggle native discounts', async () => {
  const { operations, calls } = createOperationsStub();
  const app = createApp({
    operations,
    config: {
      shopDomain: 'pristine.myshopify.com',
      internalApiToken: 'test-secret',
    },
  });

  const headers = { 'X-Pristine-Internal-Token': 'test-secret' };
  const list = await request(app, 'GET', '/api/coupons?first=10', undefined, headers);
  const enabled = await request(
    app,
    'POST',
    '/api/coupons/gid%3A%2F%2Fshopify%2FDiscountCodeNode%2F1/enable',
    {},
    headers
  );
  const disabled = await request(
    app,
    'POST',
    '/api/coupons/gid%3A%2F%2Fshopify%2FDiscountCodeNode%2F1/disable',
    {},
    headers
  );

  assert.equal(list.status, 200);
  assert.equal(list.payload.discounts[0].code, 'PRISTINE10');
  assert.equal(enabled.payload.discount.status, 'ACTIVE');
  assert.equal(disabled.payload.discount.status, 'EXPIRED');
  assert.equal(calls.at(-3).name, 'listDiscountCodes');
  assert.equal(calls.at(-2).name, 'activateDiscountCode');
  assert.equal(calls.at(-1).name, 'deactivateDiscountCode');
});

test('serves the coupon admin frontend', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({ operations, config: { shopDomain: 'pristine.myshopify.com' } });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/admin/coupons`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Coupon Codes/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
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
    sampleRewards: [
      {
        minimumSubtotal: 5000,
        maximumSubtotal: null,
        variantId: 'gid://shopify/ProductVariant/premium-sample',
        quantity: 1,
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
  assert.equal(functionConfig.sampleRewards[0].variantId, 'gid://shopify/ProductVariant/premium-sample');
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

test('preorder cart plan endpoint ignores stale client config', async () => {
  const { operations } = createOperationsStub();
  const app = createApp({
    operations,
    config: {
      shopDomain: 'pristine.myshopify.com',
      preorderCart: {
        sampleRewards: [
          { minimumSubtotal: 0, maximumSubtotal: 4999.99, variantId: 101, quantity: 5 },
          { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 102, quantity: 1 },
        ],
        sampleVariantIds: [101, 102],
        freeFixedItems: [],
      },
    },
  });

  const response = await request(app, 'POST', '/api/preorder-cart/plan?debug=1', {
    cart: {
      items_subtotal_price: 600000,
      items: [],
    },
    config: {
      sampleRewards: [
        { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 999, quantity: 99 },
      ],
      freeFixedItems: [{ variantId: 998, quantity: 1 }],
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.payload.plan.adds.map((add) => ({ id: add.id, quantity: add.quantity })),
    [{ id: 102, quantity: 1 }]
  );
  assert.deepEqual(response.payload.debug.sampleRewards.at(-1), {
    minimumSubtotal: 5000,
    maximumSubtotal: null,
    variantId: 102,
    quantity: 1,
  });
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
    assert.match(script, /gift-card-instant-20260518-v9/);
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
