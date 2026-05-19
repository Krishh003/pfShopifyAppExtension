const tokenInput = document.querySelector('#tokenInput');
const saveTokenButton = document.querySelector('#saveTokenButton');
const refreshButton = document.querySelector('#refreshButton');
const couponForm = document.querySelector('#couponForm');
const couponRows = document.querySelector('#couponRows');
const toast = document.querySelector('#toast');

const tokenStorageKey = 'pristine.internalApiToken';

tokenInput.value = localStorage.getItem(tokenStorageKey) || '';

saveTokenButton.addEventListener('click', () => {
  localStorage.setItem(tokenStorageKey, tokenInput.value.trim());
  showToast('Token saved for this browser.');
  loadCoupons();
});

refreshButton.addEventListener('click', () => {
  loadCoupons();
});

couponForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(couponForm);
  const discountType = formData.get('discountType');
  const payload = {
    title: String(formData.get('title')).trim(),
    code: String(formData.get('code')).trim().toUpperCase(),
    usageLimit: numberOrNull(formData.get('usageLimit')),
    startsAt: dateTimeOrNull(formData.get('startsAt')),
    endsAt: dateTimeOrNull(formData.get('endsAt')),
  };

  if (discountType === 'amount') {
    payload.amount = String(formData.get('value')).trim();
    payload.currencyCode = String(formData.get('currencyCode') || 'INR').trim().toUpperCase();
  } else {
    payload.percentage = Number(formData.get('value'));
  }

  try {
    setBusy(couponForm, true);
    const created = await apiRequest('/api/coupons/create', {
      method: 'POST',
      body: JSON.stringify(compact(payload)),
    });

    if (!formData.get('createActive') && created.discount?.id) {
      await apiRequest(`/api/coupons/${encodeURIComponent(created.discount.id)}/disable`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    }

    couponForm.reset();
    couponForm.elements.currencyCode.value = 'INR';
    couponForm.elements.createActive.checked = true;
    showToast('Coupon created.');
    await loadCoupons();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(couponForm, false);
  }
});

couponRows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const discountId = button.dataset.discountId;

  try {
    button.disabled = true;
    await apiRequest(`/api/coupons/${encodeURIComponent(discountId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    showToast(action === 'enable' ? 'Coupon enabled.' : 'Coupon disabled.');
    await loadCoupons();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

loadCoupons();

const rewardRows = document.querySelector('#rewardRows');
const rewardForm = document.querySelector('#rewardForm');
const saveRewardsButton = document.querySelector('#saveRewardsButton');
const reloadRewardsButton = document.querySelector('#reloadRewardsButton');

let currentRewards = [];

if (rewardForm && rewardRows && saveRewardsButton && reloadRewardsButton) {
  rewardForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(rewardForm);
    const maxRaw = String(formData.get('maximumSubtotal') || '').trim();
    const reward = {
      minimumSubtotal: Number(formData.get('minimumSubtotal') || 0),
      maximumSubtotal: maxRaw === '' ? null : Number(maxRaw),
      variantId: Number(formData.get('variantId') || 0),
      quantity: Number(formData.get('quantity') || 1),
      label: String(formData.get('label') || '').trim(),
    };
    if (!Number.isFinite(reward.variantId) || reward.variantId <= 0) {
      showToast('Variant ID required.');
      return;
    }
    if (reward.maximumSubtotal !== null && reward.maximumSubtotal < reward.minimumSubtotal) {
      showToast('Maximum subtotal cannot be lower than minimum.');
      return;
    }
    currentRewards = sortRewards([...currentRewards, reward]);
    renderRewards(currentRewards);
    rewardForm.reset();
    rewardForm.elements.minimumSubtotal.value = '0';
    rewardForm.elements.quantity.value = '1';
    showToast('Tier staged. Click "Save all tiers" to publish.');
  });

  rewardRows.addEventListener('click', (event) => {
    const button = event.target.closest('button.delete-reward');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isFinite(index)) return;
    currentRewards = currentRewards.filter((_, i) => i !== index);
    renderRewards(currentRewards);
    showToast('Tier removed. Click "Save all tiers" to publish.');
  });

  saveRewardsButton.addEventListener('click', async () => {
    try {
      setBusy(rewardForm, true);
      saveRewardsButton.disabled = true;
      const payload = { sampleRewards: currentRewards };
      const result = await apiRequest('/api/preorder-cart/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      currentRewards = sortRewards(result?.config?.sampleRewards || []);
      renderRewards(currentRewards);
      showToast('Auto-add tiers saved.');
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusy(rewardForm, false);
      saveRewardsButton.disabled = false;
    }
  });

  reloadRewardsButton.addEventListener('click', () => loadRewards());

  loadRewards();
}

async function loadRewards() {
  try {
    rewardRows.innerHTML = '<tr><td colspan="6">Loading rewards...</td></tr>';
    const payload = await apiRequest('/api/preorder-cart/config?refresh=1');
    currentRewards = sortRewards(payload?.config?.sampleRewards || []);
    renderRewards(currentRewards);
  } catch (error) {
    rewardRows.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderRewards(rewards) {
  if (!rewards.length) {
    rewardRows.innerHTML = '<tr><td colspan="6">No tiers configured. Add one below.</td></tr>';
    return;
  }
  rewardRows.innerHTML = rewards.map((reward, index) => {
    const max = reward.maximumSubtotal === null || reward.maximumSubtotal === undefined
      ? 'No max'
      : String(reward.maximumSubtotal);
    return `
      <tr>
        <td>${escapeHtml(String(reward.minimumSubtotal ?? 0))}</td>
        <td>${escapeHtml(max)}</td>
        <td><span class="code">${escapeHtml(String(reward.variantId))}</span></td>
        <td>${escapeHtml(String(reward.quantity ?? 1))}</td>
        <td>${escapeHtml(reward.label || '')}</td>
        <td><button type="button" class="delete-reward" data-index="${index}">Remove</button></td>
      </tr>
    `;
  }).join('');
}

function sortRewards(rewards) {
  return [...rewards].sort((a, b) => Number(a.minimumSubtotal || 0) - Number(b.minimumSubtotal || 0));
}

async function loadCoupons() {
  try {
    couponRows.innerHTML = '<tr><td colspan="5">Loading coupons...</td></tr>';
    const payload = await apiRequest('/api/coupons?first=50');
    renderCoupons(payload.discounts || []);
  } catch (error) {
    couponRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderCoupons(discounts) {
  if (!discounts.length) {
    couponRows.innerHTML = '<tr><td colspan="5">No coupon codes found.</td></tr>';
    return;
  }

  couponRows.innerHTML = discounts.map((discount) => {
    const status = String(discount.status || 'UNKNOWN').toLowerCase();
    const action = status === 'active' ? 'disable' : 'enable';
    const actionLabel = status === 'active' ? 'Disable' : 'Enable';

    return `
      <tr>
        <td><span class="code">${escapeHtml(discount.code || 'No code')}</span></td>
        <td>
          <strong>${escapeHtml(discount.title || 'Untitled')}</strong>
          <div>${escapeHtml(discount.summary || '')}</div>
        </td>
        <td><span class="status ${escapeHtml(status)}">${escapeHtml(discount.status || 'UNKNOWN')}</span></td>
        <td>${formatDateRange(discount.startsAt, discount.endsAt)}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-action="${action}" data-discount-id="${escapeHtml(discount.id)}">
              ${actionLabel}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function apiRequest(path, options = {}) {
  const token = tokenInput.value.trim() || localStorage.getItem(tokenStorageKey) || '';
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Pristine-Internal-Token': token } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
  }

  return payload;
}

function setBusy(container, isBusy) {
  for (const element of container.querySelectorAll('button, input, select')) {
    element.disabled = isBusy;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 3200);
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
  );
}

function dateTimeOrNull(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function numberOrNull(value) {
  if (!value) {
    return null;
  }

  return Number(value);
}

function formatDateRange(startsAt, endsAt) {
  const start = startsAt ? new Date(startsAt).toLocaleDateString() : 'Now';
  const end = endsAt ? new Date(endsAt).toLocaleDateString() : 'No end';
  return `${escapeHtml(start)} to ${escapeHtml(end)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
