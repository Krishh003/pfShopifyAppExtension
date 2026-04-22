import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Card,
  Link,
  View,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';
import React, { useEffect, useState } from 'react';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCoupons />
);

function ProfileCoupons() {
  const api = useApi();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCoupons() {
      try {
        console.log('Fetching coupons via Customer Account API...');
        const response = await fetch("shopify://customer-account/api/2026-04/graphql.json", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetCoupons {
                customer {
                  coupons: metafield(namespace: "pristine", key: "Coupons") {
                    value
                  }
                  coupons_lower: metafield(namespace: "pristine", key: "coupons") {
                    value
                  }
                }
              }
            `
          }),
        });

        const result = await response.json();
        console.log('GraphQL Coupons Result:', result);
        
        if (result.errors) {
          result.errors.forEach(err => console.error('GraphQL Coupons Error Message:', err.message));
        }

        if (result.data?.customer) {
          const val = result.data.customer.coupons?.value || result.data.customer.coupons_lower?.value;
          if (val) {
            setCoupons(JSON.parse(val));
          }
        }
      } catch (err) {
        console.error('Fetch coupons error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCoupons();
  }, [api]);

  const value = coupons;
  let couponData = [];

  if (value && Array.isArray(value)) {
    couponData = value;
  }

  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.tight}>
          <Heading level={2}>Your Coupons</Heading>
          
          {couponData.length > 0 ? (
            couponData.map((coupon, index) => (
              <View key={index} padding="base" background="surfaceTertiary" cornerRadius="base" border="subdued">
                <BlockStack spacing="extraTight">
                  <InlineLayout columns={['fill', 'auto']} blockAlignment="center">
                    <Text appearance="accent" size="large">{coupon.code}</Text>
                    <Link to="#">Copy</Link>
                  </InlineLayout>
                  <Text size="small" appearance="subdued">{coupon.discount} — Expires {coupon.expiry}</Text>
                </BlockStack>
              </View>
            ))
          ) : (
            <View padding="base" background="surfaceTertiary" cornerRadius="base" border="subdued">
              <Text appearance="subdued">No active coupons available.</Text>
            </View>
          )}
        </BlockStack>
      </View>
    </Card>
  );
}
