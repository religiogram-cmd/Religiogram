'use client';
import { useParams, useRouter } from 'next/navigation';
import ProviderProfileScreen from '@/components/providers/ProviderProfileScreen';
export default function ProviderPage() {
  const { id } = useParams();
  const router = useRouter();
  return (
    <ProviderProfileScreen
      providerId={id as string}
      onBack={() => router.back()}
      onBookNow={() => router.push(`/book/${id}`)}
    />
  );
}
