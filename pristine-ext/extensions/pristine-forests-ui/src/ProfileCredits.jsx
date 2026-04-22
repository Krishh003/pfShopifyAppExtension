import { useState, useEffect } from 'react';
import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  View,
  useApi,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';
import { PristineCard } from './PristineCard';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCredits />
);

function ProfileCredits() {
  const { query } = useApi();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("Pristine Credits - Start Fetching");
    query(`
      query GetCredits {
        customer {
          metafield(namespace: "pristine", key: "credits") {
            value
          }
        }
      }
    `).then(({ data, errors }) => {
      console.log("Pristine Credits - API Response:", { data, errors });
      if (errors) {
        console.error("Pristine Credits - GraphQL Errors:", errors);
        setError("GraphQL Error");
      }
      const val = data?.customer?.metafield?.value;
      setBalance(val || '0');
    }).catch(err => {
      console.error("Pristine Credits - Query Exception:", err);
      setError(err.message);
    }).finally(() => {
      setLoading(false);
      console.log("Pristine Credits - Fetch Complete");
    });
  }, [query]);

  let displayBalance = '₹0.00';
  if (balance !== null) {
    try {
      const num = parseFloat(balance);
      if (!isNaN(num)) {
        displayBalance = num.toLocaleString('en-IN', {
          style: 'currency',
          currency: 'INR',
        });
      }
    } catch (e) {
      console.error("Pristine Credits - Formatting Error:", e);
    }
  }

  return (
    <PristineCard padding={THEME.spacing.loose}>
      <BlockStack spacing={THEME.spacing.tight}>
        <InlineLayout columns={['auto', 'fill']} blockAlignment="center" spacing="tight">
           <View padding="tight" background="surfaceTertiary" cornerRadius="small">
              <Text size="small">💰</Text>
           </View>
           <Text size="xsmall" appearance="subdued" emphasis="bold">SANCTUARY CREDITS</Text>
        </InlineLayout>
        
        <BlockStack spacing="none">
          <Text size="extraLarge">
            {loading ? '...' : displayBalance}
          </Text>
        </BlockStack>

        <View paddingBlockStart="loose">
          <Text size="xsmall" appearance="subdued">
            Your reward points have been converted to store credit.
          </Text>
        </View>
      </BlockStack>
    </PristineCard>
  );
}
