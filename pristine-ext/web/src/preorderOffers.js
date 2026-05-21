export const PREORDER_OFFER_CONFIG = {
  currencyCode: 'INR',
  metafieldNamespace: '$app',
  metafieldKey: 'function-configuration',
  overrideCodes: {
    freeTravel: 'FREETRAVEL',
  },
  sampleEntitlements: [
    { minimumSubtotal: 0, maximumSubtotal: null, quantity: 1, additionalQuantityPerSubtotal: 1000 },
  ],
  sampleVariantIds: [],
  travelSizeMappings: [],
  cartMutation: {
    required: true,
    reason: 'Shopify Discount Functions can discount eligible cart lines but cannot add or remove cart lines.',
  },
  tiers: [
    {
      code: 'PREORDER25',
      title: 'Preorder 25% off',
      description: '25% off preorder carts below INR 2000',
      minimumSubtotal: 0,
      maximumSubtotal: 1999.99,
      percentage: 25,
    },
    {
      code: 'PREORDER30',
      title: 'Preorder 30% off',
      description: '30% off preorder carts from INR 2000 to INR 2999',
      minimumSubtotal: 2000,
      maximumSubtotal: 2999.99,
      percentage: 30,
    },
    {
      code: 'PREORDER30',
      title: 'Preorder 30% off + travel size',
      description: '30% off preorder carts from INR 3000 to INR 4999 with a free travel size',
      minimumSubtotal: 3000,
      maximumSubtotal: 4999.99,
      percentage: 30,
      freeTravelSizeQuantity: 1,
    },
    {
      code: 'PREORDER40',
      title: 'Preorder 40% off',
      description: '40% off preorder carts from INR 5000',
      minimumSubtotal: 5000,
      maximumSubtotal: null,
      percentage: 40,
      freeTravelSizeQuantity: 1,
      freeFixedItems: [],
    },
  ],
  autoBenefits: [],
  manualOverrides: [
    {
      code: 'FREETRAVEL',
      title: 'Free travel-size override',
      description: 'Manual override for eligible free travel-size benefits',
      type: 'manual_override',
      benefit: {
        freeTravelSizePerFullSize: 1,
      },
    },
  ],
};

export function getPreorderTierForSubtotal(subtotal, config = PREORDER_OFFER_CONFIG) {
  const amount = Number(subtotal);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return config.tiers.find((tier) => {
    const aboveMinimum = amount >= tier.minimumSubtotal;
    const belowMaximum = tier.maximumSubtotal === null || amount <= tier.maximumSubtotal;
    return aboveMinimum && belowMaximum;
  }) || null;
}

export function buildPreorderVisibleCoupons(config = PREORDER_OFFER_CONFIG) {
  const tierCoupons = [];
  const seenCodes = new Set();

  for (const tier of config.tiers) {
    if (seenCodes.has(tier.code)) {
      continue;
    }
    seenCodes.add(tier.code);
    tierCoupons.push({
      code: tier.code,
      title: tier.description,
      discount: `${tier.percentage}% OFF`,
      type: 'preorder_percentage',
      minimumSubtotal: tier.minimumSubtotal,
      maximumSubtotal: tier.maximumSubtotal,
      expiresAt: null,
    });
  }

  return [
    ...tierCoupons,
    ...config.manualOverrides.map((override) => ({
      code: override.code,
      title: override.description,
      discount: override.title,
      type: override.type,
      expiresAt: null,
    })),
  ];
}

export function buildPreorderDiscountSetup(input = {}) {
  return buildPreorderDiscountSetupWithConfig(input);
}

export function buildPreorderDiscountSetupWithConfig({
  functionId,
  startsAt,
  endsAt,
  freeFixedItems = [],
  travelSizeMappings = [],
  sampleRewards = [],
  sampleVariantIds = [],
  autoBenefits = [],
} = {}) {
  if (!functionId) {
    throw new Error('functionId is required');
  }

  const activeStartsAt = startsAt || new Date().toISOString();
  const tiers = PREORDER_OFFER_CONFIG.tiers.map((tier) => ({
    ...tier,
    freeFixedItems: tier.code === 'PREORDER40' ? freeFixedItems : tier.freeFixedItems,
  }));
  const functionConfiguration = {
    version: 1,
    currencyCode: PREORDER_OFFER_CONFIG.currencyCode,
    tiers,
    overrideCodes: PREORDER_OFFER_CONFIG.overrideCodes,
    manualOverrideBenefits: Object.fromEntries(
      PREORDER_OFFER_CONFIG.manualOverrides.map((override) => [override.code, override.benefit || {}])
    ),
    travelSizeMappings,
    sampleEntitlements: PREORDER_OFFER_CONFIG.sampleEntitlements,
    sampleRewards,
    sampleVariantIds,
    autoBenefits,
    cartMutation: PREORDER_OFFER_CONFIG.cartMutation,
  };
  const metafields = [
    {
      namespace: PREORDER_OFFER_CONFIG.metafieldNamespace,
      key: PREORDER_OFFER_CONFIG.metafieldKey,
      type: 'json',
      value: JSON.stringify(functionConfiguration),
    },
  ];
  const base = {
    functionId,
    startsAt: activeStartsAt,
    ...(endsAt ? { endsAt } : {}),
    combinesWith: {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    },
    metafields,
  };

  return {
    automatic: {
      ...base,
      title: 'Pristine Preorder Best Value',
      discountClasses: ['ORDER', 'PRODUCT'],
    },
    codes: buildPreorderVisibleCoupons().map((coupon) => ({
      ...base,
      code: coupon.code,
      title: coupon.title,
      discountClasses: coupon.type === 'manual_override' ? ['PRODUCT'] : ['ORDER', 'PRODUCT'],
      metafields: [
        {
          ...metafields[0],
          value: JSON.stringify({
            ...functionConfiguration,
            mode: coupon.type,
            forcedCode: coupon.code,
          }),
        },
      ],
    })),
  };
}
