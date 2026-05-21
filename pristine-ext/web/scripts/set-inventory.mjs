import { gql } from './_admin.mjs';

// Sets on-hand stock for real Pristine Forests products that currently show 0.
// Requires write_inventory + read_locations scopes (run `shopify app deploy` after
// the scope change in shopify.app.toml, then run this script).
//
// Usage: node scripts/set-inventory.mjs [quantity]   (default 500)

const QUANTITY = Number(process.argv[2] || 500);
const DEMO_TYPES = new Set(['snowboard', 'accessories', 'giftcard']); // Shopify sample data — leave alone

async function getPrimaryLocationId() {
  const data = await gql(`{ locations(first: 10, query: "status:active") { nodes { id name } } }`);
  const node = data.locations.nodes[0];
  if (!node) throw new Error('No active location found');
  console.log(`Location: ${node.name} (${node.id})`);
  return node.id;
}

async function collectTargets() {
  const targets = [];
  let cursor = null;
  do {
    const data = await gql(
      `query($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            title productType
            variants(first: 50) {
              nodes { id title inventoryQuantity inventoryItem { id tracked } }
            }
          }
        }
      }`,
      { cursor }
    );
    for (const p of data.products.nodes) {
      if (DEMO_TYPES.has(p.productType)) continue;
      for (const v of p.variants.nodes) {
        if (v.inventoryItem?.tracked && (v.inventoryQuantity ?? 0) <= 0) {
          targets.push({
            inventoryItemId: v.inventoryItem.id,
            current: v.inventoryQuantity ?? 0,
            label: `${p.title} / ${v.title}`,
          });
        }
      }
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  return targets;
}

async function setQuantities(locationId, targets) {
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    // 2026-04: `changeFromQuantity` (compare-from value) is required per item, and the
    // `@idempotent` directive is required on the mutation field.
    const data = await gql(
      `mutation($input: InventorySetQuantitiesInput!, $key: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $key) {
          userErrors { field message }
        }
      }`,
      {
        key: globalThis.crypto.randomUUID(),
        input: {
          name: 'available',
          reason: 'correction',
          quantities: slice.map((t) => ({
            inventoryItemId: t.inventoryItemId,
            locationId,
            quantity: QUANTITY,
            changeFromQuantity: t.current,
          })),
        },
      }
    );
    const errs = data.inventorySetQuantities.userErrors;
    if (errs.length) {
      console.error('userErrors:', JSON.stringify(errs, null, 2));
      throw new Error('inventorySetQuantities returned userErrors');
    }
    done += slice.length;
    console.log(`Set ${done}/${targets.length}...`);
  }
}

const locationId = await getPrimaryLocationId();
const targets = await collectTargets();
console.log(`Found ${targets.length} tracked variants at 0 stock. Setting available=${QUANTITY}.`);
if (targets.length === 0) {
  console.log('Nothing to do.');
} else {
  await setQuantities(locationId, targets);
  console.log('Done. Inventory updated.');
}
