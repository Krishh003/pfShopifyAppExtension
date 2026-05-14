import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDiscountCode,
  creditStoreCreditAccount,
  debitStoreCreditAccount,
  mirrorCustomerMetafield,
  updateOrderTrackingMetafield,
} from '../src/shopifyOperations.js';
import {
  assertCurrencyCode,
  assertMoneyAmount,
  normalizeCustomerId,
} from '../src/validation.js';

function createGraphqlStub(responseBody = {}) {
  const calls = [];
  return {
    calls,
    client: {
      async request(query, variables) {
        calls.push({ query, variables });
        return responseBody;
      },
    },
  };
}

test('normalizes numeric customer IDs to Shopify GIDs', () => {
  assert.equal(normalizeCustomerId('12345'), 'gid://shopify/Customer/12345');
  assert.equal(
    normalizeCustomerId('gid://shopify/Customer/12345'),
    'gid://shopify/Customer/12345'
  );
});

test('validates money inputs before Admin GraphQL calls', () => {
  assert.equal(assertMoneyAmount('10.50'), '10.50');
  assert.equal(assertCurrencyCode('inr'), 'INR');
  assert.throws(() => assertMoneyAmount('-1'), /positive amount/);
  assert.throws(() => assertCurrencyCode('RUPEE'), /ISO currency code/);
});

test('credits real Shopify store credit account by customer ID', async () => {
  const { client, calls } = createGraphqlStub({
    storeCreditAccountCredit: {
      storeCreditAccountTransaction: {
        amount: { amount: '25.00', currencyCode: 'INR' },
        account: {
          id: 'gid://shopify/StoreCreditAccount/1',
          balance: { amount: '25.00', currencyCode: 'INR' },
        },
      },
      userErrors: [],
    },
  });

  const result = await creditStoreCreditAccount(client, {
    customerId: '42',
    amount: '25.00',
    currencyCode: 'inr',
  });

  assert.match(calls[0].query, /storeCreditAccountCredit/);
  assert.equal(calls[0].variables.id, 'gid://shopify/Customer/42');
  assert.deepEqual(calls[0].variables.creditInput.creditAmount, {
    amount: '25.00',
    currencyCode: 'INR',
  });
  assert.equal(result.account.balance.amount, '25.00');
});

test('debits real Shopify store credit account by customer ID', async () => {
  const { client, calls } = createGraphqlStub({
    storeCreditAccountDebit: {
      storeCreditAccountTransaction: {
        amount: { amount: '-10.00', currencyCode: 'INR' },
        account: {
          id: 'gid://shopify/StoreCreditAccount/1',
          balance: { amount: '15.00', currencyCode: 'INR' },
        },
      },
      userErrors: [],
    },
  });

  const result = await debitStoreCreditAccount(client, {
    customerId: '42',
    amount: '10.00',
    currencyCode: 'INR',
  });

  assert.match(calls[0].query, /storeCreditAccountDebit/);
  assert.equal(calls[0].variables.id, 'gid://shopify/Customer/42');
  assert.equal(result.account.balance.amount, '15.00');
});

test('creates native Shopify discount codes for operational coupons', async () => {
  const { client, calls } = createGraphqlStub({
    discountCodeBasicCreate: {
      codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/1' },
      userErrors: [],
    },
  });

  const result = await createDiscountCode(client, {
    title: 'Pristine Welcome',
    code: 'PRISTINE10',
    startsAt: '2026-05-11T00:00:00Z',
    percentage: 10,
  });

  assert.match(calls[0].query, /discountCodeBasicCreate/);
  assert.equal(calls[0].variables.basicCodeDiscount.code, 'PRISTINE10');
  assert.deepEqual(calls[0].variables.basicCodeDiscount.customerGets.value, {
    percentage: 0.1,
  });
  assert.equal(result.id, 'gid://shopify/DiscountCodeNode/1');
});

test('mirrors display state to customer metafields without making it source of truth', async () => {
  const { client, calls } = createGraphqlStub({
    metafieldsSet: {
      metafields: [{ id: 'gid://shopify/Metafield/1', key: 'visible_coupons' }],
      userErrors: [],
    },
  });

  const result = await mirrorCustomerMetafield(client, {
    customerId: '42',
    key: 'visible_coupons',
    value: JSON.stringify([{ code: 'PRISTINE10' }]),
    type: 'json',
  });

  assert.match(calls[0].query, /metafieldsSet/);
  assert.equal(calls[0].variables.metafields[0].namespace, 'pristine');
  assert.equal(calls[0].variables.metafields[0].ownerId, 'gid://shopify/Customer/42');
  assert.equal(result.key, 'visible_coupons');
});

test('updates order tracking metafields for customer account display', async () => {
  const { client, calls } = createGraphqlStub({
    metafieldsSet: {
      metafields: [{ id: 'gid://shopify/Metafield/2', key: 'tracking_summary' }],
      userErrors: [],
    },
  });

  const result = await updateOrderTrackingMetafield(client, {
    orderId: '99',
    value: JSON.stringify({ status: 'Packed' }),
  });

  assert.equal(calls[0].variables.metafields[0].ownerId, 'gid://shopify/Order/99');
  assert.equal(calls[0].variables.metafields[0].key, 'tracking_summary');
  assert.equal(result.key, 'tracking_summary');
});
