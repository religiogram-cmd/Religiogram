import type { Metadata } from 'next';
import PolicyScreen from '@/components/legal/PolicyScreen';

export const metadata: Metadata = {
  title: 'Privacy Policy — ReligioGram',
  description:
    'How ReligioGram collects, uses, shares and protects your personal data under the DPDP framework.',
};

export default function PrivacyPage() {
  return <PolicyScreen defaultFocus="privacy" />;
}
