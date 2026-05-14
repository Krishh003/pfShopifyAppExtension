import {
  assertCouponValue,
  assertCurrencyCode,
  assertMoneyAmount,
  assertRequired,
  normalizeCustomerId,
  normalizeOrderId,
} from './validation.js';

const METAFIELDS_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const STORE_CREDIT_CREDIT_MUTATION = `
  mutation StoreCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
    storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
      storeCreditAccountTransaction {
        amount {
          amount
          currencyCode
        }
        account {
          id
          balance {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const STORE_CREDIT_DEBIT_MUTATION = `
  mutation StoreCreditAccountDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
      storeCreditAccountTransaction {
        amount {
          amount
          currencyCode
        }
        account {
          id
          balance {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DISCOUNT_CODE_BASIC_CREATE_MUTATION = `
  mutation DiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DISCOUNT_AUTOMATIC_APP_CREATE_MUTATION = `
  mutation DiscountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DISCOUNT_CODE_APP_CREATE_MUTATION = `
  mutation DiscountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
      codeAppDiscount {
        discountId
        title
        status
        codes(first: 5) {
          nodes {
            code
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export function createShopifyOperations(client) {
  return {
    creditStoreCreditAccount: (input) => creditStoreCreditAccount(client, input),
    debitStoreCreditAccount: (input) => debitStoreCreditAccount(client, input),
    createDiscountCode: (input) => createDiscountCode(client, input),
    createAutomaticAppDiscount: (input) => createAutomaticAppDiscount(client, input),
    createCodeAppDiscount: (input) => createCodeAppDiscount(client, input),
    mirrorCustomerMetafield: (input) => mirrorCustomerMetafield(client, input),
    updateOrderTrackingMetafield: (input) => updateOrderTrackingMetafield(client, input),
  };
}

export async function creditStoreCreditAccount(client, input) {
  const variables = {
    id: normalizeCustomerId(input.customerId),
    creditInput: {
      creditAmount: {
        amount: assertMoneyAmount(input.amount),
        currencyCode: assertCurrencyCode(input.currencyCode),
      },
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    },
  };

  const data = await client.request(STORE_CREDIT_CREDIT_MUTATION, variables);
  return unwrapMutation(data, 'storeCreditAccountCredit').storeCreditAccountTransaction;
}

export async function debitStoreCreditAccount(client, input) {
  const variables = {
    id: normalizeCustomerId(input.customerId),
    debitInput: {
      debitAmount: {
        amount: assertMoneyAmount(input.amount),
        currencyCode: assertCurrencyCode(input.currencyCode),
      },
    },
  };

  const data = await client.request(STORE_CREDIT_DEBIT_MUTATION, variables);
  return unwrapMutation(data, 'storeCreditAccountDebit').storeCreditAccountTransaction;
}

export async function createDiscountCode(client, input) {
  assertRequired(input.title, 'title');
  assertRequired(input.code, 'code');

  const couponValue = assertCouponValue(input);
  const value = couponValue.percentage
    ? { percentage: couponValue.percentage }
    : { discountAmount: couponValue.discountAmount };

  const variables = {
    basicCodeDiscount: {
      title: input.title,
      code: input.code,
      startsAt: input.startsAt || new Date().toISOString(),
      ...(input.endsAt ? { endsAt: input.endsAt } : {}),
      ...(input.usageLimit ? { usageLimit: Number(input.usageLimit) } : {}),
      customerSelection: { all: true },
      customerGets: {
        value,
        items: { all: true },
      },
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      },
    },
  };

  const data = await client.request(DISCOUNT_CODE_BASIC_CREATE_MUTATION, variables);
  return unwrapMutation(data, 'discountCodeBasicCreate').codeDiscountNode;
}

export async function createAutomaticAppDiscount(client, input) {
  assertRequired(input.title, 'title');
  assertRequired(input.functionId, 'functionId');

  const data = await client.request(DISCOUNT_AUTOMATIC_APP_CREATE_MUTATION, {
    automaticAppDiscount: input,
  });

  return unwrapMutation(data, 'discountAutomaticAppCreate').automaticAppDiscount;
}

export async function createCodeAppDiscount(client, input) {
  assertRequired(input.title, 'title');
  assertRequired(input.code, 'code');
  assertRequired(input.functionId, 'functionId');

  const data = await client.request(DISCOUNT_CODE_APP_CREATE_MUTATION, {
    codeAppDiscount: input,
  });

  return unwrapMutation(data, 'discountCodeAppCreate').codeAppDiscount;
}

export async function mirrorCustomerMetafield(client, input) {
  const result = await setMetafield(client, {
    ownerId: normalizeCustomerId(input.customerId),
    key: input.key,
    value: input.value,
    type: input.type,
  });

  return result;
}

export async function updateOrderTrackingMetafield(client, input) {
  return setMetafield(client, {
    ownerId: normalizeOrderId(input.orderId),
    key: input.key || 'tracking_summary',
    value: input.value,
    type: input.type || 'json',
  });
}

async function setMetafield(client, { ownerId, key, value, type = 'single_line_text_field' }) {
  assertRequired(key, 'key');
  assertRequired(value, 'value');

  const variables = {
    metafields: [
      {
        ownerId,
        namespace: 'pristine',
        key,
        value: String(value),
        type,
      },
    ],
  };

  const data = await client.request(METAFIELDS_SET_MUTATION, variables);
  return unwrapMutation(data, 'metafieldsSet').metafields[0];
}

function unwrapMutation(data, mutationName) {
  const payload = data?.data?.[mutationName] || data?.[mutationName];

  if (!payload) {
    throw new Error(`Missing Shopify response payload: ${mutationName}`);
  }

  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((error) => error.message).join('; '));
  }

  return payload;
}
