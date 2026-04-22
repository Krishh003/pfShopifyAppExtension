import { useState, useEffect } from 'react';
import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  View,
  Button,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';
import { PristineCard } from './PristineCard';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCoupons />
);

function ProfileCoupons() {
  const { query } = useApi();
  const [coupons, setCoupons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    console.log("Pristine Coupons - Start Fetching");
    query(`
      query GetCoupons {
        customer {
          metafield(namespace: "pristine", key: "coupons") {
            value
          }
        }
      }
    `).then(({ data, errors }) => {
      console.log("Pristine Coupons - API Response:", { data, errors });
      if (errors) {
        console.error("Pristine Coupons - GraphQL Errors:", errors);
        setError("Metafield query error");
      }
      
      const rawValue = data?.customer?.metafield?.value;
      if (rawValue) {
        try {
          const parsed = JSON.parse(rawValue);
          setCoupons(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error("Pristine Coupons - JSON Parse Error:", e);
          setCoupons([{ code: 'ERROR', discount: 'N/A', description: 'Invalid format.' }]);
        }
      } else {
        setCoupons([
          { code: 'WELCOME10', discount: '10%', description: 'Welcome to Pristine Forests.' }
        ]);
      }
    }).catch(err => {
      console.error("Pristine Coupons - Query Exception:", err);
      setError(err.message);
      setCoupons([{ code: 'OFFLINE', discount: 'N/A', description: 'Could not load coupons.' }]);
    }).finally(() => {
      setLoading(false);
      console.log("Pristine Coupons - Fetch Complete");
    });
  }, [query]);

  const handleCopy = (code) => {
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const couponList = coupons || [];

  return (
    <PristineCard padding={THEME.spacing.loose}>
      <BlockStack spacing={THEME.spacing.tight}>
        <InlineLayout columns={['auto', 'fill']} blockAlignment="center" spacing="tight">
           <View padding="tight" background="surfaceTertiary" cornerRadius="small">
              <Text size="small">🎟️</Text>
           </View>
           <Text size="xsmall" appearance="subdued" emphasis="bold">ACTIVE RITUALS</Text>
        </InlineLayout>
        
        <BlockStack spacing="none">
          <Text size="extraLarge" emphasis="italic">
            {loading ? '...' : `${couponList.length} Exclusive Invites`}
          </Text>
        </BlockStack>

        <View paddingBlockStart="loose">
          <InlineLayout spacing="extraTight">
            {!loading && couponList.map((coupon, index) => (
              <View 
                key={index} 
                padding="extraTight" 
                background="surfaceTertiary" 
                cornerRadius="base"
                border="base"
              >
                <Text size="xsmall" emphasis="bold">{coupon.code}</Text>
              </View>
            ))}
          </InlineLayout>
        </View>
      </BlockStack>
    </PristineCard>
  );
}
