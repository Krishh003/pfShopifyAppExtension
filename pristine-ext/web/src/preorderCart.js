export const AUTO_PROPERTY = '_pristine_preorder_auto';
export const REASON_PROPERTY = '_pristine_preorder_reason';

const DEFAULT_SAMPLE_ENTITLEMENTS = [
  { minimumSubtotal: 0, maximumSubtotal: 999.99, quantity: 1 },
  { minimumSubtotal: 1000, maximumSubtotal: 1999.99, quantity: 2 },
  { minimumSubtotal: 2000, maximumSubtotal: 2999.99, quantity: 3 },
  { minimumSubtotal: 3000, maximumSubtotal: 3999.99, quantity: 4 },
  { minimumSubtotal: 4000, maximumSubtotal: 4999.99, quantity: 5 },
  { minimumSubtotal: 5000, maximumSubtotal: null, quantity: 6, additionalQuantityPerSubtotal: 1000 },
];

const DEFAULT_TIERS = [
  { code: 'PREORDER25', minimumSubtotal: 0, maximumSubtotal: 1999.99, percentage: 25 },
  { code: 'PREORDER30', minimumSubtotal: 2000, maximumSubtotal: 4999.99, percentage: 30, freeTravelSizeQuantity: 1 },
  { code: 'PREORDER40', minimumSubtotal: 5000, maximumSubtotal: null, percentage: 40, freeTravelSizeQuantity: 1 },
];

export function buildPreorderCartConfig({
  tiers = DEFAULT_TIERS,
  sampleEntitlements = DEFAULT_SAMPLE_ENTITLEMENTS,
  sampleVariantIds = [],
  freeFixedItems = [],
  travelSizeMappings = [],
} = {}) {
  return {
    tiers: tiers.map((tier) => ({
      ...tier,
      freeFixedItems: tier.code === 'PREORDER40' ? freeFixedItems : tier.freeFixedItems || [],
    })),
    sampleEntitlements,
    sampleVariantIds,
    travelSizeMappings,
    privateProperties: {
      auto: AUTO_PROPERTY,
      reason: REASON_PROPERTY,
    },
  };
}

export function planPreorderCartMutations(cart, config = buildPreorderCartConfig()) {
  const subtotal = getCartSubtotal(cart);
  const tier = getTierForSubtotal(subtotal, config.tiers);
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const desiredLines = [
    ...desiredSampleLines(subtotal, config),
    ...desiredFixedFreeLines(tier),
    ...desiredTravelSizeLines(items, tier, config),
  ];
  const adds = [];
  const changes = [];

  for (const desired of desiredLines) {
    const currentAutoQuantity = countAutoQuantity(items, desired.variantId, desired.autoType);
    const missingQuantity = desired.quantity - currentAutoQuantity;

    if (missingQuantity > 0) {
      adds.push({
        id: desired.variantId,
        quantity: missingQuantity,
        properties: {
          [AUTO_PROPERTY]: desired.autoType,
          [REASON_PROPERTY]: desired.reason,
        },
      });
    }
  }

  for (const item of items) {
    const autoType = item.properties?.[AUTO_PROPERTY];

    if (!autoType) {
      continue;
    }

    const desiredQuantity = desiredLines
      .filter((desired) => variantsEqual(desired.variantId, item.variant_id ?? item.id) && desired.autoType === autoType)
      .reduce((sum, desired) => sum + desired.quantity, 0);

    if (desiredQuantity <= 0) {
      changes.push({ id: item.key, quantity: 0 });
      continue;
    }

    if (Number(item.quantity) > desiredQuantity) {
      changes.push({ id: item.key, quantity: desiredQuantity });
    }
  }

  return {
    adds,
    changes,
    messages: buildCartMessages(subtotal, tier, desiredLines),
  };
}

function desiredSampleLines(subtotal, config) {
  const variantId = config.sampleVariantIds?.[0];
  const quantity = getSampleEntitlement(subtotal, config.sampleEntitlements);

  if (!variantId || quantity <= 0) {
    return [];
  }

  return [{
    variantId,
    quantity,
    autoType: 'sample',
    reason: 'subtotal_entitlement',
  }];
}

function desiredFixedFreeLines(tier) {
  if (!tier || !Array.isArray(tier.freeFixedItems)) {
    return [];
  }

  return tier.freeFixedItems
    .filter((item) => item.variantId && Number(item.quantity) > 0)
    .map((item) => ({
      variantId: item.variantId,
      quantity: Number(item.quantity),
      autoType: 'free_fixed',
      reason: tier.code,
    }));
}

function desiredTravelSizeLines(items, tier, config) {
  const quantity = Number(tier?.freeTravelSizeQuantity || 0);

  if (quantity <= 0 || !Array.isArray(config.travelSizeMappings)) {
    return [];
  }

  return config.travelSizeMappings.flatMap((mapping) => {
    const fullSizeQuantity = countFullSizeQuantity(items, mapping);
    const variantId = mapping.travelSizeVariantIds?.[0];

    if (!variantId || fullSizeQuantity <= 0) {
      return [];
    }

    return [{
      variantId,
      quantity: Math.min(quantity, fullSizeQuantity),
      autoType: 'travel_size',
      reason: mapping.category || tier.code,
    }];
  });
}

function countFullSizeQuantity(items, mapping) {
  const fullSizeTypes = new Set(mapping.fullSizeProductTypes || [mapping.category]);
  const travelVariantIds = new Set((mapping.travelSizeVariantIds || []).map(normalizeVariantId));

  return items.reduce((sum, item) => {
    if (travelVariantIds.has(normalizeVariantId(item.variant_id ?? item.id))) {
      return sum;
    }

    return fullSizeTypes.has(item.product_type) ? sum + Number(item.quantity || 0) : sum;
  }, 0);
}

function countAutoQuantity(items, variantId, autoType) {
  return items.reduce((sum, item) => {
    const isSameVariant = variantsEqual(variantId, item.variant_id ?? item.id);
    const isSameType = item.properties?.[AUTO_PROPERTY] === autoType;

    return isSameVariant && isSameType ? sum + Number(item.quantity || 0) : sum;
  }, 0);
}

function getCartSubtotal(cart) {
  const subtotal = Number(cart?.items_subtotal_price ?? cart?.total_price ?? 0);
  return Number.isFinite(subtotal) ? subtotal / 100 : 0;
}

function getTierForSubtotal(subtotal, tiers = []) {
  if (!Number.isFinite(subtotal) || !Array.isArray(tiers)) {
    return null;
  }

  return tiers.find((tier) => {
    const aboveMinimum = subtotal >= Number(tier.minimumSubtotal);
    const belowMaximum = tier.maximumSubtotal === null || subtotal <= Number(tier.maximumSubtotal);
    return aboveMinimum && belowMaximum;
  }) || null;
}

function getSampleEntitlement(subtotal, entitlements = []) {
  const entitlement = entitlements.find((entry) => {
    const aboveMinimum = subtotal >= Number(entry.minimumSubtotal);
    const belowMaximum = entry.maximumSubtotal === null || subtotal <= Number(entry.maximumSubtotal);
    return aboveMinimum && belowMaximum;
  });

  if (!entitlement) {
    return 0;
  }

  if (entitlement.maximumSubtotal === null && entitlement.additionalQuantityPerSubtotal) {
    const extraSteps = Math.floor(
      Math.max(0, subtotal - Number(entitlement.minimumSubtotal)) / Number(entitlement.additionalQuantityPerSubtotal)
    );
    return Number(entitlement.quantity) + extraSteps;
  }

  return Number(entitlement.quantity);
}

function buildCartMessages(subtotal, tier, desiredLines) {
  const messages = [];
  const samples = desiredLines.find((line) => line.autoType === 'sample');

  if (tier) {
    messages.push({ type: 'preorder_tier', text: `${tier.code} eligible` });
  }

  if (samples) {
    messages.push({ type: 'samples', text: `${samples.quantity} sample${samples.quantity === 1 ? '' : 's'} eligible` });
  }

  if (subtotal > 0 && desiredLines.some((line) => line.autoType === 'travel_size')) {
    messages.push({ type: 'travel_size', text: 'Travel-size item eligible' });
  }

  return messages;
}

function variantsEqual(left, right) {
  return normalizeVariantId(left) === normalizeVariantId(right);
}

function normalizeVariantId(value) {
  const stringValue = String(value || '');
  const match = stringValue.match(/ProductVariant\/([^/?]+)/);
  return match ? match[1] : stringValue;
}
