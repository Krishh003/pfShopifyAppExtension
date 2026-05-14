import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCreditBalance,
  getDisplayCreditBalance,
} from '../src/creditBalance.js';

test('uses Shopify Store Credit account balance before custom metafields', () => {
  const balance = getDisplayCreditBalance({
    storeCreditAccounts: {
      nodes: [
        {
          balance: {
            amount: '325.50',
            currencyCode: 'INR',
          },
        },
      ],
    },
    credits_lower: { value: '100' },
  });

  assert.deepEqual(balance, {
    amount: '325.50',
    currencyCode: 'INR',
    isMinorUnit: false,
  });
});

test('falls back to portal status when Store Credit is unavailable', () => {
  const balance = getDisplayCreditBalance({
    storeCreditAccounts: { nodes: [] },
    portal_status: {
      value: JSON.stringify({
        storeCreditBalance: {
          amount: '40.00',
          currencyCode: 'INR',
        },
      }),
    },
  });

  assert.equal(balance.amount, '40.00');
  assert.equal(balance.isMinorUnit, false);
});

test('falls back to legacy credits stored as minor units', () => {
  const balance = getDisplayCreditBalance({
    credits_lower: { value: '25000' },
  });

  assert.equal(balance.amount, '25000');
  assert.equal(balance.isMinorUnit, true);
});

test('formats Store Credit amount without minor-unit conversion', () => {
  const formatted = formatCreditBalance({
    amount: '325.50',
    currencyCode: 'INR',
    isMinorUnit: false,
  });

  assert.equal(formatted, '₹325.50');
});
