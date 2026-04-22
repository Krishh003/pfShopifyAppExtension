import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Button,
  useSettings,
  View,
  useApi,
  useNavigation,
  Image,
} from '@shopify/ui-extensions-react/customer-account';
import { useState, useEffect } from 'react';

import { THEME } from './theme';
import { PristineCard } from './PristineCard';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileBanner />
);

function ProfileBanner() {
  const { banner_title } = useSettings();
  const { query } = useApi();
  const { navigate } = useNavigation();
  const [hasCodOrder, setHasCodOrder] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("Pristine Banner - Start Fetching");
    query(`
      query GetPendingOrders {
        customer {
          orders(first: 10) {
            nodes {
              id
              name
              financialStatus
            }
          }
        }
      }
    `).then(({ data, errors }) => {
      console.log("Pristine Banner - API Response:", { data, errors });
      if (errors) console.error("Pristine Banner - GraphQL Errors:", errors);
      
      const orders = data?.customer?.orders?.nodes || [];
      const pendingOrder = orders.find(o => o.financialStatus === 'PENDING' || o.financialStatus === 'pending');

      if (pendingOrder) {
        setOrderDetails(pendingOrder);
        setHasCodOrder(true);
      }
    }).catch(err => console.error("Pristine Banner - Query Exception:", err))
    .finally(() => {
      setLoading(false);
      console.log("Pristine Banner - Fetch Complete");
    });
  }, [query]);

  const handleGoPrepaid = () => {
    if (orderDetails) {
      navigate(`shopify://customer-account/orders/${orderDetails.id.split('/').pop()}`);
    }
  };

  return (
    <PristineCard padding="none" background="surfacePrimary" overflow="hidden">
      <InlineLayout columns={['fill', '45%']}>
        <View padding="loose" background="surfaceSecondary">
          <BlockStack spacing="base">
            <Text size="xsmall" emphasis="bold" appearance="subdued">PRISTINE EXCLUSIVE</Text>
            <Heading level={2}>
              {loading ? 'Welcome' : (hasCodOrder ? (banner_title || 'Elevate your experience') : (banner_title || 'Welcome back!'))}
            </Heading>
            
            {!loading && (
              <Text size="small" appearance="subdued">
                {hasCodOrder 
                  ? "Convert your pending Cash on Delivery orders to prepaid for seamless delivery and receive an exclusive Loyalty Reward."
                  : "Join our community. Track your purchases and manage your rewards here."
                }
              </Text>
            )}
            
            {!loading && (
              <View paddingBlockStart="base">
                <Button 
                  kind="primary" 
                  onPress={hasCodOrder ? handleGoPrepaid : undefined}
                >
                  {hasCodOrder ? 'CONVERT NOW' : 'EXPLORE COLLECTIONS'}
                </Button>
              </View>
            )}
          </BlockStack>
        </View>
        <View background="surfaceTertiary">
           <Image 
             source="https://cdn.shopify.com/s/files/1/0635/5124/2368/files/luxury_product_alt.png?v=1713780001" 
             fit="cover"
             aspectRatio={1}
           />
        </View>
      </InlineLayout>
    </PristineCard>
  );
}
