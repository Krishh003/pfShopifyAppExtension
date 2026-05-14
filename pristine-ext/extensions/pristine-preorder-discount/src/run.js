const ORDER_DISCOUNT_CLASS = 'ORDER';
const PRODUCT_DISCOUNT_CLASS = 'PRODUCT';

export function run(input) {
  const config = input.discount?.metafield?.jsonValue || {};
  const subtotal = Number(input.cart?.cost?.subtotalAmount?.amount);
  const lines = getProductVariantLines(input.cart?.lines);

  if (config.mode === 'manual_override') {
    return buildManualOverrideResult(input, config, lines);
  }

  const tier = getTierForSubtotal(subtotal, config.tiers);
  const tierBenefit = tier ? buildTierBenefit(input, config, tier, subtotal, lines) : null;
  const autoBenefits = Array.isArray(config.autoBenefits)
    ? config.autoBenefits.map((benefit) => buildProductBenefit(input, config, benefit, subtotal, lines))
    : [];
  const sampleBenefit = buildSampleBenefit(input, config, subtotal, lines);
  const bestBenefit = selectBestBenefit([tierBenefit, ...autoBenefits, sampleBenefit]);

  return buildResultForBenefit(input, bestBenefit);
}

function buildManualOverrideResult(input, config, lines) {
  const forcedBenefit = config.manualOverrideBenefits?.[config.forcedCode] || {};
  const subtotal = Number(input.cart?.cost?.subtotalAmount?.amount);
  const benefit = buildProductBenefit(input, config, forcedBenefit, subtotal, lines);

  return buildResultForBenefit(input, benefit);
}

function buildTierBenefit(input, config, tier, subtotal, lines) {
  const orderCandidates = [];
  const productCandidates = [];
  let savings = 0;

  if (input.discount?.discountClasses?.includes(ORDER_DISCOUNT_CLASS)) {
    const percentage = Number(tier.percentage);
    savings += Number.isFinite(subtotal) && Number.isFinite(percentage)
      ? subtotal * (percentage / 100)
      : 0;
    orderCandidates.push({
      message: tier.code,
      targets: [
        {
          orderSubtotal: {
            excludedCartLineIds: [],
          },
        },
      ],
      value: {
        percentage: {
          value: String(tier.percentage),
        },
      },
    });
  }

  if (input.discount?.discountClasses?.includes(PRODUCT_DISCOUNT_CLASS)) {
    const productBenefit = buildProductBenefit(input, config, tier, subtotal, lines);
    savings += productBenefit.savings;
    productCandidates.push(...productBenefit.productCandidates);
  }

  return {
    code: tier.code,
    savings,
    orderCandidates,
    productCandidates,
  };
}

function buildProductBenefit(input, config, benefit, subtotal, lines) {
  if (!input.discount?.discountClasses?.includes(PRODUCT_DISCOUNT_CLASS)) {
    return emptyBenefit(benefit?.code);
  }

  const productCandidates = [
    ...buildFreeFixedItemCandidates(lines, benefit.freeFixedItems, 'Free item'),
    ...buildFreeTravelSizeCandidates(lines, config.travelSizeMappings, benefit, subtotal),
  ];

  return {
    code: benefit?.code,
    savings: estimateProductSavings(productCandidates),
    orderCandidates: [],
    productCandidates,
  };
}

function buildSampleBenefit(input, config, subtotal, lines) {
  if (!input.discount?.discountClasses?.includes(PRODUCT_DISCOUNT_CLASS)) {
    return emptyBenefit('SAMPLES');
  }

  const entitlement = getSampleEntitlement(subtotal, config.sampleEntitlements);
  const productCandidates = buildFreeVariantCandidates(
    lines,
    new Set(config.sampleVariantIds || []),
    entitlement,
    'Free sample'
  );

  return {
    code: 'SAMPLES',
    savings: estimateProductSavings(productCandidates),
    orderCandidates: [],
    productCandidates,
  };
}

function buildFreeFixedItemCandidates(lines, freeFixedItems = [], message) {
  if (!Array.isArray(freeFixedItems)) {
    return [];
  }

  return freeFixedItems.flatMap((item) => buildFreeVariantCandidates(
    lines,
    new Set([item.variantId]),
    Number(item.quantity),
    message
  ));
}

function buildFreeTravelSizeCandidates(lines, mappings = [], benefit = {}, subtotal) {
  const quantityLimit = Number(benefit.freeTravelSizeQuantity || benefit.freeTravelSizePerFullSize || 0);

  if (!Array.isArray(mappings) || quantityLimit <= 0) {
    return [];
  }

  return mappings.flatMap((mapping) => {
    const fullSizeQuantity = countMatchingFullSizeQuantity(lines, mapping);
    const eligibleQuantity = benefit.freeTravelSizePerFullSize
      ? fullSizeQuantity * quantityLimit
      : quantityLimit;
    const openCategory = Number.isFinite(subtotal) && subtotal >= 3000;
    const variantIds = new Set(mapping.travelSizeVariantIds || []);
    const productTypes = openCategory ? null : new Set(mapping.fullSizeProductTypes || [mapping.category]);

    return buildFreeVariantCandidates(
      lines,
      variantIds,
      Math.min(eligibleQuantity, countMatchingTravelQuantity(lines, variantIds, productTypes)),
      'Free travel-size item',
      productTypes
    );
  });
}

function buildFreeVariantCandidates(lines, variantIds, maxQuantity, message, productTypes = null) {
  if (!(variantIds instanceof Set) || !Number.isFinite(maxQuantity) || maxQuantity <= 0) {
    return [];
  }

  const candidates = [];
  let remainingQuantity = maxQuantity;

  for (const line of lines) {
    if (!variantIds.has(line.variantId) || (productTypes && !productTypes.has(line.productType))) {
      continue;
    }

    const quantity = Math.min(remainingQuantity, Number(line.quantity));

    if (quantity <= 0) {
      continue;
    }

    candidates.push({
      message,
      targets: [
        {
          cartLine: {
            id: line.id,
            quantity,
          },
        },
      ],
      value: {
        percentage: {
          value: '100',
        },
      },
      estimatedSavings: line.unitAmount * quantity,
    });
    remainingQuantity -= quantity;

    if (remainingQuantity <= 0) {
      break;
    }
  }

  return candidates;
}

function countMatchingFullSizeQuantity(lines, mapping) {
  const productTypes = new Set(mapping.fullSizeProductTypes || [mapping.category]);
  const travelSizeVariantIds = new Set(mapping.travelSizeVariantIds || []);

  return lines.reduce((sum, line) => {
    if (travelSizeVariantIds.has(line.variantId)) {
      return sum;
    }

    return productTypes.has(line.productType) ? sum + Number(line.quantity) : sum;
  }, 0);
}

function countMatchingTravelQuantity(lines, variantIds, productTypes) {
  return lines.reduce((sum, line) => {
    if (!variantIds.has(line.variantId) || (productTypes && !productTypes.has(line.productType))) {
      return sum;
    }

    return sum + Number(line.quantity);
  }, 0);
}

function getProductVariantLines(lines = []) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines.flatMap((line) => {
    if (line.merchandise?.__typename !== 'ProductVariant') {
      return [];
    }

    const subtotal = Number(line.cost?.subtotalAmount?.amount);
    const quantity = Number(line.quantity);

    return [{
      id: line.id,
      quantity,
      unitAmount: Number.isFinite(subtotal) && Number.isFinite(quantity) && quantity > 0
        ? subtotal / quantity
        : 0,
      variantId: line.merchandise.id,
      productId: line.merchandise.product?.id,
      productType: line.merchandise.product?.productType,
    }];
  });
}

function getSampleEntitlement(subtotal, entitlements = []) {
  if (!Number.isFinite(subtotal) || !Array.isArray(entitlements)) {
    return 0;
  }

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

function estimateProductSavings(candidates) {
  return candidates.reduce((sum, candidate) => sum + Number(candidate.estimatedSavings || 0), 0);
}

function selectBestBenefit(benefits) {
  return benefits
    .filter((benefit) => benefit && (benefit.orderCandidates.length || benefit.productCandidates.length))
    .sort((left, right) => right.savings - left.savings)[0] || null;
}

function buildResultForBenefit(input, benefit) {
  if (!benefit) {
    return { operations: [] };
  }

  const operations = [];

  if (benefit.orderCandidates.length && input.discount?.discountClasses?.includes(ORDER_DISCOUNT_CLASS)) {
    operations.push({
      orderDiscountsAdd: {
        candidates: benefit.orderCandidates,
        selectionStrategy: 'FIRST',
      },
    });
  }

  if (benefit.productCandidates.length && input.discount?.discountClasses?.includes(PRODUCT_DISCOUNT_CLASS)) {
    operations.push({
      productDiscountsAdd: {
        candidates: benefit.productCandidates.map(({ estimatedSavings, ...candidate }) => candidate),
        selectionStrategy: 'ALL',
      },
    });
  }

  return { operations };
}

function emptyBenefit(code) {
  return {
    code,
    savings: 0,
    orderCandidates: [],
    productCandidates: [],
  };
}

function getTierForSubtotal(subtotal, tiers = []) {
  if (!Number.isFinite(subtotal) || subtotal < 0 || !Array.isArray(tiers)) {
    return null;
  }

  return tiers.find((tier) => {
    const aboveMinimum = subtotal >= Number(tier.minimumSubtotal);
    const belowMaximum = tier.maximumSubtotal === null || subtotal <= Number(tier.maximumSubtotal);
    return aboveMinimum && belowMaximum;
  }) || null;
}
