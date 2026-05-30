import type { Metadata } from 'next';
import PolicyScreen from '@/components/legal/PolicyScreen';

export const metadata: Metadata = {
  title: 'Terms & Policies — ReligioGram',
  description:
    'ReligioGram Terms of Service, Privacy Policy, Refund, Community, Provider, Safety, Payments, IP, DMCA, Data Retention, Cookie, Child Safety and Religious Neutrality policies.',
};

export default function TermsPage() {
  return <PolicyScreen defaultFocus="terms" />;
}
