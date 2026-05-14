/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { normalizeCouponOffers } from './couponOffers';

export default function extension() {
  render(<ProfileCoupons />, document.body);
}

function ProfileCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCoupons() {
      try {
        const response = await fetch('shopify://customer-account/api/2026-04/graphql.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetCoupons {
                customer {
                  visible_coupons: metafield(namespace: "pristine", key: "visible_coupons") {
                    value
                  }
                  coupons: metafield(namespace: "pristine", key: "Coupons") {
                    value
                  }
                  coupons_lower: metafield(namespace: "pristine", key: "coupons") {
                    value
                  }
                }
              }
            `,
          }),
        });

        const result = await response.json();
        const val =
          result.data?.customer?.visible_coupons?.value ||
          result.data?.customer?.coupons?.value ||
          result.data?.customer?.coupons_lower?.value;

        if (val) {
          const parsed = JSON.parse(val);
          setCoupons(Array.isArray(parsed) ? parsed : [parsed]);
        }
      } catch (err) {
        console.error('Fetch coupons error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCoupons();
  }, []);

  const couponData = normalizeCouponOffers(coupons);

  return (
    <s-section heading="Your Coupons">
      <s-stack gap="base">
        {loading ? <s-text color="subdued">Loading coupons...</s-text> : null}
        {couponData.length > 0 ? (
          couponData.map((coupon) => (
            <s-box key={coupon.code} padding="base" background="subdued" border="base" border-radius="base">
              <s-stack gap="small">
                <s-grid grid-template-columns="1fr auto" gap="base" align-items="center">
                  <s-text>{coupon.code}</s-text>
                  <s-clipboard-item text={coupon.code} />
                </s-grid>
                <s-text color="subdued">
                  {coupon.discount || coupon.title || 'Available now'} - Expires{' '}
                  {coupon.expiry || coupon.expiresAt || 'not set'}
                </s-text>
              </s-stack>
            </s-box>
          ))
        ) : (
          <s-box padding="base" background="subdued" border="base" border-radius="base">
            <s-text color="subdued">No active coupons available.</s-text>
          </s-box>
        )}
      </s-stack>
    </s-section>
  );
}
