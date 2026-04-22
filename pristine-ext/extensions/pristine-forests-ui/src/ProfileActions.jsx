import {
  reactExtension,
  BlockStack,
  InlineLayout,
  Heading,
  Text,
  Link,
  View,
} from '@shopify/ui-extensions-react/customer-account';

import { THEME } from './theme';
import { PristineCard } from './PristineCard';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <ProfileActions />
);

function ProfileActions() {
  return (
    <InlineLayout columns={['fill', 'fill']} spacing={THEME.spacing.base}>
      <FeatureCard 
        title="Track Orders" 
        description="Real-time updates on your orders." 
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
    <PristineCard padding={THEME.spacing.loose}>
      <BlockStack spacing={THEME.spacing.tight}>
        <Heading level={3}>{title}</Heading>
        <Text size="small" appearance="subdued">{description}</Text>
        <Link to="#">Manage</Link>
      </BlockStack>
    </PristineCard>
  );
}
