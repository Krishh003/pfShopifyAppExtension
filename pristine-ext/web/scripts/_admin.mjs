import 'dotenv/config';

const shop = process.env.SHOP_DOMAIN;
const version = process.env.API_VERSION || '2026-04';
const endpoint = `https://${shop}/admin/api/${version}/graphql.json`;

let cachedToken = null;

export async function getToken() {
  if (cachedToken) return cachedToken;

  const direct = process.env.SHOPIFY_ACCESS_TOKEN;
  if (direct) {
    const probe = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': direct },
      body: JSON.stringify({ query: '{ shop { name } }' }),
    });
    if (probe.ok) {
      const j = await probe.json();
      if (!j.errors) { cachedToken = direct; return cachedToken; }
    }
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error(`client_credentials failed HTTP ${res.status}: ${JSON.stringify(j)}`);
  }
  cachedToken = j.access_token;
  return cachedToken;
}

export async function gql(query, variables = {}) {
  const token = await getToken();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export const SHOP_DOMAIN = shop;
export const API_VERSION = version;
