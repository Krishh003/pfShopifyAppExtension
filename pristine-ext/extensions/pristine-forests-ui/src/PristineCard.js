import { Card, View } from '@shopify/ui-extensions-react/customer-account';
import { THEME } from './theme';

export function PristineCard({ children, padding = THEME.spacing.base, background = 'surfaceSecondary', ...props }) {
  return (
    <Card padding={false} {...props}>
      <View padding={padding} background={background} cornerRadius="base">
        {children}
      </View>
    </Card>
  );
}
