import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockNotificationsService = {
  getMyNotifications: jest.fn().mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 }),
  countUnread:        jest.fn().mockResolvedValue(3),
  markOneRead:        jest.fn().mockResolvedValue(undefined),
  markRead:           jest.fn().mockResolvedValue(undefined),
  markAllRead:        jest.fn().mockResolvedValue(undefined),
  registerDevice:     jest.fn().mockResolvedValue({ id: 'device-1' }),
  unregisterDevice:   jest.fn().mockResolvedValue(undefined),
};

function fakeUser(id = 'user-1'): any {
  return { id };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('NotificationsController', () => {
  let ctrl: NotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    ctrl = module.get<NotificationsController>(NotificationsController);
  });

  // ── getMyNotifications() ───────────────────────────────────────────────────

  describe('getMyNotifications()', () => {
    it('delegates to notificationsService with userId, cursor, limit', async () => {
      const dto: any = { cursor: '2024-01-01T00:00:00.000Z', limit: 20 };
      const result = await ctrl.getMyNotifications(fakeUser(), dto);
      expect(mockNotificationsService.getMyNotifications).toHaveBeenCalledWith(
        'user-1',
        dto.cursor,
        dto.limit,
      );
      expect(result).toHaveProperty('items');
    });

    it('passes undefined cursor and limit when not provided in dto', async () => {
      const dto: any = {};
      await ctrl.getMyNotifications(fakeUser(), dto);
      expect(mockNotificationsService.getMyNotifications).toHaveBeenCalledWith(
        'user-1',
        undefined,
        undefined,
      );
    });
  });

  // ── unreadCount() ──────────────────────────────────────────────────────────

  describe('unreadCount()', () => {
    it('returns { count } from notificationsService.countUnread', async () => {
      mockNotificationsService.countUnread.mockResolvedValueOnce(7);
      const result = await ctrl.unreadCount(fakeUser());
      expect(mockNotificationsService.countUnread).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ count: 7 });
    });

    it('returns count=0 when no unread notifications', async () => {
      mockNotificationsService.countUnread.mockResolvedValueOnce(0);
      const result = await ctrl.unreadCount(fakeUser());
      expect(result.count).toBe(0);
    });
  });

  // ── markOneRead() ──────────────────────────────────────────────────────────

  describe('markOneRead()', () => {
    it('delegates to notificationsService.markOneRead with userId and notif id', async () => {
      await ctrl.markOneRead(fakeUser(), 'notif-uuid-1');
      expect(mockNotificationsService.markOneRead).toHaveBeenCalledWith('user-1', 'notif-uuid-1');
    });
  });

  // ── markRead() ─────────────────────────────────────────────────────────────

  describe('markRead()', () => {
    it('delegates to notificationsService.markRead with userId and ids array', async () => {
      const dto: any = { ids: ['notif-1', 'notif-2'] };
      await ctrl.markRead(fakeUser(), dto);
      expect(mockNotificationsService.markRead).toHaveBeenCalledWith('user-1', ['notif-1', 'notif-2']);
    });
  });

  // ── markAllRead() ──────────────────────────────────────────────────────────

  describe('markAllRead()', () => {
    it('delegates to notificationsService.markAllRead with userId', async () => {
      await ctrl.markAllRead(fakeUser());
      expect(mockNotificationsService.markAllRead).toHaveBeenCalledWith('user-1');
    });
  });

  // ── registerDevice() ───────────────────────────────────────────────────────

  describe('registerDevice()', () => {
    it('delegates to notificationsService.registerDevice with userId and dto', async () => {
      const dto: any = { token: 'fcm-token-abc', platform: 'android' };
      mockNotificationsService.registerDevice.mockResolvedValueOnce({ id: 'device-42' });
      const result = await ctrl.registerDevice(fakeUser(), dto);
      expect(mockNotificationsService.registerDevice).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'device-42' });
    });
  });

  // ── unregisterDevice() ─────────────────────────────────────────────────────

  describe('unregisterDevice()', () => {
    it('delegates to notificationsService.unregisterDevice with userId and token', async () => {
      await ctrl.unregisterDevice(fakeUser(), 'fcm-token-abc');
      expect(mockNotificationsService.unregisterDevice).toHaveBeenCalledWith(
        'user-1',
        'fcm-token-abc',
      );
    });
  });
});
