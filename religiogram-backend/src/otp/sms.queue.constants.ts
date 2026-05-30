/**
 * BullMQ queue name and job type constants for SMS dispatch.
 *
 * Keeping names in one place prevents typo-driven silent failures
 * (e.g. enqueuing to 'sms' but processing from 'sms-queue').
 */
export const SMS_QUEUE = 'sms';

export const SMS_JOB = {
  SEND_OTP: 'send-otp',
} as const;

export interface SendOtpJobData {
  phone: string;
  otp: string;
}
