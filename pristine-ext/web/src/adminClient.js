import { ValidationError, assertRequired } from './validation.js';

export const DEFAULT_API_VERSION = '2026-04';

export function createAdminGraphqlClient({
  shopDomain,
  accessToken,
  clientId,
  clientSecret,
  apiVersion = DEFAULT_API_VERSION,
  fetchImpl = globalThis.fetch,
}) {
  assertRequired(shopDomain, 'SHOP_DOMAIN');

  if (!accessToken && (!clientId || !clientSecret)) {
    assertRequired(accessToken, 'SHOPIFY_ACCESS_TOKEN');
  }

  if (typeof fetchImpl !== 'function') {
    throw new ValidationError('fetch implementation is required');
  }

  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  const tokenEndpoint = `https://${shopDomain}/admin/oauth/access_token`;
  let cachedAccessToken = accessToken || null;
  let tokenExpiresAt = 0;

  async function getAccessToken() {
    if (!clientId || !clientSecret) {
      return cachedAccessToken;
    }

    if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
      return cachedAccessToken;
    }

    const response = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Shopify Admin token HTTP ${response.status}`);
    }

    if (!payload.access_token) {
      throw new Error('Shopify Admin token response did not include access_token');
    }

    cachedAccessToken = payload.access_token;
    tokenExpiresAt = Date.now() + Number(payload.expires_in || 0) * 1000;

    return cachedAccessToken;
  }

  return {
    async request(query, variables = {}) {
      const activeToken = await getAccessToken();
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': activeToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(`Shopify Admin GraphQL HTTP ${response.status}`);
      }

      if (payload.errors?.length) {
        throw new Error(payload.errors.map((error) => error.message).join('; '));
      }

      return payload.data;
    },
  };
}
