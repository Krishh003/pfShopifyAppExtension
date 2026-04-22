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
  () => <ProfileActions />
);

function ProfileActions() {
  return (
    <InlineLayout columns={['fill', 'fill', 'fill']} spacing={THEME.spacing.base}>
      <FeatureCard 
        title="Track Orders" 
        description="Updates on your forest parcels." 
      />
      <FeatureCard 
        title="Forest Perks" 
        description="Check your tree-planting credits." 
      />
      <FeatureCard 
        title="Support" 
        description="24/7 assistance." 
      />
    </InlineLayout>
  );
}

function FeatureCard({ title, description }) {
  return (
    <Card>
      <View padding={THEME.spacing.loose}>
        <BlockStack spacing={THEME.spacing.tight}>
          <Heading level={3}>{title}</Heading>
          <Text size="small" appearance="subdued">{description}</Text>
          <Link to="#">Manage</Link>
        </BlockStack>
      </View>
    </Card>
  );
}
