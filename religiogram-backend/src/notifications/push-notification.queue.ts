export const PUSH_NOTIFICATION_QUEUE = 'push-notification';

export const PUSH_JOB = {
  SEND_SINGLE:    'send_single',
  SEND_BATCH:     'send_batch',
  SEND_MULTICAST: 'send_multicast',   // P2-2: pre-resolved tokens — one job = one FCM call
} as const;

export interface SendSinglePushJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendBatchPushJobData {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** P2-2: Job data for a pre-chunked multicast call (max 500 tokens). */
export interface SendMulticastPushJobData {
  tokens: string[];          // max 500 — FCM sendEachForMulticast limit
  title: string;
  body: string;
  data?: Record<string, string>;
}
