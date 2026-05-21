const refreshButton = document.querySelector('#refreshButton');
const couponForm = document.querySelector('#couponForm');
const couponRows = document.querySelector('#couponRows');
const toast = document.querySelector('#toast');

const loginForm = document.querySelector('#loginForm');
const loginUser = document.querySelector('#loginUser');
const loginPass = document.querySelector('#loginPass');
const logoutButton = document.querySelector('#logoutButton');
const authStatus = document.querySelector('#authStatus');

// Session-based auth: data loaders register here and run only once authenticated.
const adminDataLoaders = [];
let isAuthed = false;
function registerAdminLoader(fn) {
  adminDataLoaders.push(fn);
}

async function refreshAuth() {
  let me = { authenticated: false, loginEnabled: true };
  try {
    const res = await fetch('/api/admin/me', { credentials: 'same-origin' });
    me = await res.json();
  } catch (_) {
    /* backend unreachable */
  }
  applyAuthState(me);
}

function applyAuthState(me) {
  isAuthed = Boolean(me.authenticated);
  if (isAuthed) {
    loginForm.hidden = true;
    logoutButton.hidden = false;
    authStatus.textContent = `Signed in as ${me.user?.username || 'admin'}.`;
    authStatus.classList.add('signed-in');
    adminDataLoaders.forEach((fn) => {
      try { fn(); } catch (_) { /* ignore */ }
    });
  } else {
    loginForm.hidden = false;
    logoutButton.hidden = true;
    authStatus.classList.remove('signed-in');
    authStatus.textContent = me.loginEnabled === false
      ? 'Admin login is not configured on this server.'
      : 'Sign in with your admin credentials.';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    setBusy(loginForm, true);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUser.value, password: loginPass.value }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'Login failed');
    loginPass.value = '';
    showToast('Signed in.');
    await refreshAuth();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(loginForm, false);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (_) {
    /* ignore */
  }
  showToast('Signed out.');
  applyAuthState({ authenticated: false });
});

refreshButton.addEventListener('click', () => {
  if (isAuthed) loadCoupons();
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

registerAdminLoader(loadCoupons);

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

  registerAdminLoader(loadRewards);
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
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    if (response.status === 401 || response.status === 503) {
      applyAuthState({ authenticated: false });
    }
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

// Bulk Import Implementation
if (downloadTemplateButton && dropZone && csvFileInput && csvPreviewModal) {
  // Store valid parsed coupons in a module-level variable
  let parsedCouponsToImport = [];

  // 1. Download Template handler
  downloadTemplateButton.addEventListener('click', () => {
    const headers = 'Code,Title,Discount Type,Value,Starts At,Ends At,Usage Limit,Currency,Status';
    const row1 = 'PRISTINE20,20% Forest Discount,Percentage,20,,2026-12-31T23:59:59Z,,INR,Active';
    const row2 = 'WELCOME100,welcome fixed reduction,Amount,100,,,1,INR,Inactive';
    const csvContent = `${headers}\n${row1}\n${row2}`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'coupon_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded CSV template.');
  });

  // 2. Drag & Drop events
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'dragend', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      csvFileInput.files = files;
      processSelectedCSV(files[0]);
    }
  });

  csvFileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length) {
      processSelectedCSV(files[0]);
    }
  });

  // 3. Close Modal handlers
  const closeModal = () => {
    // Only allow closing if not currently importing
    if (modalImportButton.disabled && importProgressContainer.classList.contains('visible') && !progressStatusText.textContent.includes('complete')) {
      return;
    }
    csvPreviewModal.classList.remove('visible');
    csvFileInput.value = ''; // Reset file input
  };

  modalCloseButton.addEventListener('click', closeModal);
  modalCancelButton.addEventListener('click', closeModal);

  // Close modal when clicking outside container
  csvPreviewModal.addEventListener('click', (e) => {
    if (e.target === csvPreviewModal) {
      closeModal();
    }
  });

  // 4. Handle selecting / dropping CSV
  function processSelectedCSV(file) {
    if (!file.name.endsWith('.csv')) {
      showToast('Please select a valid .csv file.');
      csvFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        parsedCouponsToImport = processCSVData(text);
        renderPreview(parsedCouponsToImport);
      } catch (err) {
        showToast(err.message);
        csvFileInput.value = '';
      }
    };
    reader.onerror = function() {
      showToast('Error reading the CSV file.');
      csvFileInput.value = '';
    };
    reader.readAsText(file);
  }

  // 5. Parse CSV text
  function parseCSV(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentField = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentField.trim());
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        row.push(currentField.trim());
        if (row.length > 0 && row.some(field => field !== '')) {
          lines.push(row);
        }
        row = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (currentField || row.length > 0) {
      row.push(currentField.trim());
      if (row.some(field => field !== '')) {
        lines.push(row);
      }
    }

    return lines;
  }

  // 6. CSV Data Processing & Validation
  function processCSVData(text) {
    const rawRows = parseCSV(text);
    if (rawRows.length < 2) {
      throw new Error('CSV must contain at least a header row and one data row.');
    }

    const headers = rawRows[0].map(h => String(h).trim().toLowerCase());
    const dataRows = rawRows.slice(1);

    const colIndex = {
      code: headers.indexOf('code'),
      title: headers.indexOf('title'),
      discountType: headers.indexOf('discount type'),
      value: headers.indexOf('value'),
      startsAt: headers.indexOf('starts at'),
      endsAt: headers.indexOf('ends at'),
      usageLimit: headers.indexOf('usage limit'),
      currency: headers.indexOf('currency'),
      status: headers.indexOf('status')
    };

    if (colIndex.code === -1 || colIndex.title === -1 || colIndex.discountType === -1 || colIndex.value === -1) {
      throw new Error('CSV missing required columns: "Code", "Title", "Discount Type", "Value".');
    }

    return dataRows.map((row, index) => {
      const getVal = (colName) => {
        const idx = colIndex[colName];
        return idx !== -1 && idx < row.length ? String(row[idx]).trim() : '';
      };

      const code = getVal('code').toUpperCase();
      const title = getVal('title');
      const discountTypeRaw = getVal('discountType').toLowerCase();
      const valueRaw = getVal('value');
      const startsAtRaw = getVal('startsAt');
      const endsAtRaw = getVal('endsAt');
      const usageLimitRaw = getVal('usageLimit');
      const currency = getVal('currency').toUpperCase() || 'INR';
      const statusRaw = getVal('status').toLowerCase();

      const errors = [];
      
      if (!code) errors.push('Code is required.');
      if (!title) errors.push('Title is required.');
      
      let discountType = 'percentage';
      if (discountTypeRaw === 'amount' || discountTypeRaw === 'fixed' || discountTypeRaw === 'fixed amount') {
        discountType = 'amount';
      } else if (discountTypeRaw === 'percentage' || discountTypeRaw === 'percent') {
        discountType = 'percentage';
      } else {
        errors.push('Discount Type must be "Percentage" or "Amount".');
      }

      const value = Number(valueRaw);
      if (isNaN(value) || value <= 0) {
        errors.push('Value must be a positive number.');
      }

      let startsAt = null;
      if (startsAtRaw) {
        const parsedStart = new Date(startsAtRaw);
        if (isNaN(parsedStart.getTime())) {
          errors.push('Starts At must be a valid ISO date.');
        } else {
          startsAt = parsedStart.toISOString();
        }
      }

      let endsAt = null;
      if (endsAtRaw) {
        const parsedEnd = new Date(endsAtRaw);
        if (isNaN(parsedEnd.getTime())) {
          errors.push('Ends At must be a valid ISO date.');
        } else {
          endsAt = parsedEnd.toISOString();
        }
      }

      let usageLimit = null;
      if (usageLimitRaw) {
        const parsedLimit = Number(usageLimitRaw);
        if (isNaN(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit <= 0) {
          errors.push('Usage Limit must be a positive integer.');
        } else {
          usageLimit = parsedLimit;
        }
      }

      let status = 'active';
      if (statusRaw === 'inactive' || statusRaw === 'disabled' || statusRaw === 'false') {
        status = 'inactive';
      }

      return {
        index: index + 2,
        code,
        title,
        discountType,
        value,
        startsAt,
        endsAt,
        usageLimit,
        currency,
        status,
        isValid: errors.length === 0,
        errorMsg: errors.join(' ')
      };
    });
  }

  // 7. Render Preview
  function renderPreview(coupons) {
    previewRows.innerHTML = '';
    importProgressContainer.classList.remove('visible');
    importLog.innerHTML = '';
    importProgressBar.style.width = '0%';
    progressPercentText.textContent = '0%';

    const validCount = coupons.filter(c => c.isValid).length;
    const invalidCount = coupons.length - validCount;

    modalSummaryText.innerHTML = `Found <strong>${coupons.length}</strong> coupons in CSV. <span style="color: var(--forest); font-weight: 700;">${validCount} valid</span>, <span style="color: var(--critical); font-weight: 700;">${invalidCount} invalid</span>.`;

    coupons.forEach(coupon => {
      const row = document.createElement('tr');
      
      const typeLabel = coupon.discountType === 'percentage' ? 'Percentage' : `Fixed (${coupon.currency})`;
      const valLabel = coupon.discountType === 'percentage' ? `${coupon.value}%` : `${coupon.value} ${coupon.currency}`;
      
      const statusBadge = coupon.status === 'active' 
        ? `<span class="badge success">Active</span>` 
        : `<span class="badge warning">Inactive</span>`;
      
      const validationBadge = coupon.isValid 
        ? `<span class="badge success">✓ Valid</span>` 
        : `<span class="badge danger" title="${escapeHtml(coupon.errorMsg)}">✗ Invalid</span>`;

      row.innerHTML = `
        <td><span class="code">${escapeHtml(coupon.code || '')}</span></td>
        <td>${escapeHtml(coupon.title || '')}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${escapeHtml(valLabel)}</td>
        <td>${statusBadge}</td>
        <td>${validationBadge}</td>
      `;

      previewRows.appendChild(row);
    });

    // Toggle actions based on validity
    modalImportButton.disabled = validCount === 0;
    modalImportButton.textContent = `Confirm & Import (${validCount})`;
    modalCancelButton.disabled = false;
    modalCloseButton.style.display = 'block';

    // Show modal
    csvPreviewModal.classList.add('visible');
  }

  // 8. Confirm & Import batch handler
  let finishCloseHandler = null;
  modalImportButton.addEventListener('click', async () => {
    if (modalImportButton.textContent === 'Close') {
      csvPreviewModal.classList.remove('visible');
      csvFileInput.value = '';
      modalImportButton.textContent = 'Confirm & Import';
      return;
    }

    const validCoupons = parsedCouponsToImport.filter(c => c.isValid);
    if (!validCoupons.length) return;

    // Transition UI to busy importing state
    modalImportButton.disabled = true;
    modalCancelButton.disabled = true;
    modalCloseButton.style.display = 'none';
    importProgressContainer.classList.add('visible');
    
    progressStatusText.textContent = 'Starting import...';
    importLog.innerHTML = '';

    let successCount = 0;
    let failCount = 0;
    const total = validCoupons.length;

    for (let i = 0; i < total; i++) {
      const coupon = validCoupons[i];
      const percent = Math.round(((i) / total) * 100);
      
      progressStatusText.textContent = `Creating ${coupon.code} (${i + 1}/${total})...`;
      importProgressBar.style.width = `${percent}%`;
      progressPercentText.textContent = `${percent}%`;

      const logRow = document.createElement('div');
      logRow.style.padding = '2px 0';
      logRow.textContent = `[${i + 1}/${total}] Creating ${coupon.code}... `;
      importLog.appendChild(logRow);
      importLog.scrollTop = importLog.scrollHeight;

      // Construct request payload
      const payload = {
        title: coupon.title.trim(),
        code: coupon.code.trim().toUpperCase(),
        usageLimit: coupon.usageLimit,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
      };

      if (coupon.discountType === 'amount') {
        payload.amount = String(coupon.value).trim();
        payload.currencyCode = coupon.currency.trim().toUpperCase();
      } else {
        payload.percentage = Number(coupon.value);
      }

      try {
        // 1. Create discount code
        const created = await apiRequest('/api/coupons/create', {
          method: 'POST',
          body: JSON.stringify(compact(payload)),
        });

        // 2. Disable coupon if inactive in CSV
        if (coupon.status === 'inactive' && created.discount?.id) {
          await apiRequest(`/api/coupons/${encodeURIComponent(created.discount.id)}/disable`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
        }

        successCount++;
        logRow.innerHTML = `<span style="color: var(--forest); font-weight: 700;">✓ ${coupon.code} created successfully.</span>`;
      } catch (err) {
        failCount++;
        logRow.innerHTML = `<span style="color: var(--critical); font-weight: 700;">✗ ${coupon.code} failed: ${escapeHtml(err.message)}</span>`;
      }
    }

    // Finished
    importProgressBar.style.width = '100%';
    progressPercentText.textContent = '100%';
    progressStatusText.innerHTML = `<strong>Import complete!</strong> ${successCount} imported successfully, ${failCount} failed.`;
    
    // Enable close actions
    modalImportButton.textContent = 'Close';
    modalImportButton.disabled = false;
    modalCancelButton.disabled = false;
    modalCloseButton.style.display = 'block';

    showToast(`Bulk import finished: ${successCount} succeeded, ${failCount} failed.`);
    await loadCoupons();
  });
}

// Preorder freebies & tiers configuration panel
const publishPreorderButton = document.querySelector('#publishPreorderButton');

if (publishPreorderButton) {
  const reloadPreorderButton = document.querySelector('#reloadPreorderButton');
  const preorderPanel = document.querySelector('.preorder-config-panel');
  const preorderState = {
    tiers: [],
    sampleEntitlements: [],
    sampleCategoryMappings: [],
    travelSizeMappings: [],
    freeFixedItems: [],
  };

  const el = (id) => document.querySelector(id);
  const numOrNull = (value) => {
    const text = String(value ?? '').trim();
    if (text === '') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  };
  const parseCsvList = (value) => String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parseIdList = (value) => parseCsvList(value)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  function renderConfigTables() {
    el('#tierRows').innerHTML = preorderState.tiers.length
      ? preorderState.tiers.map((tier, index) => `
        <tr>
          <td><span class="code">${escapeHtml(tier.code || '')}</span></td>
          <td>${escapeHtml(String(tier.minimumSubtotal ?? 0))}</td>
          <td>${escapeHtml(tier.maximumSubtotal === null || tier.maximumSubtotal === undefined ? 'No max' : String(tier.maximumSubtotal))}</td>
          <td>${escapeHtml(tier.percentage === undefined || tier.percentage === null ? '—' : `${tier.percentage}%`)}</td>
          <td>${escapeHtml(String(tier.freeTravelSizeQuantity || 0))}</td>
          <td><button type="button" class="delete-reward delete-config" data-section="tiers" data-index="${index}">Remove</button></td>
        </tr>`).join('')
      : '<tr><td colspan="6">No tiers configured.</td></tr>';

    el('#entRows').innerHTML = preorderState.sampleEntitlements.length
      ? preorderState.sampleEntitlements.map((entry, index) => `
        <tr>
          <td>${escapeHtml(String(entry.minimumSubtotal ?? 0))}</td>
          <td>${escapeHtml(entry.maximumSubtotal === null || entry.maximumSubtotal === undefined ? 'No max' : String(entry.maximumSubtotal))}</td>
          <td>${escapeHtml(String(entry.quantity ?? 0))}</td>
          <td>${escapeHtml(String(entry.additionalQuantityPerSubtotal || '—'))}</td>
          <td><button type="button" class="delete-reward delete-config" data-section="sampleEntitlements" data-index="${index}">Remove</button></td>
        </tr>`).join('')
      : '<tr><td colspan="5">No rows configured.</td></tr>';

    el('#sampleCatRows').innerHTML = preorderState.sampleCategoryMappings.length
      ? preorderState.sampleCategoryMappings.map((mapping, index) => `
        <tr>
          <td>${escapeHtml((mapping.fullSizeProductTypes || []).join(', '))}</td>
          <td><span class="code">${escapeHtml(String(mapping.sampleVariantId))}</span></td>
          <td><button type="button" class="delete-reward delete-config" data-section="sampleCategoryMappings" data-index="${index}">Remove</button></td>
        </tr>`).join('')
      : '<tr><td colspan="3">No mappings configured.</td></tr>';

    el('#travelRows').innerHTML = preorderState.travelSizeMappings.length
      ? preorderState.travelSizeMappings.map((mapping, index) => `
        <tr>
          <td>${escapeHtml(mapping.category || '')}</td>
          <td>${escapeHtml((mapping.fullSizeProductTypes || []).join(', '))}</td>
          <td><span class="code">${escapeHtml((mapping.travelSizeVariantIds || []).join(', '))}</span></td>
          <td><button type="button" class="delete-reward delete-config" data-section="travelSizeMappings" data-index="${index}">Remove</button></td>
        </tr>`).join('')
      : '<tr><td colspan="4">No mappings configured.</td></tr>';

    el('#oilRows').innerHTML = preorderState.freeFixedItems.length
      ? preorderState.freeFixedItems.map((item, index) => `
        <tr>
          <td><span class="code">${escapeHtml(String(item.variantId))}</span></td>
          <td>${escapeHtml(String(item.quantity ?? 1))}</td>
          <td><button type="button" class="delete-reward delete-config" data-section="freeFixedItems" data-index="${index}">Remove</button></td>
        </tr>`).join('')
      : '<tr><td colspan="3">No oils configured.</td></tr>';
  }

  el('#addTierButton').addEventListener('click', () => {
    const code = String(el('#tierCode').value || '').trim().toUpperCase();
    if (!code) return showToast('Tier code required.');
    const min = numOrNull(el('#tierMin').value) ?? 0;
    const max = numOrNull(el('#tierMax').value);
    if (max !== null && max < min) return showToast('Max cannot be below min.');
    const pct = numOrNull(el('#tierPct').value);
    const travel = numOrNull(el('#tierTravel').value);
    const tier = { code, minimumSubtotal: min, maximumSubtotal: max };
    if (pct !== null) tier.percentage = pct;
    if (travel && travel > 0) tier.freeTravelSizeQuantity = travel;
    preorderState.tiers.push(tier);
    preorderState.tiers.sort((a, b) => (a.minimumSubtotal || 0) - (b.minimumSubtotal || 0));
    renderConfigTables();
    el('#tierCode').value = '';
    el('#tierPct').value = '';
    el('#tierTravel').value = '';
  });

  el('#addEntButton').addEventListener('click', () => {
    const min = numOrNull(el('#entMin').value) ?? 0;
    const max = numOrNull(el('#entMax').value);
    const qty = numOrNull(el('#entQty').value);
    if (qty === null || qty < 0) return showToast('Base qty required.');
    const step = numOrNull(el('#entStep').value);
    const entry = { minimumSubtotal: min, maximumSubtotal: max, quantity: qty };
    if (step && step > 0) entry.additionalQuantityPerSubtotal = step;
    preorderState.sampleEntitlements.push(entry);
    preorderState.sampleEntitlements.sort((a, b) => (a.minimumSubtotal || 0) - (b.minimumSubtotal || 0));
    renderConfigTables();
  });

  el('#addSampleCatButton').addEventListener('click', () => {
    const types = parseCsvList(el('#scTypes').value);
    const variantId = numOrNull(el('#scVariant').value);
    if (!types.length) return showToast('At least one product type required.');
    if (!variantId || variantId <= 0) return showToast('Sample variant ID required.');
    preorderState.sampleCategoryMappings.push({ fullSizeProductTypes: types, sampleVariantId: variantId });
    renderConfigTables();
    el('#scTypes').value = '';
    el('#scVariant').value = '';
  });

  el('#addTravelButton').addEventListener('click', () => {
    const category = String(el('#tvCategory').value || '').trim();
    const types = parseCsvList(el('#tvTypes').value);
    const variants = parseIdList(el('#tvVariants').value);
    if (!category) return showToast('Category label required.');
    if (!variants.length) return showToast('At least one travel variant ID required.');
    preorderState.travelSizeMappings.push({ category, fullSizeProductTypes: types, travelSizeVariantIds: variants });
    renderConfigTables();
    el('#tvCategory').value = '';
    el('#tvTypes').value = '';
    el('#tvVariants').value = '';
  });

  el('#addOilButton').addEventListener('click', () => {
    const variantId = numOrNull(el('#oilVariant').value);
    const qty = numOrNull(el('#oilQty').value) ?? 1;
    if (!variantId || variantId <= 0) return showToast('Oil variant ID required.');
    preorderState.freeFixedItems.push({ variantId, quantity: qty > 0 ? qty : 1 });
    renderConfigTables();
    el('#oilVariant').value = '';
    el('#oilQty').value = '1';
  });

  preorderPanel.addEventListener('click', (event) => {
    const button = event.target.closest('button.delete-config');
    if (!button) return;
    const section = button.dataset.section;
    const index = Number(button.dataset.index);
    if (!preorderState[section] || !Number.isFinite(index)) return;
    preorderState[section] = preorderState[section].filter((_, i) => i !== index);
    renderConfigTables();
  });

  publishPreorderButton.addEventListener('click', async () => {
    try {
      publishPreorderButton.disabled = true;
      const result = await apiRequest('/api/preorder/config', {
        method: 'POST',
        body: JSON.stringify({
          tiers: preorderState.tiers,
          sampleEntitlements: preorderState.sampleEntitlements,
          sampleCategoryMappings: preorderState.sampleCategoryMappings,
          travelSizeMappings: preorderState.travelSizeMappings,
          freeFixedItems: preorderState.freeFixedItems,
        }),
      });
      applyPreorderConfig(result?.config);
      const count = (result?.updatedDiscounts || []).length;
      showToast(`Preorder config published. Updated ${count} discount${count === 1 ? '' : 's'}.`);
    } catch (error) {
      showToast(error.message);
    } finally {
      publishPreorderButton.disabled = false;
    }
  });

  reloadPreorderButton.addEventListener('click', () => loadPreorderConfig());

  function applyPreorderConfig(config) {
    const cfg = config || {};
    preorderState.tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
    preorderState.sampleEntitlements = Array.isArray(cfg.sampleEntitlements) ? cfg.sampleEntitlements : [];
    preorderState.sampleCategoryMappings = Array.isArray(cfg.sampleCategoryMappings) ? cfg.sampleCategoryMappings : [];
    preorderState.travelSizeMappings = Array.isArray(cfg.travelSizeMappings) ? cfg.travelSizeMappings : [];
    preorderState.freeFixedItems = Array.isArray(cfg.freeFixedItems) ? cfg.freeFixedItems : [];
    renderConfigTables();
  }

  async function loadPreorderConfig() {
    try {
      const payload = await apiRequest('/api/preorder/config');
      applyPreorderConfig(payload?.config);
    } catch (error) {
      showToast(error.message);
      renderConfigTables();
    }
  }

  registerAdminLoader(loadPreorderConfig);
}

// Kick off auth check last so all loaders are registered before it may run them.
refreshAuth();
