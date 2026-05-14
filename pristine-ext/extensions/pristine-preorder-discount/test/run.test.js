import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../src/run.js';

function inputForSubtotal(amount, configuration = {}) {
  return {
    cart: {
      lines: [],
      cost: {
        subtotalAmount: {
          amount: String(amount),
          currencyCode: 'INR',
        },
      },
    },
    discount: {
      discountClasses: ['ORDER', 'PRODUCT'],
      metafield: {
        jsonValue: {
          tiers: [
            { code: 'PREORDER25', minimumSubtotal: 0, maximumSubtotal: 1999.99, percentage: 25 },
            { code: 'PREORDER30', minimumSubtotal: 2000, maximumSubtotal: 4999.99, percentage: 30 },
            { code: 'PREORDER40', minimumSubtotal: 5000, maximumSubtotal: null, percentage: 40 },
          ],
          ...configuration,
        },
      },
    },
  };
}

function productVariantLine({
  id,
  variantId,
  productId,
  productType,
  quantity = 1,
  subtotal,
}) {
  return {
    id,
    quantity,
    cost: {
      subtotalAmount: {
        amount: String(subtotal),
        currencyCode: 'INR',
      },
    },
    merchandise: {
      __typename: 'ProductVariant',
      id: variantId,
      product: {
        id: productId,
        productType,
      },
    },
  };
}

test('returns the preorder order discount for the matching subtotal tier', () => {
  const result = run(inputForSubtotal(2500));
  const candidate = result.operations[0].orderDiscountsAdd.candidates[0];

  assert.equal(candidate.message, 'PREORDER30');
  assert.equal(candidate.value.percentage.value, '30');
});

test('returns no operations when the discount is configured as manual override', () => {
  const result = run(inputForSubtotal(2500, { mode: 'manual_override' }));

  assert.deepEqual(result, { operations: [] });
});

test('discounts configured fixed free item variants when tier qualifies', () => {
  const input = inputForSubtotal(5200, {
    tiers: [
      {
        code: 'PREORDER40',
        minimumSubtotal: 5000,
        maximumSubtotal: null,
        percentage: 40,
        freeFixedItems: [{ variantId: 'gid://shopify/ProductVariant/oil-1', quantity: 2 }],
      },
    ],
  });
  input.cart.lines = [
    productVariantLine({
      id: 'gid://shopify/CartLine/oil-line',
      variantId: 'gid://shopify/ProductVariant/oil-1',
      productId: 'gid://shopify/Product/oil',
      productType: 'Essential Oil',
      quantity: 3,
      subtotal: 900,
    }),
  ];

  const result = run(input);
  const productCandidates = result.operations[1].productDiscountsAdd.candidates;

  assert.equal(productCandidates[0].targets[0].cartLine.id, 'gid://shopify/CartLine/oil-line');
  assert.equal(productCandidates[0].targets[0].cartLine.quantity, 2);
  assert.equal(productCandidates[0].value.percentage.value, '100');
});

test('matches free travel-size items to full-size products in the same category', () => {
  const input = inputForSubtotal(3200, {
    tiers: [
      {
        code: 'PREORDER30',
        minimumSubtotal: 3000,
        maximumSubtotal: 4999.99,
        percentage: 30,
        freeTravelSizeQuantity: 1,
      },
    ],
    travelSizeMappings: [
      {
        category: 'Face Care',
        fullSizeProductTypes: ['Face Care'],
        travelSizeVariantIds: ['gid://shopify/ProductVariant/travel-face'],
      },
    ],
  });
  input.cart.lines = [
    productVariantLine({
      id: 'gid://shopify/CartLine/full-face',
      variantId: 'gid://shopify/ProductVariant/full-face',
      productId: 'gid://shopify/Product/full-face',
      productType: 'Face Care',
      quantity: 1,
      subtotal: 3000,
    }),
    productVariantLine({
      id: 'gid://shopify/CartLine/travel-face',
      variantId: 'gid://shopify/ProductVariant/travel-face',
      productId: 'gid://shopify/Product/travel-face',
      productType: 'Face Care',
      quantity: 2,
      subtotal: 400,
    }),
  ];

  const result = run(input);
  const productCandidates = result.operations[1].productDiscountsAdd.candidates;

  assert.equal(productCandidates[0].message, 'Free travel-size item');
  assert.equal(productCandidates[0].targets[0].cartLine.id, 'gid://shopify/CartLine/travel-face');
  assert.equal(productCandidates[0].targets[0].cartLine.quantity, 1);
});

test('chooses the configured free-travel override instead of the percentage tier', () => {
  const input = inputForSubtotal(5000, {
    mode: 'manual_override',
    forcedCode: 'FREETRAVEL',
    manualOverrideBenefits: {
      FREETRAVEL: {
        freeTravelSizePerFullSize: 1,
      },
    },
    travelSizeMappings: [
      {
        category: 'Hair Care',
        fullSizeProductTypes: ['Hair Care'],
        travelSizeVariantIds: ['gid://shopify/ProductVariant/travel-hair'],
      },
    ],
  });
  input.cart.lines = [
    productVariantLine({
      id: 'gid://shopify/CartLine/full-hair',
      variantId: 'gid://shopify/ProductVariant/full-hair',
      productId: 'gid://shopify/Product/full-hair',
      productType: 'Hair Care',
      quantity: 2,
      subtotal: 4600,
    }),
    productVariantLine({
      id: 'gid://shopify/CartLine/travel-hair',
      variantId: 'gid://shopify/ProductVariant/travel-hair',
      productId: 'gid://shopify/Product/travel-hair',
      productType: 'Hair Care',
      quantity: 2,
      subtotal: 500,
    }),
  ];

  const result = run(input);

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].productDiscountsAdd.candidates.length, 1);
  assert.equal(result.operations[0].productDiscountsAdd.candidates[0].targets[0].cartLine.quantity, 2);
});

test('selects the higher estimated savings between percentage and free item benefits', () => {
  const input = inputForSubtotal(1000, {
    tiers: [
      {
        code: 'PREORDER25',
        minimumSubtotal: 0,
        maximumSubtotal: 1999.99,
        percentage: 25,
      },
    ],
    autoBenefits: [
      {
        code: 'FREETRAVEL',
        freeFixedItems: [{ variantId: 'gid://shopify/ProductVariant/high-value', quantity: 1 }],
      },
    ],
  });
  input.cart.lines = [
    productVariantLine({
      id: 'gid://shopify/CartLine/high-value',
      variantId: 'gid://shopify/ProductVariant/high-value',
      productId: 'gid://shopify/Product/high-value',
      productType: 'Travel',
      quantity: 1,
      subtotal: 400,
    }),
  ];

  const result = run(input);

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].productDiscountsAdd.candidates[0].message, 'Free item');
});

test('discounts sample lines up to the subtotal-based entitlement when samples are present', () => {
  const input = inputForSubtotal(2600, {
    tiers: [],
    sampleEntitlements: [
      { minimumSubtotal: 0, maximumSubtotal: 999.99, quantity: 1 },
      { minimumSubtotal: 1000, maximumSubtotal: 1999.99, quantity: 2 },
      { minimumSubtotal: 2000, maximumSubtotal: 2999.99, quantity: 3 },
    ],
    sampleVariantIds: ['gid://shopify/ProductVariant/sample'],
  });
  input.cart.lines = [
    productVariantLine({
      id: 'gid://shopify/CartLine/sample',
      variantId: 'gid://shopify/ProductVariant/sample',
      productId: 'gid://shopify/Product/sample',
      productType: 'Sample',
      quantity: 5,
      subtotal: 250,
    }),
  ];

  const result = run(input);

  assert.equal(result.operations[0].productDiscountsAdd.candidates[0].message, 'Free sample');
  assert.equal(result.operations[0].productDiscountsAdd.candidates[0].targets[0].cartLine.quantity, 3);
});
