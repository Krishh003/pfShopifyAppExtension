(function () {
  const DEFAULT_OPTIONS = {
    planUrl: '/api/preorder-cart/plan',
    cartRoot: window.Shopify?.routes?.root || '/',
    once: false,
  };

  async function reconcile(options) {
    const settings = { ...DEFAULT_OPTIONS, ...(options || {}) };
    const cart = await getJson(joinCartUrl(settings.cartRoot, 'cart.js'));
    const planResponse = await postJson(settings.planUrl, { cart, config: settings.config });
    const plan = planResponse.plan || { adds: [], changes: [] };
    let changed = false;

    for (const change of plan.changes || []) {
      await postJson(joinCartUrl(settings.cartRoot, 'cart/change.js'), change);
      changed = true;
    }

    if (plan.adds?.length) {
      await postJson(joinCartUrl(settings.cartRoot, 'cart/add.js'), { items: plan.adds });
      changed = true;
    }

    if (changed) {
      window.dispatchEvent(new CustomEvent('pristine:preorder-cart:updated', { detail: { plan } }));
    }

    return { changed, plan };
  }

  function init(options) {
    const settings = { ...DEFAULT_OPTIONS, ...(options || {}) };
    const run = () => reconcile(settings).catch((error) => {
      window.dispatchEvent(new CustomEvent('pristine:preorder-cart:error', { detail: { error } }));
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }

    if (!settings.once) {
      window.addEventListener('pristine:cart:changed', run);
    }
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });

    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${response.status}`);
    }

    return response.json();
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${url} failed with ${response.status}`);
    }

    return response.json();
  }

  function joinCartUrl(root, path) {
    return `${root.replace(/\/?$/, '/')}${path}`;
  }

  window.PristinePreorderCart = { init, reconcile };
})();
