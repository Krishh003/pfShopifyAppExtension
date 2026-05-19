(function () {
  const DEFAULT_OPTIONS = {
    planUrl: '/api/preorder-cart/plan',
    cartRoot: window.Shopify?.routes?.root || '/',
    once: false,
  };
  const SCRIPT_VERSION = 'gift-card-instant-20260518-v9';
  const CART_MUTATION_PATHS = ['/cart/add.js', '/cart/change.js', '/cart/update.js', '/cart/clear.js'];
  const CART_MUTATION_REGEX = /\/cart\/(add|change|update|clear)(\.js)?$/;
  const SETTLE_DELAYS = [100, 250, 500, 1000, 2000];
  const FINAL_REFRESH_DELAY = 400;
  const STABLE_CONFIRMATIONS_AFTER_CHANGE = 2;
  let observedCartMutations = false;
  let reconciliationTimer = null;
  let reconcileAgain = false;
  let currentSettlePromise = null;
  let activeSettings = null;
  let pristineAddInflight = 0;

  async function reconcile(options) {
    const settings = { ...DEFAULT_OPTIONS, ...(options || {}) };
    if (pristineAddInflight > 0 && !options?.allowDuringInflight) {
      return { changed: false, plan: null };
    }
    const cart = await getJson(joinCartUrl(settings.cartRoot, 'cart.js'));
    if (pristineAddInflight > 0 && !options?.allowDuringInflight) {
      return { changed: false, plan: null };
    }
    const planResponse = await postJson(settings.planUrl, { cart });
    if (pristineAddInflight > 0 && !options?.allowDuringInflight) {
      return { changed: false, plan: null };
    }
    const plan = planResponse.plan || { adds: [], changes: [] };
    let changed = false;
    let lastSections = null;

    const removals = (plan.changes || []).filter((change) => Number(change.quantity) === 0);
    const nonRemovalChanges = (plan.changes || []).filter((change) => Number(change.quantity) !== 0);
    const sectionIds = getCartSectionIds();
    const sectionsList = sectionIds.length ? sectionIds : null;
    const sectionsUrl = window.location.pathname;

    if (removals.length) {
      const removeResp = await postJson(joinCartUrl(settings.cartRoot, 'cart/update.js'), {
        updates: Object.fromEntries(removals.map((change) => [change.id, 0])),
        ...(sectionsList ? { sections: sectionsList, sections_url: sectionsUrl } : {}),
      });
      if (removeResp?.sections) lastSections = removeResp.sections;
      changed = true;
    }

    for (const change of nonRemovalChanges) {
      const changeResp = await postJson(joinCartUrl(settings.cartRoot, 'cart/change.js'), {
        ...change,
        ...(sectionsList ? { sections: sectionsList, sections_url: sectionsUrl } : {}),
      });
      if (changeResp?.sections) lastSections = changeResp.sections;
      changed = true;
    }

    for (const add of plan.adds || []) {
      const addResp = await postJson(joinCartUrl(settings.cartRoot, 'cart/add.js'), {
        ...add,
        ...(sectionsList ? { sections: sectionsList, sections_url: sectionsUrl } : {}),
      });
      if (addResp?.sections) lastSections = addResp.sections;
      changed = true;
    }

    if (changed) {
      if (lastSections && options?.renderSections !== false) {
        try { await renderCartSections(lastSections); } catch (_) { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('pristine:preorder-cart:updated', { detail: { plan } }));
    }

    return { changed, plan };
  }

  async function addProductWithRewards(formData, options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...(activeSettings || {}), ...(options || {}) };
    const mainItem = buildCartAddItemFromFormData(formData);

    if (!mainItem) {
      return { response: null, rendered: false, changed: false };
    }

    applyOptimisticOpen();

    pristineAddInflight += 1;
    let releaseInBackground = false;

    if (currentSettlePromise) {
      try { await currentSettlePromise; } catch (_) { /* ignore */ }
    }

    const releaseAndSettle = () => {
      pristineAddInflight = Math.max(0, pristineAddInflight - 1);
      clearOptimisticOverlay();
      reconcile(settings).then((result) => {
        if (result?.changed) {
          refreshCartSurface(settings).catch((refreshErr) => {
            console.warn('[PristinePreorderCart] post-reconcile refresh failed', refreshErr);
          });
        }
      }).catch((err) => {
        console.warn('[PristinePreorderCart] post-add reconcile failed', err);
      });
    };

    try {
      const currentCart = await getJson(joinCartUrl(settings.cartRoot, 'cart.js'));
      const projectedCart = buildProjectedCart(currentCart, mainItem, options);
      const planResponse = await postJson(settings.planUrl, { cart: projectedCart });
      const plan = planResponse.plan || { adds: [], changes: [] };
      const changed = Boolean((plan.adds || []).length || (plan.changes || []).length);
      const removals = (plan.changes || []).filter((change) => Number(change.quantity) === 0);
      const nonRemovalChanges = (plan.changes || []).filter((change) => Number(change.quantity) !== 0);
      const addUrl = joinCartUrl(settings.cartRoot, 'cart/add.js');
      const updateUrl = joinCartUrl(settings.cartRoot, 'cart/update.js');
      const changeUrl = joinCartUrl(settings.cartRoot, 'cart/change.js');

      const hasSellingPlan = Boolean(
        mainItem.selling_plan || (plan.adds || []).some((add) => add.selling_plan),
      );

      if (removals.length) {
        try {
          await postJson(updateUrl, {
            updates: Object.fromEntries(removals.map((change) => [change.id, 0])),
          });
        } catch (removeErr) {
          console.warn('[PristinePreorderCart] removal failed, will reconcile', removeErr);
        }
      }

      for (const change of nonRemovalChanges) {
        try {
          await postJson(changeUrl, change);
        } catch (changeErr) {
          console.warn('[PristinePreorderCart] change failed, will reconcile', changeErr);
        }
      }

      let response;
      let renderedSections = false;

      if (!hasSellingPlan && (plan.adds || []).length) {
        try {
          response = await postJson(addUrl, {
            items: [mainItem, ...plan.adds],
            sections: getCartSectionIds(),
            sections_url: window.location.pathname,
          });

          if (response?.sections) {
            await renderCartSections(response.sections);
            renderedSections = true;
          }
          return { response, rendered: true, changed: true };
        } catch (error) {
          console.warn('[PristinePreorderCart] bundled add failed, falling back to sequential', error);
        }
      }

      try {
        response = await postJson(addUrl, {
          ...mainItem,
          sections: getCartSectionIds(),
          sections_url: window.location.pathname,
        });
      } catch (paidErr) {
        console.error('[PristinePreorderCart] paid item add failed', paidErr);
        throw paidErr;
      }

      if (response?.sections) {
        await renderCartSections(response.sections);
        renderedSections = true;
      }

      if ((plan.adds || []).length) {
        releaseInBackground = true;
        const localResponse = response;
        (async () => {
          try {
            for (const add of plan.adds) {
              try {
                await postJson(addUrl, add);
              } catch (rewardErr) {
                console.warn('[PristinePreorderCart] reward add failed, will reconcile', rewardErr);
              }
            }
            try {
              await refreshCartSurface(settings);
            } catch (refreshErr) {
              console.warn('[PristinePreorderCart] refreshCartSurface failed', refreshErr);
            }
          } finally {
            releaseAndSettle();
          }
        })();

        return { response: localResponse, rendered: true, changed: true };
      }

      return { response, rendered: renderedSections, changed };
    } finally {
      if (!releaseInBackground) {
        releaseAndSettle();
      }
    }
  }

  function init(options) {
    const settings = { ...DEFAULT_OPTIONS, ...(options || {}) };
    activeSettings = settings;
    const run = () => settleCart(settings).catch((error) => {
      window.dispatchEvent(new CustomEvent('pristine:preorder-cart:error', { detail: { error } }));
    });
    const scheduleRun = () => {
      if (pristineAddInflight > 0) return;
      window.clearTimeout(reconciliationTimer);
      reconciliationTimer = window.setTimeout(run, 250);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }

    if (!settings.once) {
      window.addEventListener('pristine:cart:changed', run);
      observeCartMutations(scheduleRun);
    }
  }

  async function settleCart(options) {
    const settings = { ...DEFAULT_OPTIONS, ...(activeSettings || {}), ...(options || {}) };

    if (currentSettlePromise && !settings.force) {
      reconcileAgain = true;
      return currentSettlePromise;
    }

    if (currentSettlePromise && settings.force) {
      reconcileAgain = true;
      await currentSettlePromise;
    }

    currentSettlePromise = runSettleCart(settings).finally(() => {
      currentSettlePromise = null;
    });

    return currentSettlePromise;
  }

  async function runSettleCart(settings) {
    let changed = false;
    let lastPlan = null;

    do {
      reconcileAgain = false;
      let stableConfirmationsAfterChange = 0;

      for (const delay of SETTLE_DELAYS) {
        await wait(delay);
        if (pristineAddInflight > 0) return { changed, plan: lastPlan };
        const result = await reconcile(settings);
        changed = changed || result.changed;
        lastPlan = result.plan;

        if (result.changed) {
          stableConfirmationsAfterChange = 0;
          continue;
        }

        if (!changed) {
          break;
        }

        stableConfirmationsAfterChange += 1;
        if (stableConfirmationsAfterChange >= STABLE_CONFIRMATIONS_AFTER_CHANGE && !reconcileAgain) {
          break;
        }
      }
    } while (reconcileAgain && pristineAddInflight === 0);

    if (changed && pristineAddInflight === 0) {
      await wait(FINAL_REFRESH_DELAY);
      await refreshCartSurface(settings);
    }

    return { changed, plan: lastPlan };
  }

  async function getJson(url) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${response.status}`);
    }

    return response.json();
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${url} failed with ${response.status}`);
    }

    return response.json();
  }

  function observeCartMutations(callback) {
    if (observedCartMutations) {
      return;
    }

    observedCartMutations = true;
    observeFetchCartMutations(callback);
    observeXhrCartMutations(callback);
  }

  function observeFetchCartMutations(callback) {
    if (typeof window.fetch !== 'function') {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const isCartMut = isCartMutationUrl(args[0]);

      try {
        const response = await originalFetch(...args);

        if (isCartMut) {
          if (response.ok) {
            callback();
          } else {
            window.setTimeout(callback, 1500);
          }
        }

        return response;
      } catch (err) {
        if (isCartMut) {
          window.setTimeout(callback, 1500);
        }
        throw err;
      }
    };
  }

  function observeXhrCartMutations(callback) {
    if (typeof window.XMLHttpRequest !== 'function') {
      return;
    }

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
      this.__pristinePreorderCartUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    window.XMLHttpRequest.prototype.send = function send(...args) {
      if (isCartMutationUrl(this.__pristinePreorderCartUrl)) {
        this.addEventListener('load', () => {
          if (this.status >= 200 && this.status < 300) {
            callback();
          } else {
            window.setTimeout(callback, 1500);
          }
        });
        this.addEventListener('error', () => window.setTimeout(callback, 1500));
      }

      return originalSend.apply(this, args);
    };
  }

  function isCartMutationUrl(value) {
    const url = typeof value === 'string' ? value : value?.url;

    if (!url) {
      return false;
    }

    try {
      const parsed = new URL(url, window.location.origin);
      return CART_MUTATION_REGEX.test(parsed.pathname);
    } catch (_) {
      return CART_MUTATION_REGEX.test(url);
    }
  }

  async function refreshCartSurface(settings) {
    if (canRenderCartDrawer()) {
      const sections = await getCartSections(settings);
      await renderCartSections(sections);
      return;
    }

    if (typeof publish === 'function' && window.PUB_SUB_EVENTS?.cartUpdate) {
      publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'pristine-preorder-cart' });
    }
  }

  function joinCartUrl(root, path) {
    return `${root.replace(/\/?$/, '/')}${path}`;
  }

  function getCartSectionIds() {
    const cartDrawer = document.querySelector('cart-drawer');

    if (cartDrawer?.getSectionsToRender) {
      return cartDrawer.getSectionsToRender().map((section) => section.id);
    }

    return ['cart-drawer', 'cart-icon-bubble'];
  }

  async function getCartSections(settings) {
    const sectionIds = getCartSectionIds().join(',');
    const sectionsUrl = encodeURIComponent(window.location.pathname);
    return getJson(joinCartUrl(settings.cartRoot, `cart?sections=${sectionIds}&sections_url=${sectionsUrl}&_=${Date.now()}`));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function buildCartAddItemFromFormData(formData) {
    const id = formData.get('id');

    if (!id) {
      return null;
    }

    const quantity = Number(formData.get('quantity') || 1);
    const item = {
      id,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    };
    const sellingPlan = formData.get('selling_plan');
    const properties = {};

    if (sellingPlan) {
      item.selling_plan = sellingPlan;
    }

    for (const [key, value] of formData.entries()) {
      const match = String(key).match(/^properties\[(.+)]$/);

      if (match && value !== '') {
        properties[match[1]] = value;
      }
    }

    if (Object.keys(properties).length) {
      item.properties = properties;
    }

    return item;
  }

  function buildProjectedCart(cart, mainItem, options) {
    const variantId = String(mainItem.id);
    const unitPrice = Number(options.variantPrices?.[variantId] || 0);
    const quantity = Number(mainItem.quantity || 1);
    const linePrice = unitPrice * quantity;
    const items = Array.isArray(cart?.items) ? [...cart.items] : [];

    items.push({
      key: `pending-${variantId}-${Date.now()}`,
      id: mainItem.id,
      variant_id: mainItem.id,
      quantity,
      original_line_price: linePrice,
      final_line_price: linePrice,
      line_price: linePrice,
      product_type: options.productType || '',
      properties: mainItem.properties || {},
    });

    return {
      ...cart,
      items,
      items_subtotal_price: Number(cart?.items_subtotal_price || 0) + linePrice,
      total_price: Number(cart?.total_price || cart?.items_subtotal_price || 0) + linePrice,
    };
  }

  function canRenderCartDrawer() {
    const cartDrawer = document.querySelector('cart-drawer');
    return Boolean(cartDrawer?.getSectionsToRender && cartDrawer?.renderContents);
  }

  async function renderCartSections(sections) {
    const cartDrawer = document.querySelector('cart-drawer');

    if (cartDrawer?.getSectionsToRender && cartDrawer?.renderContents) {
      cartDrawer.renderContents({ id: 'pristine-preorder-cart', sections });
    }
  }

  function applyOptimisticOpen() {
    const drawer = document.querySelector('cart-drawer');
    if (!drawer) return;

    if (typeof drawer.open === 'function' && !drawer.classList.contains('active')) {
      try { drawer.open(); } catch (err) { console.warn('[PristinePreorderCart] drawer.open failed', err); }
    }

    ensureOptimisticStyles();

    let overlay = drawer.querySelector(':scope > .pristine-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pristine-loading-overlay';
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = '<div class="pristine-loading-overlay__spinner" role="status"><span class="pristine-loading-overlay__dot"></span><span class="pristine-loading-overlay__dot"></span><span class="pristine-loading-overlay__dot"></span></div><div class="pristine-loading-overlay__text">Updating cart…</div>';
      drawer.appendChild(overlay);
    } else {
      overlay.style.display = '';
      overlay.style.opacity = '';
    }
  }

  function ensureOptimisticStyles() {
    if (document.getElementById('pristine-loading-overlay-styles')) return;
    const style = document.createElement('style');
    style.id = 'pristine-loading-overlay-styles';
    style.textContent = `
      cart-drawer { position: relative; }
      .pristine-loading-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 9999; pointer-events: none; backdrop-filter: blur(2px); }
      .pristine-loading-overlay__spinner { display: flex; gap: 6px; }
      .pristine-loading-overlay__dot { width: 10px; height: 10px; background: currentColor; border-radius: 50%; opacity: 0.3; animation: pristine-loading-pulse 1s infinite ease-in-out; }
      .pristine-loading-overlay__dot:nth-child(2) { animation-delay: 0.15s; }
      .pristine-loading-overlay__dot:nth-child(3) { animation-delay: 0.3s; }
      .pristine-loading-overlay__text { font-size: 14px; font-weight: 500; letter-spacing: 0.02em; color: #111; }
      @keyframes pristine-loading-pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);
  }

  function clearOptimisticOverlay() {
    document.querySelectorAll('.pristine-loading-overlay').forEach((el) => el.remove());
  }

  console.info(`[PristinePreorderCart] version ${SCRIPT_VERSION}`);
  window.PristinePreorderCart = { init, reconcile, settleCart, addProductWithRewards, version: SCRIPT_VERSION };
})();
