import {
  assertCouponValue,
  assertCurrencyCode,
  assertMoneyAmount,
  assertRequired,
  normalizeCustomerId,
  normalizeDiscountCodeNodeId,
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

const SHOP_METAFIELD_QUERY = `
  query ShopMetafield($namespace: String!, $key: String!) {
    shop {
      id
      metafield(namespace: $namespace, key: $key) {
        id
        value
        type
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

const DISCOUNT_CODES_QUERY = `
  query DiscountCodes($first: Int!, $query: String) {
    discountNodes(first: $first, query: $query) {
      nodes {
        id
        discount {
          ... on DiscountCodeBasic {
            title
            summary
            status
            startsAt
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeApp {
            title
            status
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeBxgy {
            title
            summary
            status
            startsAt
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeFreeShipping {
            title
            summary
            status
            startsAt
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
    }
  }
`;

const DISCOUNT_CODE_ACTIVATE_MUTATION = `
  mutation DiscountCodeActivate($id: ID!) {
    discountCodeActivate(id: $id) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
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

const DISCOUNT_CODE_DEACTIVATE_MUTATION = `
  mutation DiscountCodeDeactivate($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
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
    listDiscountCodes: (input) => listDiscountCodes(client, input),
    activateDiscountCode: (input) => activateDiscountCode(client, input),
    deactivateDiscountCode: (input) => deactivateDiscountCode(client, input),
    createAutomaticAppDiscount: (input) => createAutomaticAppDiscount(client, input),
    createCodeAppDiscount: (input) => createCodeAppDiscount(client, input),
    mirrorCustomerMetafield: (input) => mirrorCustomerMetafield(client, input),
    updateOrderTrackingMetafield: (input) => updateOrderTrackingMetafield(client, input),
    getShopMetafield: (input) => getShopMetafield(client, input),
    setShopMetafield: (input) => setShopMetafield(client, input),
    listPreorderAppDiscounts: () => listPreorderAppDiscounts(client),
    setAppDiscountFunctionConfig: (input) => setAppDiscountFunctionConfig(client, input),
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
  return formatDiscountNode(unwrapMutation(data, 'discountCodeBasicCreate').codeDiscountNode);
}

export async function listDiscountCodes(client, input = {}) {
  const first = Number(input.first || 50);
  const data = await client.request(DISCOUNT_CODES_QUERY, {
    first: Number.isFinite(first) && first > 0 && first <= 250 ? first : 50,
    query: input.query || null,
  });

  return (data.discountNodes?.nodes || [])
    .map(formatDiscountNode)
    .filter(Boolean);
}

export async function activateDiscountCode(client, input) {
  const data = await client.request(DISCOUNT_CODE_ACTIVATE_MUTATION, {
    id: normalizeDiscountCodeNodeId(input.discountId),
  });

  return formatDiscountNode(unwrapMutation(data, 'discountCodeActivate').codeDiscountNode);
}

export async function deactivateDiscountCode(client, input) {
  const data = await client.request(DISCOUNT_CODE_DEACTIVATE_MUTATION, {
    id: normalizeDiscountCodeNodeId(input.discountId),
  });

  return formatDiscountNode(unwrapMutation(data, 'discountCodeDeactivate').codeDiscountNode);
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

const PREORDER_APP_DISCOUNTS_QUERY = `
  query PreorderAppDiscounts {
    discountNodes(first: 100) {
      nodes {
        id
        configurationMetafield: metafield(namespace: "$app", key: "function-configuration") {
          jsonValue
        }
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
          }
          ... on DiscountCodeApp {
            title
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
    }
  }
`;

export async function listPreorderAppDiscounts(client) {
  const data = await client.request(PREORDER_APP_DISCOUNTS_QUERY);
  const root = data?.data || data;
  const nodes = root?.discountNodes?.nodes || [];

  return nodes
    .filter((node) => node.configurationMetafield && /App$/.test(node.discount?.__typename || ''))
    .map((node) => ({
      id: node.id,
      kind: node.discount.__typename === 'DiscountAutomaticApp' ? 'automatic' : 'code',
      title: node.discount.title || '',
      code: node.discount.codes?.nodes?.[0]?.code || null,
      config: node.configurationMetafield.jsonValue || null,
    }));
}

export async function setAppDiscountFunctionConfig(client, { ownerId, value } = {}) {
  assertRequired(ownerId, 'ownerId');
  assertRequired(value, 'value');

  const variables = {
    metafields: [
      {
        ownerId,
        namespace: '$app',
        key: 'function-configuration',
        type: 'json',
        value: String(value),
      },
    ],
  };

  const data = await client.request(METAFIELDS_SET_MUTATION, variables);
  return unwrapMutation(data, 'metafieldsSet').metafields[0];
}

export async function getShopMetafield(client, { namespace = 'pristine', key } = {}) {
  assertRequired(key, 'key');
  const data = await client.request(SHOP_METAFIELD_QUERY, { namespace, key });
  const root = data?.data || data;
  return root?.shop?.metafield || null;
}

export async function setShopMetafield(client, { namespace = 'pristine', key, value, type = 'json' } = {}) {
  assertRequired(key, 'key');
  assertRequired(value, 'value');

  const data = await client.request(SHOP_METAFIELD_QUERY, { namespace, key });
  const root = data?.data || data;
  const shopId = root?.shop?.id;
  if (!shopId) {
    throw new Error('Unable to resolve shop id for metafield write');
  }

  const variables = {
    metafields: [
      {
        ownerId: shopId,
        namespace,
        key,
        value: String(value),
        type,
      },
    ],
  };

  const mutationData = await client.request(METAFIELDS_SET_MUTATION, variables);
  return unwrapMutation(mutationData, 'metafieldsSet').metafields[0];
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

function formatDiscountNode(node) {
  if (!node) {
    return null;
  }

  const discount = node.discount || node.codeDiscount;
  if (!discount) {
    return { id: node.id };
  }

  return {
    id: node.id,
    title: discount.title || '',
    code: discount.codes?.nodes?.[0]?.code || '',
    summary: discount.summary || '',
    status: discount.status || '',
    startsAt: discount.startsAt || null,
    endsAt: discount.endsAt || null,
  };
}
