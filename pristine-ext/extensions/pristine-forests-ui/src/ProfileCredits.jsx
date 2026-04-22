import {
  reactExtension,
  BlockStack,
  Heading,
  Text,
  Card,
  View,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';
import React, { useEffect, useState } from 'react';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCredits />
);

function ProfileCredits() {
  const api = useApi();
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      try {
        console.log('Fetching credits via Customer Account API...');
        const response = await fetch("shopify://customer-account/api/2026-04/graphql.json", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetCredits {
                customer {
                  credits: metafield(namespace: "pristine", key: "Credits") {
                    value
                  }
                  credits_lower: metafield(namespace: "pristine", key: "credits") {
                    value
                  }
                }
              }
            `
          }),
        });

        const result = await response.json();
        console.log('GraphQL Result:', result);
        
        if (result.errors) {
          result.errors.forEach(err => console.error('GraphQL Error Message:', err.message));
        }

        if (result.data?.customer) {
          const val = result.data.customer.credits?.value || result.data.customer.credits_lower?.value;
          setCredits(val);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCredits();
  }, [api]);

  const value = credits;
  let balance = '₹ 0.00';

  if (value) {
    const amount = parseFloat(value) / 100;
    balance = amount.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });
  }

  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.tight}>
          <Heading level={2}>Store Credit</Heading>
          <View padding="base" background="surfaceSuccess" cornerRadius="base">
             <Text size="extraLarge" color="success">{balance}</Text>
          </View>
          <Text size="small" appearance="subdued">Automatically applied at checkout.</Text>
        </BlockStack>
      </View>
    </Card>
  );
}
