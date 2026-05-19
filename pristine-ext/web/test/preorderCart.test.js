import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPreorderCartConfig, planPreorderCartMutations } from '../src/preorderCart.js';

function cart({ subtotal, items }) {
  return {
    items_subtotal_price: Math.round(subtotal * 100),
    items,
  };
}

function line({
  key,
  variantId,
  quantity = 1,
  productType,
  autoType,
  originalLinePrice,
}) {
  return {
    key,
    id: variantId,
    variant_id: variantId,
    quantity,
    original_line_price: originalLinePrice,
    product_type: productType,
    properties: autoType ? { _pristine_preorder_auto: autoType } : {},
  };
}

const config = buildPreorderCartConfig({
  sampleVariantIds: [101],
  freeFixedItems: [{ variantId: 201, quantity: 2 }],
  travelSizeMappings: [
    {
      category: 'Face Care',
      fullSizeProductTypes: ['Face Care'],
      travelSizeVariantIds: [301],
    },
  ],
});

test('adds missing samples up to the subtotal entitlement', () => {
  const result = planPreorderCartMutations(cart({ subtotal: 2600, items: [] }), config);

  assert.deepEqual(result.adds, [
    {
      id: 101,
      quantity: 5,
      properties: {
        _pristine_preorder_auto: 'sample',
        _pristine_preorder_reason: 'subtotal_entitlement',
      },
    },
  ]);
});

test('reduces excess auto-managed samples to the subtotal entitlement', () => {
  const result = planPreorderCartMutations(
    cart({
      subtotal: 0,
      items: [line({ key: 'sample-key', variantId: 101, quantity: 6, autoType: 'sample' })],
    }),
    config
  );

  assert.deepEqual(result.changes, [{ id: 'sample-key', quantity: 5 }]);
});

test('adds fixed freebies and matching travel-size lines for qualifying carts', () => {
  const result = planPreorderCartMutations(
    cart({
      subtotal: 5200,
      items: [line({ key: 'full-face', variantId: 401, quantity: 1, productType: 'Face Care' })],
    }),
    config
  );

  assert.deepEqual(
    result.adds.map((add) => ({ id: add.id, quantity: add.quantity, type: add.properties._pristine_preorder_auto })),
    [
      { id: 101, quantity: 1, type: 'sample' },
      { id: 201, quantity: 2, type: 'free_fixed' },
      { id: 301, quantity: 1, type: 'travel_size' },
    ]
  );
});

test('selects lower-cost samples below 5000 and premium samples from 5000', () => {
  const rewardConfig = buildPreorderCartConfig({
    sampleRewards: [
      { minimumSubtotal: 0, maximumSubtotal: 4999.99, variantId: 101, quantity: 5, label: 'lower-cost sample' },
      { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 102, quantity: 1, label: 'premium sample' },
    ],
  });

  const lowerCart = planPreorderCartMutations(cart({ subtotal: 4999, items: [] }), rewardConfig);
  const premiumCart = planPreorderCartMutations(cart({ subtotal: 5001, items: [] }), rewardConfig);

  assert.deepEqual(
    lowerCart.adds.map((add) => ({ id: add.id, quantity: add.quantity })),
    [{ id: 101, quantity: 5 }]
  );
  assert.deepEqual(
    premiumCart.adds.map((add) => ({ id: add.id, quantity: add.quantity })),
    [{ id: 102, quantity: 1 }]
  );
});

test('cleans up the previous auto-managed sample when sample tier changes', () => {
  const rewardConfig = buildPreorderCartConfig({
    sampleRewards: [
      { minimumSubtotal: 0, maximumSubtotal: 4999.99, variantId: 101, quantity: 5 },
      { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 102, quantity: 1 },
    ],
  });
  const result = planPreorderCartMutations(
    cart({
      subtotal: 5001,
      items: [line({ key: 'lower-sample-key', variantId: 101, quantity: 5, autoType: 'sample' })],
    }),
    rewardConfig
  );

  assert.deepEqual(result.adds.map((add) => ({ id: add.id, quantity: add.quantity })), [{ id: 102, quantity: 1 }]);
  assert.deepEqual(result.changes, [{ id: 'lower-sample-key', quantity: 0 }]);
});

test('cleans up the previous configured sample variant even without the auto property', () => {
  const rewardConfig = buildPreorderCartConfig({
    sampleRewards: [
      { minimumSubtotal: 0, maximumSubtotal: 4999.99, variantId: 101, quantity: 5 },
      { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 102, quantity: 1 },
    ],
  });
  const result = planPreorderCartMutations(
    cart({
      subtotal: 5001,
      items: [line({ key: 'plain-lower-sample-key', variantId: 101, quantity: 5 })],
    }),
    rewardConfig
  );

  assert.deepEqual(result.adds.map((add) => ({ id: add.id, quantity: add.quantity })), [{ id: 102, quantity: 1 }]);
  assert.deepEqual(result.changes, [{ id: 'plain-lower-sample-key', quantity: 0 }]);
});

test('uses original paid item prices for tiers when Shopify cart totals are discounted', () => {
  const rewardConfig = buildPreorderCartConfig({
    sampleRewards: [
      { minimumSubtotal: 0, maximumSubtotal: 4999.99, variantId: 101, quantity: 5 },
      { minimumSubtotal: 5000, maximumSubtotal: null, variantId: 102, quantity: 1 },
    ],
  });
  const result = planPreorderCartMutations(
    {
      items_subtotal_price: 149990,
      total_price: 149990,
      items: [
        line({ key: 'paid-board', variantId: 401, quantity: 7, originalLinePrice: 524965 }),
        line({ key: 'plain-lower-sample-key', variantId: 101, quantity: 5, originalLinePrice: 4975 }),
      ],
    },
    rewardConfig
  );

  assert.deepEqual(result.messages[0], { type: 'preorder_tier', text: 'PREORDER40 eligible' });
  assert.deepEqual(result.adds.map((add) => ({ id: add.id, quantity: add.quantity })), [{ id: 102, quantity: 1 }]);
  assert.deepEqual(result.changes, [{ id: 'plain-lower-sample-key', quantity: 0 }]);
});

test('does not remove customer-added non-sample lines for configured free variants', () => {
  const result = planPreorderCartMutations(
    cart({
      subtotal: 0,
      items: [line({ key: 'customer-sample', variantId: 101, quantity: 1 })],
    }),
    config
  );

  assert.deepEqual(result.changes, []);
});

test('removes stale auto-managed fixed freebies when cart no longer qualifies', () => {
  const result = planPreorderCartMutations(
    cart({
      subtotal: 1000,
      items: [line({ key: 'oil-key', variantId: 201, quantity: 2, autoType: 'free_fixed' })],
    }),
    config
  );

  assert.deepEqual(result.changes, [{ id: 'oil-key', quantity: 0 }]);
});

test('removes duplicate managed lines by total desired quantity', () => {
  const result = planPreorderCartMutations(
    cart({
      subtotal: 5200,
      items: [
        line({ key: 'fixed-one', variantId: 201, quantity: 2, autoType: 'free_fixed' }),
        line({ key: 'fixed-two', variantId: 201, quantity: 2, autoType: 'free_fixed' }),
        line({ key: 'sample-one', variantId: 101, quantity: 1, autoType: 'sample' }),
      ],
    }),
    config
  );

  assert.deepEqual(result.changes, [{ id: 'fixed-two', quantity: 0 }]);
});
