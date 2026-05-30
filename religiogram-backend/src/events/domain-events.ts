export interface UserRegisteredEvent {
  eventType: 'user.registered';
  userId: string;
  phone: string;
  email?: string;
  createdAt: string;
}

export interface ProviderSubmittedEvent {
  eventType: 'provider.submitted';
  providerId: string;
  submittedAt: string;
}

export interface ProviderApprovedEvent {
  eventType: 'provider.approved';
  providerId: string;
  approvedAt: string;
  adminId: string;
}

export interface ProviderSuspendedEvent {
  eventType: 'provider.suspended';
  providerId: string;
  reason: string;
  adminId: string;
}

export interface BookingCreatedEvent {
  eventType: 'booking.created';
  bookingId: string;
  userId: string;
  providerId: string;
  amountPaise: number;
  serviceSlug: string;
  scheduledAt: string;
}

export interface BookingConfirmedEvent {
  eventType: 'booking.confirmed';
  bookingId: string;
  confirmedAt: string;
}

export interface BookingCancelledEvent {
  eventType: 'booking.cancelled';
  bookingId: string;
  cancelledBy: 'user' | 'provider' | 'admin';
  refundPct: number;
}

export interface BookingCompletedEvent {
  eventType: 'booking.completed';
  bookingId: string;
  completedAt: string;
  durationMin: number;
}

export interface WalletCreditedEvent {
  eventType: 'wallet.credited';
  walletId: string;
  userId: string;
  amountPaise: number;
  entryType: string;
  idempotencyKey: string;
}

export interface WalletDebitedEvent {
  eventType: 'wallet.debited';
  walletId: string;
  userId: string;
  amountPaise: number;
  referenceId: string;
  idempotencyKey: string;
}

export interface WalletRefundedEvent {
  eventType: 'wallet.refunded';
  walletId: string;
  userId: string;
  amountPaise: number;
  originalReference: string;
}

export interface ConsultationStartedEvent {
  eventType: 'consultation.started';
  sessionId: string;
  userId: string;
  providerId: string;
  ratePaise: number;
  startedAt: string;
}

export interface ConsultationTickEvent {
  eventType: 'consultation.tick';
  sessionId: string;
  tickMinute: number;
  amountPaise: number;
  idempotencyKey: string;
}

export interface ConsultationEndedEvent {
  eventType: 'consultation.ended';
  sessionId: string;
  durationSec: number;
  totalChargePaise: number;
  endedAt: string;
}

export interface PaymentCapturedEvent {
  eventType: 'payment.captured';
  paymentId: string;
  amountPaise: number;
  method: string;
  bookingId?: string;
}

export interface PaymentFailedEvent {
  eventType: 'payment.failed';
  paymentId: string;
  reason: string;
  bookingId?: string;
}

export interface ReviewCreatedEvent {
  eventType: 'review.created';
  reviewId: string;
  providerId: string;
  userId: string;
  rating: number;
  verifiedType: 'booking' | 'consultation';
}

export interface FraudSignalCreatedEvent {
  eventType: 'fraud.signal.created';
  userId: string;
  signalType: string;
  riskScore: number;
  triggeredBy: string;
}

export interface PayoutProcessedEvent {
  eventType: 'payout.processed';
  batchId: string;
  providerId: string;
  amountPaise: number;
  utr: string;
}

export interface PostPublishedEvent {
  eventType: 'post.published';
  postId: string;
  authorId: string;
  postCreatedAt: string; // ISO-8601
}
