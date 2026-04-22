import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Card,
  Link,
  View,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileCoupons />
);

function ProfileCoupons() {
  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.tight}>
          <Heading level={2}>Your Coupons</Heading>
          <View padding="base" background="surfaceTertiary" cornerRadius="base" border="subdued">
            <InlineLayout columns={['fill', 'auto']} blockAlignment="center">
              <Text appearance="accent" size="large">PRISTINE-20</Text>
              <Link to="#">Copy</Link>
            </InlineLayout>
          </View>
          <Text size="small" appearance="subdued">Use this code for 20% off your next purchase.</Text>
        </BlockStack>
      </View>
    </Card>
  );
}
