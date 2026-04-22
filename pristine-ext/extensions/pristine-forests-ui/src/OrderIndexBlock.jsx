import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Button,
  View,
  useSettings,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';
import React, { useEffect, useState } from 'react';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.order-index.block.render',
  () => <OrderIndexBlock />
);

function OrderIndexBlock() {
  const { banner_title } = useSettings();
  const api = useApi();
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTracking() {
      try {
        console.log('Fetching tracking via Customer Account API...');
        const response = await fetch("shopify://customer-account/api/2026-04/graphql.json", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetTracking {
                customer {
                  tracking: metafield(namespace: "pristine", key: "Tracking") {
                    value
                  }
                  tracking_lower: metafield(namespace: "pristine", key: "tracking") {
                    value
                  }
                }
              }
            `
          }),
        });

        const result = await response.json();
        console.log('GraphQL Tracking Result:', result);
        
        if (result.errors) {
          result.errors.forEach(err => console.error('GraphQL Tracking Error Message:', err.message));
        }

        if (result.data?.customer) {
          const val = result.data.customer.tracking?.value || result.data.customer.tracking_lower?.value;
          if (val) {
            setTrackingData(JSON.parse(val));
          }
        }
      } catch (err) {
        console.error('Fetch tracking error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTracking();
  }, [api]);

  const value = trackingData;
  let trackingInfo = null;

  if (value) {
    trackingInfo = value;
  }

  if (!trackingInfo) return null;

  return (
    <View 
      padding={THEME.spacing.base} 
      background="surfaceSecondary" 
      cornerRadius="base"
      border="subdued"
    >
      <BlockStack spacing={THEME.spacing.base}>
        <InlineLayout columns={['auto', 'fill']} spacing={THEME.spacing.base} blockAlignment="center">
          <View padding="base" background="surfaceTertiary" cornerRadius="full">
            <Text appearance="accent">LOG</Text>
          </View>
          <BlockStack spacing="none">
            <Heading level={2}>{banner_title || 'Recent Journey'}</Heading>
            <Text size="small" appearance="subdued">Order {trackingInfo.orderName || '#1002'} — {trackingInfo.status}</Text>
          </BlockStack>
        </InlineLayout>
        
        <Divider />
        
        <BlockStack spacing="extraTight">
          {trackingInfo.milestones?.filter(m => m.completed).slice(-1).map((m, i) => (
             <InlineLayout key={i} columns={['fill', 'auto']} blockAlignment="center">
                <Text size="small">Last stop: {m.label} on {m.date}</Text>
                <Button kind="secondary" size="small">TRACK</Button>
             </InlineLayout>
          ))}
        </BlockStack>
      </BlockStack>
    </View>
  );
}

function Divider() {
  return <View border="subdued" blockAlignment="center" marginBlockStart="tight" marginBlockEnd="tight" />;
}
