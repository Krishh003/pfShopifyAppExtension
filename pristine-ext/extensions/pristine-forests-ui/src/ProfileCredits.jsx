import {
  reactExtension,
  BlockStack,
  Heading,
  Text,
  Card,
  View,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCredits />
);

function ProfileCredits() {
  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.tight}>
          <Heading level={2}>Store Credit</Heading>
          <View padding="base" background="surfaceSuccess" cornerRadius="base">
             <Text size="extraLarge" color="success">₹ 1,500.00</Text>
          </View>
          <Text size="small" appearance="subdued">Automatically applied at checkout.</Text>
        </BlockStack>
      </View>
    </Card>
  );
}
