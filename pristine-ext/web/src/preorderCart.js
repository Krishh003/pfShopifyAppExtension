export const AUTO_PROPERTY = '_pristine_preorder_auto';
export const REASON_PROPERTY = '_pristine_preorder_reason';

const DEFAULT_SAMPLE_ENTITLEMENTS = [
  { minimumSubtotal: 0, maximumSubtotal: null, quantity: 1, additionalQuantityPerSubtotal: 1000 },
];

const DEFAULT_TIERS = [
  { code: 'PREORDER25', minimumSubtotal: 0, maximumSubtotal: 1999.99, percentage: 25 },
  { code: 'PREORDER30', minimumSubtotal: 2000, maximumSubtotal: 2999.99, percentage: 30 },
  { code: 'PREORDER30', minimumSubtotal: 3000, maximumSubtotal: 4999.99, percentage: 30, freeTravelSizeQuantity: 1 },
  { code: 'PREORDER40', minimumSubtotal: 5000, maximumSubtotal: null, percentage: 40, freeTravelSizeQuantity: 1 },
];

export function buildPreorderCartConfig({
  tiers = DEFAULT_TIERS,
  sampleEntitlements = DEFAULT_SAMPLE_ENTITLEMENTS,
  sampleRewards = [],
  sampleVariantIds = [],
  sampleCategoryMappings = [],
  freeFixedItems = [],
  travelSizeMappings = [],
} = {}) {
  return {
    tiers: tiers.map((tier) => ({
      ...tier,
      freeFixedItems: tier.code === 'PREORDER40' ? freeFixedItems : tier.freeFixedItems || [],
    })),
    sampleEntitlements,
    sampleRewards,
    sampleVariantIds,
    sampleCategoryMappings,
    travelSizeMappings,
    privateProperties: {
      auto: AUTO_PROPERTY,
      reason: REASON_PROPERTY,
    },
  };
}

export function planPreorderCartMutations(cart, config = buildPreorderCartConfig()) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const subtotal = getCartSubtotal(cart, config, items);
  const tier = getTierForSubtotal(subtotal, config.tiers);
  const desiredLines = [
    ...desiredSampleLines(subtotal, config, items),
    ...desiredFixedFreeLines(tier),
    ...desiredTravelSizeLines(items, tier, config),
  ];
  const adds = [];
  const changes = [];

  for (const desired of desiredLines) {
    const currentAutoQuantity = countManagedQuantity(items, desired.variantId, desired.autoType, config);
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

  const remainingDesiredQuantities = buildRemainingDesiredQuantities(desiredLines);

  for (const item of items) {
    const autoType = item.properties?.[AUTO_PROPERTY];
    const managedAutoType = autoType || getManagedVariantAutoType(item, config);

    if (!managedAutoType) {
      continue;
    }

    const itemQuantity = Number(item.quantity || 0);
    const desiredKey = getDesiredLineKey(item.variant_id ?? item.id, managedAutoType);
    const remainingDesiredQuantity = remainingDesiredQuantities.get(desiredKey) || 0;

    if (remainingDesiredQuantity <= 0) {
      changes.push({ id: item.key, quantity: 0 });
      continue;
    }

    if (itemQuantity > remainingDesiredQuantity) {
      changes.push({ id: item.key, quantity: remainingDesiredQuantity });
      remainingDesiredQuantities.set(desiredKey, 0);
      continue;
    }

    remainingDesiredQuantities.set(desiredKey, remainingDesiredQuantity - itemQuantity);
  }

  return {
    adds,
    changes,
    messages: buildCartMessages(subtotal, tier, desiredLines),
  };
}

function buildRemainingDesiredQuantities(desiredLines) {
  return desiredLines.reduce((quantities, desired) => {
    const key = getDesiredLineKey(desired.variantId, desired.autoType);
    quantities.set(key, (quantities.get(key) || 0) + Number(desired.quantity || 0));
    return quantities;
  }, new Map());
}

function getDesiredLineKey(variantId, autoType) {
  return `${normalizeVariantId(variantId)}:${autoType}`;
}

function getManagedVariantAutoType(item, config) {
  const variantId = item.variant_id ?? item.id;

  if (isConfiguredSampleVariant(variantId, config)) {
    return 'sample';
  }

  return null;
}

function isConfiguredSampleVariant(variantId, config) {
  const sampleRewardVariantIds = Array.isArray(config.sampleRewards)
    ? config.sampleRewards.map((reward) => reward.variantId)
    : [];
  const sampleVariantIds = Array.isArray(config.sampleVariantIds) ? config.sampleVariantIds : [];
  const categoryVariantIds = Array.isArray(config.sampleCategoryMappings)
    ? config.sampleCategoryMappings.map((mapping) => mapping.sampleVariantId)
    : [];

  return [...sampleRewardVariantIds, ...sampleVariantIds, ...categoryVariantIds]
    .some((sampleVariantId) => variantsEqual(sampleVariantId, variantId));
}

function desiredSampleLines(subtotal, config, items = []) {
  const categoryMappings = Array.isArray(config.sampleCategoryMappings) ? config.sampleCategoryMappings : [];

  if (categoryMappings.length > 0) {
    return desiredCategorySampleLines(subtotal, config, items, categoryMappings);
  }

  const sampleReward = getSampleReward(subtotal, config.sampleRewards);

  if (sampleReward) {
    return [{
      variantId: sampleReward.variantId,
      quantity: Number(sampleReward.quantity),
      autoType: 'sample',
      reason: 'subtotal_entitlement',
    }];
  }

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

// Universal samples (spec): total quantity scales with cart value, but the variant
// matches the category the customer is buying. Total is distributed round-robin across
// whichever mapped categories are present in the cart.
function desiredCategorySampleLines(subtotal, config, items, categoryMappings) {
  const total = getSampleEntitlement(subtotal, config.sampleEntitlements);

  if (total <= 0) {
    return [];
  }

  const matchedVariantIds = [];
  for (const mapping of categoryMappings) {
    const productTypes = new Set((mapping.fullSizeProductTypes || []).map((entry) => String(entry)));
    const present = items.some((item) => !isManagedCartLine(item, config) && productTypes.has(item.product_type));
    if (present && mapping.sampleVariantId && !matchedVariantIds.includes(mapping.sampleVariantId)) {
      matchedVariantIds.push(mapping.sampleVariantId);
    }
  }

  const targets = matchedVariantIds.length > 0
    ? matchedVariantIds
    : [config.sampleVariantIds?.[0] ?? categoryMappings[0]?.sampleVariantId].filter(Boolean);

  if (targets.length === 0) {
    return [];
  }

  return targets
    .map((variantId, index) => ({
      variantId,
      quantity: Math.floor(total / targets.length) + (index < total % targets.length ? 1 : 0),
      autoType: 'sample',
      reason: 'subtotal_entitlement',
    }))
    .filter((line) => line.quantity > 0);
}

function getSampleReward(subtotal, sampleRewards = []) {
  if (!Number.isFinite(subtotal) || !Array.isArray(sampleRewards)) {
    return null;
  }

  const matches = sampleRewards.filter((reward) => {
    const quantity = Number(reward.quantity);
    const aboveMinimum = subtotal >= Number(reward.minimumSubtotal);
    const belowMaximum = reward.maximumSubtotal === null || subtotal <= Number(reward.maximumSubtotal);

    return reward.variantId && Number.isFinite(quantity) && quantity > 0 && aboveMinimum && belowMaximum;
  });

  if (matches.length === 0) {
    return null;
  }

  // Most-specific tier wins: highest minimumSubtotal, then narrowest maximumSubtotal.
  matches.sort((a, b) => {
    const minDiff = Number(b.minimumSubtotal) - Number(a.minimumSubtotal);
    if (minDiff !== 0) return minDiff;
    const aMax = a.maximumSubtotal === null ? Infinity : Number(a.maximumSubtotal);
    const bMax = b.maximumSubtotal === null ? Infinity : Number(b.maximumSubtotal);
    return aMax - bMax;
  });

  return matches[0];
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

function countManagedQuantity(items, variantId, autoType, config) {
  return items.reduce((sum, item) => {
    const isSameVariant = variantsEqual(variantId, item.variant_id ?? item.id);
    const isSameType = (item.properties?.[AUTO_PROPERTY] || getManagedVariantAutoType(item, config)) === autoType;

    return isSameVariant && isSameType ? sum + Number(item.quantity || 0) : sum;
  }, 0);
}

function getCartSubtotal(cart, config, items = []) {
  const originalLineSubtotal = items.reduce((sum, item) => {
    if (isManagedCartLine(item, config)) {
      return sum;
    }

    return sum + getOriginalLinePrice(item);
  }, 0);

  if (originalLineSubtotal > 0) {
    return originalLineSubtotal / 100;
  }

  const subtotal = Number(cart?.items_subtotal_price ?? cart?.total_price ?? 0);
  return Number.isFinite(subtotal) ? subtotal / 100 : 0;
}

function isManagedCartLine(item, config) {
  return Boolean(item.properties?.[AUTO_PROPERTY] || getManagedVariantAutoType(item, config));
}

function getOriginalLinePrice(item) {
  const price = Number(item.original_line_price ?? item.final_line_price ?? item.line_price ?? 0);
  return Number.isFinite(price) ? price : 0;
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
  const sampleQuantity = desiredLines
    .filter((line) => line.autoType === 'sample')
    .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  if (tier) {
    messages.push({ type: 'preorder_tier', text: `${tier.code} eligible` });
  }

  if (sampleQuantity > 0) {
    messages.push({ type: 'samples', text: `${sampleQuantity} sample${sampleQuantity === 1 ? '' : 's'} eligible` });
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
