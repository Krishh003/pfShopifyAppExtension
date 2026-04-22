import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Button,
  View,
  Divider,
  Link,
  useSettings,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';
import { useState, useEffect } from 'react';

import { THEME } from './theme';
import { PristineCard } from './PristineCard';

export default reactExtension(
  'customer-account.order-index.block.render',
  () => <OrderIndexBlock />
);

function OrderIndexBlock() {
  const { banner_title } = useSettings();
  const { query } = useApi();
  const [latestOrder, setLatestOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("Pristine Tracking - Start Fetching");
    query(`
      query GetLatestOrder {
        customer {
          orders(first: 5) {
            nodes {
              id
              name
              status
              fulfillments(first: 1) {
                nodes {
                  trackingInfo {
                    number
                    url
                  }
                }
              }
            }
          }
        }
      }
    `).then(({ data, errors }) => {
      console.log("Pristine Tracking - API Response:", { data, errors });
      if (errors) {
        console.error("Pristine Tracking - GraphQL Errors:", errors);
        setError("GraphQL query error");
      }

      if (data?.customer?.orders?.nodes?.length > 0) {
        setLatestOrder(data.customer.orders.nodes[0]);
      }
    }).catch(err => {
      console.error("Pristine Tracking - Query Exception:", err);
      setError(err.message);
    }).finally(() => {
      setLoading(false);
      console.log("Pristine Tracking - Fetch Complete");
    });
  }, [query]);

  if (loading) {
    return (
      <PristineCard background="surfaceSecondary">
        <Text>Checking for your latest order status...</Text>
      </PristineCard>
    );
  }

  // If no recent order, we show a placeholder journey
  if (!latestOrder) {
    return (
      <PristineCard background="surfaceSecondary">
        <BlockStack spacing={THEME.spacing.base}>
          <InlineLayout columns={['auto', 'fill']} spacing={THEME.spacing.base} blockAlignment="center">
            <View padding="base" background="surfaceTertiary" cornerRadius="full">
              <Text appearance="accent">LOG</Text>
            </View>
            <BlockStack spacing="none">
              <Heading level={2}>{banner_title || 'Your Next Order'}</Heading>
              <Text size="small" appearance="subdued">
                {error ? `Note: ${error}` : "You haven't placed any orders yet!"}
              </Text>
            </BlockStack>
          </InlineLayout>
          
          <Divider />
          
          <InlineLayout columns={['fill', 'auto']} blockAlignment="center">
            <Text size="small">Explore our latest collection and find something you love.</Text>
            <Button kind="secondary" size="small">SHOP ALL</Button>
          </InlineLayout>
        </BlockStack>
      </PristineCard>
    );
  }

  const fulfillment = latestOrder.fulfillments?.nodes?.[0];
  const trackingInfo = fulfillment?.trackingInfo || [];
  const tracking = trackingInfo[0];
  const status = latestOrder.status?.toLowerCase() || 'processing';

  return (
    <PristineCard background="surfaceSecondary">
      <BlockStack spacing={THEME.spacing.base}>
        <InlineLayout columns={['auto', 'fill']} spacing={THEME.spacing.base} blockAlignment="center">
          <View padding="base" background="surfaceTertiary" cornerRadius="full">
            <Text appearance="accent">LOG</Text>
          </View>
          <BlockStack spacing="none">
            <Heading level={2}>{banner_title || 'Order Tracking'}</Heading>
            <Text size="small" appearance="subdued">
              Order {latestOrder.name} is {status}
            </Text>
          </BlockStack>
        </InlineLayout>
        
        <Divider />
        
        <InlineLayout columns={['fill', 'auto']} blockAlignment="center">
          <BlockStack spacing="none">
            <Text size="small">Check your order status and details below.</Text>
            {tracking?.number && <Text size="xsmall" appearance="subdued">Tracking: {tracking.number}</Text>}
          </BlockStack>
          {tracking?.url && (
            <Link to={tracking.url} external>
               TRACK
            </Link>
          )}
        </InlineLayout>
      </BlockStack>
    </PristineCard>
  );
}
