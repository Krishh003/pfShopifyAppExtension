export const PREORDER_PORTAL_OFFERS = [
  {
    code: 'PREORDER25',
    title: '25% off preorder carts below INR 2000',
    discount: '25% OFF',
    type: 'preorder_percentage',
    expiresAt: null,
  },
  {
    code: 'PREORDER30',
    title: '30% off preorder carts from INR 2000 to INR 4999',
    discount: '30% OFF',
    type: 'preorder_percentage',
    expiresAt: null,
  },
  {
    code: 'PREORDER40',
    title: '40% off preorder carts from INR 5000',
    discount: '40% OFF',
    type: 'preorder_percentage',
    expiresAt: null,
  },
  {
    code: 'FREETRAVEL',
    title: 'Manual override for eligible free travel-size benefits',
    discount: 'Free travel-size override',
    type: 'manual_override',
    expiresAt: null,
  },
];

export function normalizeCouponOffers(coupons = []) {
  const byCode = new Map();

  for (const coupon of [...PREORDER_PORTAL_OFFERS, ...normalizeArray(coupons)]) {
    if (!coupon?.code) {
      continue;
    }

    const code = String(coupon.code).toUpperCase();

    if (!byCode.has(code)) {
      byCode.set(code, {
        ...coupon,
        code,
      });
    }
  }

  return [...byCode.values()];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [value];
}
