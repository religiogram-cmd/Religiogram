import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { DeviceToken, DevicePlatform } from './entities/device-token.entity';
import { PUSH_NOTIFICATION_QUEUE } from './push-notification.queue';

// ── mocks ─────────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';

const mockNotificationStub = (overrides: any = {}): Notification =>
  ({
    id:        'notif-1',
    userId:    USER_ID,
    type:      NotificationType.BOOKING_CONFIRMED,
    title:     'Test',
    body:      'Hello',
    isRead:    false,
    data:      null,
    createdAt: new Date(),
    readAt:    null,
    ...overrides,
  } as unknown as Notification);

// QueryBuilder mock factory — returns a fresh instance each call so
// tests can chain andWhere/set/execute independently.
function makeQB(executeResult = { affected: 1 }) {
  const qb: any = {};
  qb.update     = jest.fn().mockReturnValue(qb);
  qb.set        = jest.fn().mockReturnValue(qb);
  qb.where      = jest.fn().mockReturnValue(qb);
  qb.andWhere   = jest.fn().mockReturnValue(qb);
  qb.orderBy    = jest.fn().mockReturnValue(qb);
  qb.limit      = jest.fn().mockReturnValue(qb);
  qb.select     = jest.fn().mockReturnValue(qb);
  qb.execute    = jest.fn().mockResolvedValue(executeResult);
  qb.getMany    = jest.fn().mockResolvedValue([mockNotificationStub()]);
  return qb;
}

const notifQB = makeQB();
const mockNotificationRepo = {
  create:             jest.fn().mockImplementation((d: any) => mockNotificationStub(d)),
  save:               jest.fn().mockImplementation((d: any) => Promise.resolve(Array.isArray(d) ? d : mockNotificationStub(d))),
  count:              jest.fn().mockResolvedValue(3),
  createQueryBuilder: jest.fn().mockReturnValue(notifQB),
};

const mockDeviceTokenStub = {
  id: 'dt-1', userId: USER_ID, token: 'fcm-token-abc', platform: DevicePlatform.ANDROID, isActive: true,
};

const devQB = makeQB();
const mockDeviceTokenRepo = {
  findOne:            jest.fn().mockResolvedValue(null),
  find:               jest.fn().mockResolvedValue([mockDeviceTokenStub]),
  create:             jest.fn().mockImplementation((d: any) => d),
  save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  createQueryBuilder: jest.fn().mockReturnValue(devQB),
};

const mockPushQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockConfig = { get: jest.fn() };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let svc: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset QB mocks to fresh instances
    Object.assign(notifQB, makeQB());
    Object.assign(devQB,   makeQB());

    // Ensure createQueryBuilder always returns the same shared QB
    mockNotificationRepo.createQueryBuilder.mockReturnValue(notifQB);
    mockDeviceTokenRepo.createQueryBuilder.mockReturnValue(devQB);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockNotificationRepo },
        { provide: getRepositoryToken(DeviceToken),  useValue: mockDeviceTokenRepo },
        { provide: getQueueToken(PUSH_NOTIFICATION_QUEUE), useValue: mockPushQueue },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<NotificationsService>(NotificationsService);
  });

  // ── send ───────────────────────────────────────────────────────────────────

  describe('send()', () => {
    it('persists notification and enqueues FCM push job', async () => {
      await svc.send(USER_ID, NotificationType.BOOKING_CONFIRMED, 'Booking confirmed', 'Your booking is set');
      expect(mockNotificationRepo.save).toHaveBeenCalled();
      expect(mockPushQueue.add).toHaveBeenCalledWith(
        'send-single',
        expect.objectContaining({ userId: USER_ID, title: 'Booking confirmed' }),
        expect.any(Object),
      );
    });

    it('returns the persisted notification record', async () => {
      const result = await svc.send(USER_ID, NotificationType.SYSTEM, 'Hi', 'Body');
      expect(result.userId).toBe(USER_ID);
    });
  });

  // ── sendBatch ──────────────────────────────────────────────────────────────

  describe('sendBatch()', () => {
    it('does nothing when userIds is empty', async () => {
      await svc.sendBatch([], NotificationType.SYSTEM, 'T', 'B');
      expect(mockNotificationRepo.save).not.toHaveBeenCalled();
    });

    it('bulk-inserts one row per user and enqueues a single batch job', async () => {
      await svc.sendBatch(['u1', 'u2', 'u3'], NotificationType.PROMO, 'Sale', 'Off');
      expect(mockNotificationRepo.save).toHaveBeenCalledTimes(1);
      expect(mockPushQueue.add).toHaveBeenCalledWith(
        'send-batch',
        expect.objectContaining({ userIds: ['u1', 'u2', 'u3'] }),
        expect.any(Object),
      );
    });
  });

  // ── countUnread ────────────────────────────────────────────────────────────

  describe('countUnread()', () => {
    it('returns unread count from DB', async () => {
      mockNotificationRepo.count.mockResolvedValueOnce(7);
      const count = await svc.countUnread(USER_ID);
      expect(count).toBe(7);
      expect(mockNotificationRepo.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, isRead: false },
      });
    });
  });

  // ── markOneRead ────────────────────────────────────────────────────────────

  describe('markOneRead()', () => {
    it('issues an UPDATE filtered by user_id and notification id', async () => {
      await svc.markOneRead(USER_ID, 'notif-42');
      expect(notifQB.where).toHaveBeenCalledWith('id = :id', { id: 'notif-42' });
      expect(notifQB.andWhere).toHaveBeenCalledWith('user_id = :userId', { userId: USER_ID });
      expect(notifQB.execute).toHaveBeenCalled();
    });
  });

  // ── markAllRead ────────────────────────────────────────────────────────────

  describe('markAllRead()', () => {
    it('issues a bulk UPDATE for the user', async () => {
      await svc.markAllRead(USER_ID);
      expect(notifQB.set).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: true }),
      );
      expect(notifQB.where).toHaveBeenCalledWith('user_id = :userId', { userId: USER_ID });
      expect(notifQB.execute).toHaveBeenCalled();
    });
  });

  // ── registerDevice ─────────────────────────────────────────────────────────

  describe('registerDevice()', () => {
    it('creates a new device token when none exists', async () => {
      mockDeviceTokenRepo.findOne.mockResolvedValueOnce(null);
      await svc.registerDevice(USER_ID, { token: 'fcm-new', platform: DevicePlatform.IOS });
      expect(mockDeviceTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, token: 'fcm-new', isActive: true }),
      );
      expect(mockDeviceTokenRepo.save).toHaveBeenCalled();
    });

    it('updates existing token record when already registered', async () => {
      const existing = { ...mockDeviceTokenStub, userId: 'other-user' };
      mockDeviceTokenRepo.findOne.mockResolvedValueOnce(existing);
      await svc.registerDevice(USER_ID, { token: 'fcm-token-abc', platform: DevicePlatform.ANDROID });
      // userId should be claimed for the current user
      expect(mockDeviceTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
      );
    });
  });

  // ── unregisterDevice ───────────────────────────────────────────────────────

  describe('unregisterDevice()', () => {
    it('deactivates the token for the user', async () => {
      await svc.unregisterDevice(USER_ID, 'fcm-token-abc');
      expect(devQB.set).toHaveBeenCalledWith({ isActive: false });
      expect(devQB.where).toHaveBeenCalledWith('user_id = :userId', { userId: USER_ID });
      expect(devQB.andWhere).toHaveBeenCalledWith('token = :token', { token: 'fcm-token-abc' });
      expect(devQB.execute).toHaveBeenCalled();
    });
  });

  // ── getMyNotifications ─────────────────────────────────────────────────────

  describe('getMyNotifications()', () => {
    it('returns items, nextCursor null, and unreadCount', async () => {
      notifQB.getMany.mockResolvedValueOnce([mockNotificationStub()]);
      mockNotificationRepo.count.mockResolvedValueOnce(2);

      const result = await svc.getMyNotifications(USER_ID);
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(result.unreadCount).toBe(2);
    });

    it('provides nextCursor when more items exist', async () => {
      // Return limit+1 items to trigger hasMore
      const items = Array.from({ length: 21 }, (_, i) =>
        mockNotificationStub({ id: `n-${i}`, createdAt: new Date(Date.now() - i * 1000) }),
      );
      notifQB.getMany.mockResolvedValueOnce(items);
      mockNotificationRepo.count.mockResolvedValueOnce(5);

      const result = await svc.getMyNotifications(USER_ID, undefined, 20);
      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).not.toBeNull();
    });
  });
});
