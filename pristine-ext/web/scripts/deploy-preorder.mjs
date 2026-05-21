import { gql } from './_admin.mjs';
import { buildPreorderDiscountSetup } from '../src/preorderOffers.js';

// Pushes the real Pristine Forests product mapping into the live preorder config.
// Updates the existing app discounts' "$app:function-configuration" metafields and the
// shop "pristine:preorder_cart_config" metafield. Does NOT create or delete discounts.
//
// Usage: node scripts/deploy-preorder.mjs [--dry]

const DRY = process.argv.includes('--dry');

// ---- Real variant GIDs (from the dev store catalog) ----
const SAMPLE_FACE = 'gid://shopify/ProductVariant/48426706764025'; // 🎁 Face Mist - Sample (100% off)
const SAMPLE_BODYMIST = 'gid://shopify/ProductVariant/48426706895097'; // 🎁 Body Mist - Sample (100% off)
const SAMPLE_BODYOIL = 'gid://shopify/ProductVariant/48426706829561'; // 🎁 Body Oil - Sample (100% off)
const TRAVEL_OIL = 'gid://shopify/ProductVariant/48426706731257'; // 🎁 Travel Oil (100% off)
const OIL_LAVENDER = 'gid://shopify/ProductVariant/48426708730105'; // Lavender Essential Oil 10ml
const OIL_PEPPERMINT = 'gid://shopify/ProductVariant/48426707976441'; // Peppermint Essential Oil 10ml
const FULL_SIZE_TYPES = ['Body Mist', 'Face Mist', 'Body Oil', 'Essential Oil'];

const numericId = (gid) => Number(gid.split('/').pop());

async function getFunctionId() {
  const data = await gql(`{ shopifyFunctions(first: 50) { nodes { id title apiType } } }`);
  const fn = data.shopifyFunctions.nodes.find((n) => n.apiType === 'discount' && /preorder/i.test(n.title));
  if (!fn) throw new Error('Preorder discount function not found');
  return fn.id;
}

async function getDiscountNodes() {
  const data = await gql(`{
    discountNodes(first: 100) {
      nodes {
        id
        discount {
          __typename
          ... on DiscountAutomaticApp { title }
          ... on DiscountCodeApp { title codes(first: 1) { nodes { code } } }
        }
      }
    }
  }`);
  return data.discountNodes.nodes;
}

async function setDiscountConfig(ownerId, value) {
  if (DRY) { console.log(`  [dry] would set $app:function-configuration on ${ownerId}`); return; }
  const data = await gql(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    { mf: [{ ownerId, namespace: '$app', key: 'function-configuration', type: 'json', value }] }
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`metafieldsSet (${ownerId}): ${JSON.stringify(errs)}`);
  console.log(`  set $app:function-configuration on ${ownerId}`);
}

async function setShopCartConfig(value) {
  const shop = await gql(`{ shop { id } }`);
  if (DRY) { console.log(`  [dry] would set pristine:preorder_cart_config on ${shop.shop.id}`); return; }
  const data = await gql(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    { mf: [{ ownerId: shop.shop.id, namespace: 'pristine', key: 'preorder_cart_config', type: 'json', value }] }
  );
  const errs = data.metafieldsSet.userErrors;
  if (errs.length) throw new Error(`shop metafield: ${JSON.stringify(errs)}`);
  console.log('  set pristine:preorder_cart_config on shop');
}

const functionId = await getFunctionId();
console.log('Function:', functionId);

const setup = buildPreorderDiscountSetup({
  functionId,
  sampleVariantIds: [SAMPLE_FACE, SAMPLE_BODYMIST, SAMPLE_BODYOIL],
  travelSizeMappings: [
    { category: 'All', fullSizeProductTypes: FULL_SIZE_TYPES, travelSizeVariantIds: [TRAVEL_OIL] },
  ],
  freeFixedItems: [
    { variantId: OIL_LAVENDER, quantity: 1 },
    { variantId: OIL_PEPPERMINT, quantity: 1 },
  ],
  sampleRewards: [],
});

// Map code -> per-code config metafield value (with mode/forcedCode); automatic -> base config.
const configByCode = new Map(setup.codes.map((c) => [c.code, c.metafields[0].value]));
const automaticConfig = setup.automatic.metafields[0].value;

const nodes = await getDiscountNodes();
console.log('\nUpdating function configuration metafields:');
for (const n of nodes) {
  const d = n.discount;
  if (d.__typename === 'DiscountAutomaticApp' && /preorder/i.test(d.title)) {
    await setDiscountConfig(n.id, automaticConfig);
  } else if (d.__typename === 'DiscountCodeApp') {
    const code = d.codes?.nodes?.[0]?.code;
    if (configByCode.has(code)) {
      await setDiscountConfig(n.id, configByCode.get(code));
    }
  }
}

const cartConfig = {
  sampleRewards: [],
  sampleVariantIds: [SAMPLE_FACE, SAMPLE_BODYMIST, SAMPLE_BODYOIL].map(numericId),
  sampleCategoryMappings: [
    { fullSizeProductTypes: ['Face Mist'], sampleVariantId: numericId(SAMPLE_FACE) },
    { fullSizeProductTypes: ['Body Mist'], sampleVariantId: numericId(SAMPLE_BODYMIST) },
    { fullSizeProductTypes: ['Body Oil', 'Essential Oil'], sampleVariantId: numericId(SAMPLE_BODYOIL) },
  ],
  freeFixedItems: [
    { variantId: numericId(OIL_LAVENDER), quantity: 1 },
    { variantId: numericId(OIL_PEPPERMINT), quantity: 1 },
  ],
  travelSizeMappings: [
    { category: 'All', fullSizeProductTypes: FULL_SIZE_TYPES, travelSizeVariantIds: [numericId(TRAVEL_OIL)] },
  ],
};

console.log('\nUpdating shop cart config:');
await setShopCartConfig(JSON.stringify(cartConfig));

console.log(DRY ? '\nDry run complete.' : '\nDeploy complete.');
