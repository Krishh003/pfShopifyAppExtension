import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminGraphqlClient } from '../src/adminClient.js';

test('uses client credentials token before Admin GraphQL requests', async () => {
  const calls = [];
  const client = createAdminGraphqlClient({
    shopDomain: 'main-site-test.myshopify.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      if (url === 'https://main-site-test.myshopify.com/admin/oauth/access_token') {
        return Response.json({ access_token: 'fresh-token', expires_in: 86400 });
      }

      return Response.json({ data: { shop: { name: 'main site test' } } });
    },
  });

  const data = await client.request('{ shop { name } }');

  assert.equal(data.shop.name, 'main site test');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body.toString(), 'grant_type=client_credentials&client_id=client-id&client_secret=client-secret');
  assert.equal(calls[1].options.headers['X-Shopify-Access-Token'], 'fresh-token');
});

test('reuses client credentials token until it is near expiry', async () => {
  let tokenRequests = 0;
  const client = createAdminGraphqlClient({
    shopDomain: 'main-site-test.myshopify.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl: async (url) => {
      if (url === 'https://main-site-test.myshopify.com/admin/oauth/access_token') {
        tokenRequests += 1;
        return Response.json({ access_token: `fresh-token-${tokenRequests}`, expires_in: 86400 });
      }

      return Response.json({ data: { ok: true } });
    },
  });

  await client.request('{ shop { name } }');
  await client.request('{ shop { name } }');

  assert.equal(tokenRequests, 1);
});
