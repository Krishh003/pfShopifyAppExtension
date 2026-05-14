/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';

import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { formatCreditBalance, getDisplayCreditBalance } from './creditBalance';

export default function extension() {
  render(<ProfileCredits />, document.body);
}

function ProfileCredits() {
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      try {
        const response = await fetch('shopify://customer-account/api/2026-04/graphql.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetCredits {
                customer {
                  storeCreditAccounts(first: 10) {
                    nodes {
                      balance {
                        amount
                        currencyCode
                      }
                    }
                  }
                  portal_status: metafield(namespace: "pristine", key: "portal_status") {
                    value
                  }
                  credits: metafield(namespace: "pristine", key: "Credits") {
                    value
                  }
                  credits_lower: metafield(namespace: "pristine", key: "credits") {
                    value
                  }
                }
              }
            `,
          }),
        });

        const result = await response.json();

        if (result.data?.customer) {
          setCreditBalance(getDisplayCreditBalance(result.data.customer));
        }
      } catch (err) {
        console.error('Fetch credits error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCredits();
  }, []);

  return (
    <s-section heading="Store Credit">
      <s-stack gap="base">
        <s-box padding="base" background="subdued" border="base" border-radius="base">
          <s-text>{formatCreditBalance(creditBalance)}</s-text>
        </s-box>
        <s-text color="subdued">
          {loading ? 'Loading latest balance...' : 'Automatically applied at checkout.'}
        </s-text>
      </s-stack>
    </s-section>
  );
}
