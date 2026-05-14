/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default function extension() {
  render(<OrderIndexBlock />, document.body);
}

function OrderIndexBlock() {
  const title = shopify.settings.value.banner_title || 'Recent Journey';
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTracking() {
      try {
        const response = await fetch('shopify://customer-account/api/2026-04/graphql.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetTracking {
                customer {
                  tracking_summary: metafield(namespace: "pristine", key: "tracking_summary") {
                    value
                  }
                  tracking: metafield(namespace: "pristine", key: "Tracking") {
                    value
                  }
                  tracking_lower: metafield(namespace: "pristine", key: "tracking") {
                    value
                  }
                }
              }
            `,
          }),
        });

        const result = await response.json();
        const val =
          result.data?.customer?.tracking_summary?.value ||
          result.data?.customer?.tracking?.value ||
          result.data?.customer?.tracking_lower?.value;

        if (val) {
          setTrackingData(JSON.parse(val));
        }
      } catch (err) {
        console.error('Fetch tracking error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTracking();
  }, []);

  const lastMilestone = trackingData?.milestones?.filter((milestone) => milestone.completed).slice(-1)[0];

  return (
    <s-section heading={title}>
      <s-stack gap="base">
        <s-box padding="base" background="subdued" border="base" border-radius="base">
          <s-stack gap="small">
            <s-text>
              {trackingData
                ? `Order ${trackingData.orderName || '#1002'} - ${trackingData.status || 'In progress'}`
                : loading
                  ? 'Loading recent order journey...'
                  : 'No recent tracking updates available.'}
            </s-text>
            {lastMilestone ? (
              <s-grid grid-template-columns="1fr auto" gap="base" align-items="center">
                <s-text color="subdued">Last stop: {lastMilestone.label} on {lastMilestone.date}</s-text>
                <s-button variant="secondary">Track</s-button>
              </s-grid>
            ) : null}
          </s-stack>
        </s-box>
      </s-stack>
    </s-section>
  );
}
