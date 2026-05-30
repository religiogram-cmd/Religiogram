import { Test, TestingModule } from '@nestjs/testing';
import { EventRemindersController } from './event-reminders.controller';
import { EventRemindersService } from './event-reminders.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRemindersService = {
  subscribe:   jest.fn().mockResolvedValue({ id: 'rem-1' }),
  unsubscribe: jest.fn().mockResolvedValue({ success: true }),
  listMine:    jest.fn().mockResolvedValue([]),
  getIcs:      jest.fn().mockResolvedValue({ filename: 'event.ics', body: 'BEGIN:VCALENDAR' }),
};

function fakeUser(id = 'user-1'): any { return { id }; }

const PLACE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const EVENT_UUID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('EventRemindersController', () => {
  let ctrl: EventRemindersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventRemindersController],
      providers: [{ provide: EventRemindersService, useValue: mockRemindersService }],
    }).compile();

    ctrl = module.get<EventRemindersController>(EventRemindersController);
  });

  // ── subscribe() ───────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('delegates with placeId, eventId, userId, leadMinutes', async () => {
      const result = await ctrl.subscribe(PLACE_UUID, EVENT_UUID, { leadMinutes: 30 }, fakeUser());
      expect(mockRemindersService.subscribe).toHaveBeenCalledWith(
        PLACE_UUID, EVENT_UUID, 'user-1', 30,
      );
      expect(result).toHaveProperty('id', 'rem-1');
    });

    it('passes undefined leadMinutes when body is empty', async () => {
      await ctrl.subscribe(PLACE_UUID, EVENT_UUID, {}, fakeUser());
      expect(mockRemindersService.subscribe).toHaveBeenCalledWith(
        PLACE_UUID, EVENT_UUID, 'user-1', undefined,
      );
    });
  });

  // ── unsubscribe() ─────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('delegates with placeId, eventId, userId', async () => {
      await ctrl.unsubscribe(PLACE_UUID, EVENT_UUID, fakeUser('user-2'));
      expect(mockRemindersService.unsubscribe).toHaveBeenCalledWith(
        PLACE_UUID, EVENT_UUID, 'user-2',
      );
    });
  });

  // ── listMine() ────────────────────────────────────────────────────────────

  describe('listMine()', () => {
    it('delegates to remindersService.listMine with userId', async () => {
      await ctrl.listMine(fakeUser('user-3'));
      expect(mockRemindersService.listMine).toHaveBeenCalledWith('user-3');
    });
  });

  // ── ics() ─────────────────────────────────────────────────────────────────

  describe('ics()', () => {
    it('sets Content-Disposition and Cache-Control headers then sends body', async () => {
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await ctrl.ics(PLACE_UUID, EVENT_UUID, res);
      expect(mockRemindersService.getIcs).toHaveBeenCalledWith(PLACE_UUID, EVENT_UUID);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="event.ics"',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=600');
      expect(res.send).toHaveBeenCalledWith('BEGIN:VCALENDAR');
    });
  });
});
