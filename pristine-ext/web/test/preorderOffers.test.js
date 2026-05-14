import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPreorderDiscountSetup,
  buildPreorderVisibleCoupons,
  getPreorderTierForSubtotal,
} from '../src/preorderOffers.js';

test('selects preorder percentage tiers from cart subtotal', () => {
  assert.equal(getPreorderTierForSubtotal(999).code, 'PREORDER25');
  assert.equal(getPreorderTierForSubtotal(2000).code, 'PREORDER30');
  assert.equal(getPreorderTierForSubtotal(3000).code, 'PREORDER30');
  assert.equal(getPreorderTierForSubtotal(5000).code, 'PREORDER40');
});

test('builds portal-visible preorder coupon summaries', () => {
  const coupons = buildPreorderVisibleCoupons();

  assert.deepEqual(
    coupons.map((coupon) => coupon.code),
    ['PREORDER25', 'PREORDER30', 'PREORDER40', 'FREETRAVEL']
  );
  assert.match(coupons[0].title, /25%/);
  assert.equal(coupons[3].type, 'manual_override');
});

test('builds automatic and manual app discount setup requests', () => {
  const setup = buildPreorderDiscountSetup({
    functionId: '11111111-1111-1111-1111-111111111111',
    startsAt: '2026-05-13T00:00:00Z',
  });

  assert.equal(setup.automatic.title, 'Pristine Preorder Best Value');
  assert.equal(setup.automatic.discountClasses[0], 'ORDER');
  assert.equal(setup.automatic.functionId, '11111111-1111-1111-1111-111111111111');
  assert.equal(setup.codes.length, 4);
  assert.deepEqual(
    setup.codes.map((discount) => discount.code),
    ['PREORDER25', 'PREORDER30', 'PREORDER40', 'FREETRAVEL']
  );
  assert.equal(JSON.parse(setup.automatic.metafields[0].value).overrideCodes.freeTravel, 'FREETRAVEL');
});

test('publishes free item, travel-size, sample, and cleanup contracts in function config', () => {
  const setup = buildPreorderDiscountSetup({
    functionId: '11111111-1111-1111-1111-111111111111',
    startsAt: '2026-05-13T00:00:00Z',
    freeFixedItems: [
      { variantId: 'gid://shopify/ProductVariant/oil-1', quantity: 2 },
    ],
    travelSizeMappings: [
      {
        category: 'Face Care',
        fullSizeProductTypes: ['Face Care'],
        travelSizeVariantIds: ['gid://shopify/ProductVariant/travel-face'],
      },
    ],
    sampleVariantIds: ['gid://shopify/ProductVariant/sample'],
  });
  const config = JSON.parse(setup.automatic.metafields[0].value);

  assert.equal(config.tiers[2].freeFixedItems[0].variantId, 'gid://shopify/ProductVariant/oil-1');
  assert.equal(config.travelSizeMappings[0].category, 'Face Care');
  assert.equal(config.sampleVariantIds[0], 'gid://shopify/ProductVariant/sample');
  assert.equal(config.cartMutation.required, true);
  assert.match(config.cartMutation.reason, /cannot add or remove cart lines/);
});
