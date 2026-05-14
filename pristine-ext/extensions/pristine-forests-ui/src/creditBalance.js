export function getDisplayCreditBalance(customer) {
  const storeCreditBalance = getStoreCreditBalance(customer?.storeCreditAccounts?.nodes);

  if (storeCreditBalance) {
    return storeCreditBalance;
  }

  const portalStatus = parseJson(customer?.portal_status?.value);
  const portalBalance = portalStatus?.storeCreditBalance;

  if (portalBalance?.amount) {
    return {
      amount: portalBalance.amount,
      currencyCode: portalBalance.currencyCode || 'INR',
      isMinorUnit: false,
    };
  }

  const legacyValue = customer?.credits?.value || customer?.credits_lower?.value;

  if (legacyValue) {
    return {
      amount: legacyValue,
      currencyCode: 'INR',
      isMinorUnit: !String(legacyValue).includes('.'),
    };
  }

  return {
    amount: '0',
    currencyCode: 'INR',
    isMinorUnit: false,
  };
}

export function formatCreditBalance(balance, locale = 'en-IN') {
  const rawAmount = Number.parseFloat(balance?.amount || '0');
  const amount = balance?.isMinorUnit ? rawAmount / 100 : rawAmount;

  return amount.toLocaleString(locale, {
    style: 'currency',
    currency: balance?.currencyCode || 'INR',
  });
}

function getStoreCreditBalance(accounts = []) {
  const positiveAccounts = accounts
    .map((account) => account?.balance)
    .filter((balance) => Number.parseFloat(balance?.amount || '0') > 0);

  if (positiveAccounts.length > 0) {
    return {
      amount: positiveAccounts[0].amount,
      currencyCode: positiveAccounts[0].currencyCode || 'INR',
      isMinorUnit: false,
    };
  }

  const firstBalance = accounts[0]?.balance;

  if (firstBalance) {
    return {
      amount: firstBalance.amount,
      currencyCode: firstBalance.currencyCode || 'INR',
      isMinorUnit: false,
    };
  }

  return null;
}

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}
