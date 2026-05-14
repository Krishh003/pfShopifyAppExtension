import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCouponOffers } from '../src/couponOffers.js';

test('normalizes legacy coupon data with preorder offers', () => {
  const offers = normalizeCouponOffers([
    { code: 'CUSTOM10', title: 'Custom loyalty coupon' },
  ]);

  assert.equal(offers[0].code, 'PREORDER25');
  assert.equal(offers.some((offer) => offer.code === 'FREETRAVEL'), true);
  assert.equal(offers.some((offer) => offer.code === 'CUSTOM10'), true);
});

test('deduplicates coupon codes case-insensitively', () => {
  const offers = normalizeCouponOffers([
    { code: 'preorder25', title: 'Duplicate' },
  ]);

  assert.equal(offers.filter((offer) => offer.code === 'PREORDER25').length, 1);
});
