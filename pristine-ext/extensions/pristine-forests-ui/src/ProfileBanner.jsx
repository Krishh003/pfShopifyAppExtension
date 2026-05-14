/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';

export default function extension() {
  render(<ProfileBanner />, document.body);
}

function ProfileBanner() {
  const title = shopify.settings.value.banner_title || 'Elevate your experience';

  return (
    <s-section heading={title}>
      <s-stack gap="base">
        <s-text>
          Convert your pending Cash on Delivery orders to prepaid for seamless delivery and exclusive forest rewards.
        </s-text>
        <s-button-group>
          <s-button variant="primary">GO PREPAID</s-button>
          <s-button variant="secondary">LEARN MORE</s-button>
        </s-button-group>
      </s-stack>
    </s-section>
  );
}
