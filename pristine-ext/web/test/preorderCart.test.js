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
}) {
  return {
    key,
    id: variantId,
    variant_id: variantId,
    quantity,
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
      quantity: 3,
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
      items: [line({ key: 'sample-key', variantId: 101, quantity: 2, autoType: 'sample' })],
    }),
    config
  );

  assert.deepEqual(result.changes, [{ id: 'sample-key', quantity: 1 }]);
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
      { id: 101, quantity: 6, type: 'sample' },
      { id: 201, quantity: 2, type: 'free_fixed' },
      { id: 301, quantity: 1, type: 'travel_size' },
    ]
  );
});

test('does not remove customer-added lines for configured free variants', () => {
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
