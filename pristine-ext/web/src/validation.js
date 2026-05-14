const CUSTOMER_GID_PREFIX = 'gid://shopify/Customer/';
const ORDER_GID_PREFIX = 'gid://shopify/Order/';

export function assertRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }

  return value;
}

export function assertMoneyAmount(value) {
  assertRequired(value, 'amount');
  const amount = String(value);

  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new ValidationError('amount must be a positive amount with up to two decimals');
  }

  return amount;
}

export function assertCurrencyCode(value) {
  assertRequired(value, 'currencyCode');
  const currencyCode = String(value).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new ValidationError('currencyCode must be a three-letter ISO currency code');
  }

  return currencyCode;
}

export function normalizeCustomerId(customerId) {
  assertRequired(customerId, 'customerId');
  const value = String(customerId);
  return value.startsWith('gid://') ? value : `${CUSTOMER_GID_PREFIX}${value}`;
}

export function normalizeOrderId(orderId) {
  assertRequired(orderId, 'orderId');
  const value = String(orderId);
  return value.startsWith('gid://') ? value : `${ORDER_GID_PREFIX}${value}`;
}

export function assertCouponValue({ percentage, amount, currencyCode }) {
  if (percentage !== undefined) {
    const value = Number(percentage);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      throw new ValidationError('percentage must be greater than 0 and no more than 100');
    }

    return { percentage: value / 100 };
  }

  if (amount !== undefined) {
    return {
      discountAmount: {
        amount: assertMoneyAmount(amount),
        appliesOnEachItem: false,
      },
      currencyCode: assertCurrencyCode(currencyCode),
    };
  }

  throw new ValidationError('percentage or amount is required');
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}
