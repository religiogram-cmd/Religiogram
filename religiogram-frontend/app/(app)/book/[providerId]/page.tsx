'use client';
import { useParams, useRouter } from 'next/navigation';
import BookingCheckoutFlow from '@/components/booking/BookingCheckoutFlow';
export default function BookPage() {
  const { providerId } = useParams();
  const router = useRouter();
  return (
    <BookingCheckoutFlow
      providerId={providerId as string}
      onBack={() => router.back()}
      onComplete={(_bookingId) => router.push('/bookings?success=true')}
    />
  );
}
