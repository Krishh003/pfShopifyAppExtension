/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';

export default function extension() {
  render(<ProfileActions />, document.body);
}

function ProfileActions() {
  return (
    <s-section heading="Quick Actions">
      <s-grid grid-template-columns="1fr 1fr 1fr" gap="base">
        <ActionCard title="Track Orders" description="Updates on your forest parcels." />
        <ActionCard title="Forest Perks" description="Check your customer benefits." />
        <ActionCard title="Support" description="Get help with your account." />
      </s-grid>
    </s-section>
  );
}

function ActionCard({ title, description }) {
  return (
    <s-box padding="base" background="subdued" border="base" border-radius="base">
      <s-stack gap="small">
        <s-heading>{title}</s-heading>
        <s-text color="subdued">{description}</s-text>
        <s-link href="shopify://customer-account/orders">Manage</s-link>
      </s-stack>
    </s-box>
  );
}
