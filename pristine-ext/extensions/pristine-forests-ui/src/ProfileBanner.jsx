import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Button,
  Card,
  useSettings,
  View,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileBanner />
);

function ProfileBanner() {
  const { banner_title } = useSettings();

  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.base}>
          <Heading level={2}>
            {banner_title || 'Elevate your experience'}
          </Heading>
          <Text size="large">
            Convert your pending Cash on Delivery orders to prepaid for seamless delivery 
            and exclusive forest rewards.
          </Text>
          <InlineLayout spacing={THEME.spacing.base}>
            <Button kind="primary">GO PREPAID</Button>
            <Button kind="secondary">LEARN MORE</Button>
          </InlineLayout>
        </BlockStack>
      </View>
    </Card>
  );
}
