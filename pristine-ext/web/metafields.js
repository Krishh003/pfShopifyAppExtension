import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import dotenv from 'dotenv';

dotenv.config();

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders', 'write_orders'],
  hostName: process.env.SHOP_DOMAIN,
  apiVersion: process.env.API_VERSION || LATEST_API_VERSION,
  isEmbeddedApp: false,
});

/**
 * Updates a metafield for a customer.
 * @param {Object} session - Shopify session object
 * @param {string} customerId - GID of the customer (e.g., gid://shopify/Customer/123)
 * @param {string} key - Metafield key
 * @param {string} value - Metafield value
 * @param {string} type - Metafield type (e.g., number_integer, json)
 */
export async function updateCustomerMetafield(session, customerId, key, value, type) {
  const client = new shopify.clients.Graphql({ session });

  const query = `
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

  const variables = {
    metafields: [
      {
        ownerId: customerId.startsWith('gid://') ? customerId : `gid://shopify/Customer/${customerId}`,
        namespace: 'pristine',
        key: key,
        value: value,
        type: type,
      },
    ],
  };

  const response = await client.query({
    data: {
      query,
      variables,
    },
  });

  const result = response.body.data.metafieldsSet;

  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors[0].message);
  }

  return result.metafields[0];
}

/**
 * Updates a metafield for an order (for tracking).
 * @param {Object} session - Shopify session object
 * @param {string} orderId - GID of the order
 * @param {string} key - Metafield key
 * @param {string} value - Metafield value
 * @param {string} type - Metafield type
 */
export async function updateOrderMetafield(session, orderId, key, value, type) {
  const client = new shopify.clients.Graphql({ session });

  const query = `
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

  const variables = {
    metafields: [
      {
        ownerId: orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`,
        namespace: 'pristine',
        key: key,
        value: value,
        type: type,
      },
    ],
  };

  const response = await client.query({
    data: {
      query,
      variables,
    },
  });

  const result = response.body.data.metafieldsSet;

  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors[0].message);
  }

  return result.metafields[0];
}
