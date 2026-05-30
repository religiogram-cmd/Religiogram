import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRemindersService,
  REMINDER_DISPATCH_BATCH,
} from './event-reminders.service';
import { EventReminder } from './entities/event-reminder.entity';
import { PlaceEvent } from './entities/place-event.entity';
import { Temple } from '../temples/entities/temple.entity';
import { DataSource } from 'typeorm';

// ── QB factories ──────────────────────────────────────────────────────────────

function makeReminderQB(
  getRawMany = jest.fn().mockResolvedValue([]),
  getMany    = jest.fn().mockResolvedValue([]),
) {
  const qb: any = {
    leftJoin:   jest.fn().mockReturnThis(),
    where:      jest.fn().mockReturnThis(),
    andWhere:   jest.fn().mockReturnThis(),
    orderBy:    jest.fn().mockReturnThis(),
    limit:      jest.fn().mockReturnThis(),
    select:     jest.fn().mockReturnThis(),
    update:     jest.fn().mockReturnThis(),
    set:        jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    setLock:    jest.fn().mockReturnThis(),
    setOnLocked:jest.fn().mockReturnThis(),
    execute:    jest.fn().mockResolvedValue({ affected: 1 }),
    getRawMany,
    getRawOne:  jest.fn().mockResolvedValue(null),
    getMany,
  };
  return qb;
}

function makeEventsQB(getRawOne = jest.fn().mockResolvedValue(null)) {
  const qb: any = {
    leftJoin: jest.fn().mockReturnThis(),
    where:    jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    getRawOne,
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

const FUTURE_MS = Date.now() + 4 * 60 * 60 * 1000; // 4 hours from now

function makePlaceEvent(overrides: any = {}): PlaceEvent {
  return {
    id:        'event-1',
    placeId:   'place-1',
    title:     'Maha Aarti',
    startTime: new Date(FUTURE_MS),
    endTime:   null,
    recurring: false,
    ...overrides,
  } as unknown as PlaceEvent;
}

function makeReminder(overrides: any = {}): EventReminder {
  return {
    id:        'reminder-1',
    eventId:   'event-1',
    userId:    'user-1',
    remindAt:  new Date(FUTURE_MS - 60 * 60 * 1000),
    status:    'scheduled' as any,
    sent:      false,
    sentAt:    null,
    error:     null,
    createdAt: new Date(),
    ...overrides,
  } as unknown as EventReminder;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let reminderQB = makeReminderQB();
let eventQB    = makeEventsQB();

const mockReminderRepo = {
  createQueryBuilder: jest.fn(() => reminderQB),
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeReminder(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeReminder(), ...d })),
};

const mockEventRepo = {
  createQueryBuilder: jest.fn(() => eventQB),
  findOne: jest.fn().mockResolvedValue(makePlaceEvent()),
};

// Transaction mock — simulates a real EntityManager with getRepository/QB
const txReminderQB = makeReminderQB(
  jest.fn().mockResolvedValue([]),
  jest.fn().mockResolvedValue([]),
);
const txRepo = {
  createQueryBuilder: jest.fn(() => txReminderQB),
  findOne:  jest.fn(),
  save:     jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
};
const mockTxManager = {
  getRepository: jest.fn().mockReturnValue(txRepo),
};
const mockDs = {
  transaction: jest.fn().mockImplementation(
    (fn: (em: any) => Promise<any>) => fn(mockTxManager),
  ),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('EventRemindersService', () => {
  let svc: EventRemindersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    reminderQB = makeReminderQB();
    eventQB    = makeEventsQB();
    mockReminderRepo.createQueryBuilder.mockReturnValue(reminderQB);
    mockEventRepo.createQueryBuilder.mockReturnValue(eventQB);
    mockReminderRepo.findOne.mockResolvedValue(null);
    mockEventRepo.findOne.mockResolvedValue(makePlaceEvent());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRemindersService,
        { provide: getRepositoryToken(EventReminder), useValue: mockReminderRepo },
        { provide: getRepositoryToken(PlaceEvent),    useValue: mockEventRepo },
        { provide: DataSource,                        useValue: mockDs },
      ],
    }).compile();

    svc = module.get<EventRemindersService>(EventRemindersService);
  });

  // ── subscribe ──────────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('throws NotFoundException when event does not exist', async () => {
      mockEventRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.subscribe('place-1', 'event-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when event has already started', async () => {
      // Event in the past
      mockEventRepo.findOne.mockResolvedValueOnce(
        makePlaceEvent({ startTime: new Date(Date.now() - 60_000) }),
      );
      await expect(
        svc.subscribe('place-1', 'event-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when event is too far in the future (>365 days)', async () => {
      // Event more than 1 year out + 1 hour default lead time means remindAt is > 365 days
      const farFuture = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000);
      mockEventRepo.findOne.mockResolvedValueOnce(
        makePlaceEvent({ startTime: farFuture }),
      );
      await expect(
        svc.subscribe('place-1', 'event-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when user already has a scheduled reminder', async () => {
      mockReminderRepo.findOne.mockResolvedValueOnce(makeReminder({ status: 'scheduled' }));
      await expect(
        svc.subscribe('place-1', 'event-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('calculates remindAt as startTime minus default lead (1 hour)', async () => {
      const startTime = new Date(FUTURE_MS);
      mockEventRepo.findOne.mockResolvedValueOnce(makePlaceEvent({ startTime }));

      await svc.subscribe('place-1', 'event-1', 'user-1');

      const savedArg = mockReminderRepo.save.mock.calls[0][0];
      const expectedRemindAt = new Date(startTime.getTime() - 60 * 60 * 1000);
      // Allow ±2 second tolerance
      expect(Math.abs(savedArg.remindAt.getTime() - expectedRemindAt.getTime())).toBeLessThan(2000);
    });

    it('uses custom leadMinutes when provided', async () => {
      const startTime = new Date(FUTURE_MS);
      mockEventRepo.findOne.mockResolvedValueOnce(makePlaceEvent({ startTime }));

      await svc.subscribe('place-1', 'event-1', 'user-1', 30);

      const savedArg = mockReminderRepo.save.mock.calls[0][0];
      const expectedRemindAt = new Date(startTime.getTime() - 30 * 60 * 1000);
      expect(Math.abs(savedArg.remindAt.getTime() - expectedRemindAt.getTime())).toBeLessThan(2000);
    });

    it('uses default lead when leadMinutes is undefined', async () => {
      await svc.subscribe('place-1', 'event-1', 'user-1', undefined);
      expect(mockReminderRepo.save).toHaveBeenCalled();
    });

    it('saves reminder with status=scheduled and returns DTO', async () => {
      const result = await svc.subscribe('place-1', 'event-1', 'user-1');
      expect(mockReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'scheduled', sent: false }),
      );
      expect(result.status).toBe('scheduled');
      expect(result.eventId).toBe('event-1');
    });
  });

  // ── unsubscribe ────────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('throws NotFoundException when event does not belong to place', async () => {
      mockEventRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.unsubscribe('bad-place', 'event-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns { success: true } idempotently when no pending reminder exists', async () => {
      mockReminderRepo.findOne.mockResolvedValueOnce(null);
      const result = await svc.unsubscribe('place-1', 'event-1', 'user-1');
      expect(result.success).toBe(true);
      expect(mockReminderRepo.save).not.toHaveBeenCalled();
    });

    it('flips status to cancelled and saves', async () => {
      const reminder = makeReminder({ status: 'scheduled' });
      mockReminderRepo.findOne.mockResolvedValueOnce(reminder);

      const result = await svc.unsubscribe('place-1', 'event-1', 'user-1');
      expect(result.success).toBe(true);
      expect(mockReminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });
  });

  // ── listMine ───────────────────────────────────────────────────────────────

  describe('listMine()', () => {
    it('returns empty array when user has no reminders', async () => {
      reminderQB.getRawMany.mockResolvedValueOnce([]);
      const result = await svc.listMine('user-1');
      expect(result).toEqual([]);
    });

    it('builds QB with correct userId filter', async () => {
      reminderQB.getRawMany.mockResolvedValueOnce([]);
      await svc.listMine('user-1');
      expect(reminderQB.where).toHaveBeenCalledWith(
        expect.stringContaining('user_id'),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('filters by statuses scheduled and sent', async () => {
      reminderQB.getRawMany.mockResolvedValueOnce([]);
      await svc.listMine('user-1');
      expect(reminderQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.objectContaining({ statuses: expect.arrayContaining(['scheduled', 'sent']) }),
      );
    });

    it('filters out rows with dangling foreign keys (no eEventId)', async () => {
      reminderQB.getRawMany.mockResolvedValueOnce([
        {
          id: 'r-1', eventId: 'e-1', userId: 'user-1',
          remindAt: new Date(FUTURE_MS), status: 'scheduled', createdAt: new Date(),
          eEventId: 'e-1', eTitle: 'Aarti', eStartTime: new Date(FUTURE_MS),
          eEndTime: null, eRecurring: false,
          pPlaceId: 'place-1', pName: 'Kashi Vishwanath', pCity: 'varanasi', pType: 'temple',
        },
        // dangling row — no eEventId
        {
          id: 'r-2', eventId: 'e-missing', userId: 'user-1',
          remindAt: new Date(FUTURE_MS), status: 'scheduled', createdAt: new Date(),
          eEventId: null, eTitle: null, eStartTime: null, eEndTime: null, eRecurring: null,
          pPlaceId: null, pName: null, pCity: null, pType: null,
        },
      ]);

      const result = await svc.listMine('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r-1');
    });

    it('returns MyReminderDto with nested event and place', async () => {
      reminderQB.getRawMany.mockResolvedValueOnce([
        {
          id: 'r-1', eventId: 'e-1', userId: 'user-1',
          remindAt: new Date(FUTURE_MS), status: 'scheduled', createdAt: new Date(),
          eEventId: 'e-1', eTitle: 'Maha Aarti', eStartTime: new Date(FUTURE_MS),
          eEndTime: null, eRecurring: true,
          pPlaceId: 'place-1', pName: 'Kashi Vishwanath', pCity: 'varanasi', pType: 'temple',
        },
      ]);

      const result = await svc.listMine('user-1');
      expect(result[0].event.title).toBe('Maha Aarti');
      expect(result[0].event.recurring).toBe(true);
      expect(result[0].place.name).toBe('Kashi Vishwanath');
      expect(result[0].place.city).toBe('varanasi');
    });
  });

  // ── dispatchDue ────────────────────────────────────────────────────────────

  describe('dispatchDue()', () => {
    beforeEach(() => {
      // Reset txRepo QB for each test
      Object.assign(txReminderQB, makeReminderQB());
      txRepo.createQueryBuilder.mockReturnValue(txReminderQB);
    });

    it('returns { picked:0, sent:0, failed:0 } when no reminders are due', async () => {
      txReminderQB.getMany.mockResolvedValueOnce([]);
      const result = await svc.dispatchDue();
      expect(result).toEqual({ picked: 0, sent: 0, failed: 0 });
    });

    it('uses FOR UPDATE SKIP LOCKED to prevent duplicate dispatch', async () => {
      txReminderQB.getMany.mockResolvedValueOnce([]);
      await svc.dispatchDue();
      expect(txReminderQB.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(txReminderQB.setOnLocked).toHaveBeenCalledWith('skip_locked');
    });

    it('flips sent reminders to status=sent in a batch update', async () => {
      const r1 = makeReminder({ id: 'r-1' });
      const r2 = makeReminder({ id: 'r-2' });
      txReminderQB.getMany.mockResolvedValueOnce([r1, r2]);

      await svc.dispatchDue();

      // A second createQueryBuilder call should have been made for the batch UPDATE
      expect(txRepo.createQueryBuilder).toHaveBeenCalled();
      expect(txReminderQB.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'sent', sent: true }),
      );
      expect(txReminderQB.whereInIds).toHaveBeenCalledWith(['r-1', 'r-2']);
    });

    it('returns correct sent count', async () => {
      txReminderQB.getMany.mockResolvedValueOnce([
        makeReminder({ id: 'r-1' }),
        makeReminder({ id: 'r-2' }),
      ]);
      const result = await svc.dispatchDue();
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.picked).toBe(2);
    });

    it('respects REMINDER_DISPATCH_BATCH limit', async () => {
      txReminderQB.getMany.mockResolvedValueOnce([]);
      await svc.dispatchDue();
      expect(txReminderQB.limit).toHaveBeenCalledWith(REMINDER_DISPATCH_BATCH);
    });

    it('runs inside a database transaction', async () => {
      txReminderQB.getMany.mockResolvedValueOnce([]);
      await svc.dispatchDue();
      expect(mockDs.transaction).toHaveBeenCalled();
    });
  });

  // ── getIcs ─────────────────────────────────────────────────────────────────

  describe('getIcs()', () => {
    it('throws NotFoundException when event does not exist', async () => {
      eventQB.getRawOne.mockResolvedValueOnce(null);
      await expect(svc.getIcs('place-1', 'bad-event')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns valid ICS body with VCALENDAR wrapper', async () => {
      eventQB.getRawOne.mockResolvedValueOnce({
        id:          'event-1',
        title:       'Maha Aarti',
        description: 'Evening prayer',
        startTime:   new Date(FUTURE_MS),
        endTime:     null,
        recurring:   false,
        placeName:   'Kashi Vishwanath',
        placeCity:   'varanasi',
        placeAddress:'Vishwanath Gali',
      });

      const result = await svc.getIcs('place-1', 'event-1');
      expect(result.body).toContain('BEGIN:VCALENDAR');
      expect(result.body).toContain('END:VCALENDAR');
      expect(result.body).toContain('BEGIN:VEVENT');
      expect(result.body).toContain('SUMMARY:Maha Aarti');
      expect(result.body).toContain('LOCATION:');
    });

    it('uses CRLF line endings (RFC 5545)', async () => {
      eventQB.getRawOne.mockResolvedValueOnce({
        id: 'e-1', title: 'Test', description: null,
        startTime: new Date(FUTURE_MS), endTime: null, recurring: false,
        placeName: 'Temple', placeCity: null, placeAddress: null,
      });

      const { body } = await svc.getIcs('place-1', 'e-1');
      expect(body).toContain('\r\n');
    });

    it('returns filename derived from event title', async () => {
      eventQB.getRawOne.mockResolvedValueOnce({
        id: 'e-1', title: 'Maha Aarti Ceremony', description: null,
        startTime: new Date(FUTURE_MS), endTime: null, recurring: false,
        placeName: 'Temple', placeCity: null, placeAddress: null,
      });

      const { filename } = await svc.getIcs('place-1', 'e-1');
      expect(filename).toBe('maha-aarti-ceremony.ics');
    });

    it('adds RRULE:FREQ=WEEKLY for recurring events', async () => {
      eventQB.getRawOne.mockResolvedValueOnce({
        id: 'e-1', title: 'Weekly Aarti', description: null,
        startTime: new Date(FUTURE_MS), endTime: null, recurring: true,
        placeName: 'Temple', placeCity: null, placeAddress: null,
      });

      const { body } = await svc.getIcs('place-1', 'e-1');
      expect(body).toContain('RRULE:FREQ=WEEKLY');
    });
  });
});
