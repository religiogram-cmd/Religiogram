/**
 * Central registry of all BullMQ queue names used in ReligioGram.
 *
 * Keep this file as the single source of truth so:
 *   - Queue producers and consumers never use magic strings
 *   - The DLQ subscriber can enumerate all queues at startup
 *   - Adding a new queue means updating one array
 */
export const QUEUE = {
  PUSH_NOTIFICATIONS:    'push-notifications',
  EMAIL:                 'email',
  SMS:                   'sms',
  PAYOUT:                'payout',
  RECONCILIATION:        'reconciliation',
  CONSULTATION_BILLING:  'consultation-billing',
  FRAUD_SCAN:            'fraud-scan',
  WEBHOOK_RETRY:         'webhook-retry',
  // Feed fan-out for high-follower authors (async path when author has
  // > FEED_ASYNC_FANOUT_THRESHOLD accepted friendships).
  FEED_FANOUT:           'feed-fanout',
  // Hourly cleanup of expired stories.
  STORY_EXPIRY:          'story-expiry',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** All registered queue names — used by the DLQ subscriber. */
export const ALL_QUEUES: QueueName[] = Object.values(QUEUE);
