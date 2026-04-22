import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Button,
  View,
  useSettings
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';

export default reactExtension(
  'customer-account.order-index.block.render',
  () => <OrderIndexBlock />
);

function OrderIndexBlock() {
  const { banner_title } = useSettings();

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
            <Text size="small" appearance="subdued">Order #1001 is on its way</Text>
          </BlockStack>
        </InlineLayout>
        
        <Divider />
        
        <InlineLayout columns={['fill', 'auto']} blockAlignment="center">
          <Text size="small">Next stop: Pristine Logistics Hub</Text>
          <Button kind="secondary" size="small">TRACK</Button>
        </InlineLayout>
      </BlockStack>
    </View>
  );
}

function Divider() {
  return <View border="subdued" blockAlignment="center" />;
}
