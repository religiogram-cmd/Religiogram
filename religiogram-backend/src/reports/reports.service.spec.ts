import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ContentReport, ReportStatus, ReportTargetType } from './entities/content-report.entity';
import { PlaceEvent } from '../places/entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from '../places/entities/place-service.entity';
import { PlacesService } from '../places/places.service';

// ── stubs ─────────────────────────────────────────────────────────────────────

const REPORT_ID  = 'report-1';
const USER_ID    = 'user-1';
const PLACE_ID   = 'place-1';
const EVENT_ID   = 'event-1';
const SERVICE_ID = 'service-1';

function makeReport(overrides: any = {}): ContentReport {
  return {
    id:          REPORT_ID,
    userId:      USER_ID,
    placeId:     PLACE_ID,
    targetType:  ReportTargetType.EVENT,
    targetId:    EVENT_ID,
    reason:      'Inappropriate content',
    status:      'pending' as ReportStatus,
    adminNote:   null,
    reviewedBy:  null,
    reviewedAt:  null,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  } as unknown as ContentReport;
}

// ── Transaction EntityManager mock ────────────────────────────────────────────

const txQB: any = {
  update:  jest.fn().mockReturnThis(),
  set:     jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const txEm: any = {
  findOne:            jest.fn().mockResolvedValue(makeReport()),
  save:               jest.fn().mockImplementation((e: any) => Promise.resolve(e)),
  createQueryBuilder: jest.fn().mockReturnValue(txQB),
};

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockReportsRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeReport(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeReport(), ...d })),
  createQueryBuilder: jest.fn().mockReturnValue({
    leftJoin:    jest.fn().mockReturnThis(),
    select:      jest.fn().mockReturnThis(),
    where:       jest.fn().mockReturnThis(),
    orderBy:     jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    getRawMany:  jest.fn().mockResolvedValue([]),
  }),
};

const mockEventsRepo = {
  findOne: jest.fn().mockResolvedValue({ id: EVENT_ID, placeId: PLACE_ID }),
  update:  jest.fn().mockResolvedValue({ affected: 1 }),
  manager: {
    query: jest.fn().mockResolvedValue([{ owner_id: null }]),
  },
};

const mockServicesRepo = {
  findOne: jest.fn().mockResolvedValue({ id: SERVICE_ID, placeId: PLACE_ID }),
  update:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockPlacesService = {
  bustCaches: jest.fn().mockResolvedValue(undefined),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: any) => cb(txEm)),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ReportsService', () => {
  let svc: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReportsRepo.findOne.mockResolvedValue(null);
    mockEventsRepo.findOne.mockResolvedValue({ id: EVENT_ID, placeId: PLACE_ID });
    mockServicesRepo.findOne.mockResolvedValue({ id: SERVICE_ID, placeId: PLACE_ID });
    mockEventsRepo.manager.query.mockResolvedValue([{ owner_id: null }]);
    txEm.findOne.mockResolvedValue(makeReport());
    txEm.save.mockImplementation((e: any) => Promise.resolve(e));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(ContentReport),    useValue: mockReportsRepo },
        { provide: getRepositoryToken(PlaceEvent),       useValue: mockEventsRepo },
        { provide: getRepositoryToken(PlaceServiceEntity), useValue: mockServicesRepo },
        { provide: PlacesService,                        useValue: mockPlacesService },
        { provide: 'DataSource',                         useValue: mockDataSource },
      ],
    }).compile();

    svc = module.get<ReportsService>(ReportsService);
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit()', () => {
    const dto = {
      placeId:    PLACE_ID,
      targetType: ReportTargetType.EVENT,
      targetId:   EVENT_ID,
      reason:     'Fake event',
    };

    it('creates and returns a new report', async () => {
      const result = await svc.submit(USER_ID, dto as any);
      expect(mockReportsRepo.save).toHaveBeenCalled();
      expect(result.reason).toBeTruthy();
    });

    it('throws ConflictException when user has already reported the target', async () => {
      mockReportsRepo.findOne.mockResolvedValueOnce(makeReport());
      await expect(svc.submit(USER_ID, dto as any)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when event does not exist on the place', async () => {
      mockEventsRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.submit(USER_ID, dto as any)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when service does not exist on the place', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.submit(USER_ID, {
          ...dto,
          targetType: ReportTargetType.SERVICE,
          targetId: SERVICE_ID,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when place owner tries to report own content', async () => {
      // owner_id matches the reporting user
      mockEventsRepo.manager.query.mockResolvedValueOnce([{ owner_id: USER_ID }]);
      await expect(svc.submit(USER_ID, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('trims whitespace from reason before saving', async () => {
      await svc.submit(USER_ID, { ...dto, reason: '  spammy event  ' } as any);
      expect(mockReportsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'spammy event' }),
      );
    });
  });

  // ── review — reject ────────────────────────────────────────────────────────

  describe('review() — reject', () => {
    it('sets status=rejected and saves the note', async () => {
      mockReportsRepo.findOne.mockResolvedValueOnce(makeReport({ status: 'pending' }));

      const result = await svc.review(REPORT_ID, 'admin-1', { action: 'reject', note: 'Not a violation' } as any);

      expect(mockReportsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', adminNote: 'Not a violation', reviewedBy: 'admin-1' }),
      );
    });

    it('throws NotFoundException for unknown report', async () => {
      mockReportsRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.review('bad-id', 'admin-1', { action: 'reject' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when report is already reviewed', async () => {
      mockReportsRepo.findOne.mockResolvedValueOnce(makeReport({ status: 'reviewed' }));
      await expect(
        svc.review(REPORT_ID, 'admin-1', { action: 'reject' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('does NOT bust caches on reject', async () => {
      mockReportsRepo.findOne.mockResolvedValueOnce(makeReport());
      await svc.review(REPORT_ID, 'admin-1', { action: 'reject' } as any);
      expect(mockPlacesService.bustCaches).not.toHaveBeenCalled();
    });
  });

  // ── review — approve ───────────────────────────────────────────────────────

  describe('review() — approve', () => {
    it('runs inside a transaction', async () => {
      await svc.review(REPORT_ID, 'admin-1', { action: 'approve' } as any);
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });

    it('marks report as reviewed and hides the event target', async () => {
      txEm.findOne.mockResolvedValueOnce(makeReport({ targetType: ReportTargetType.EVENT }));
      await svc.review(REPORT_ID, 'admin-1', { action: 'approve' } as any);

      expect(txEm.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'reviewed', reviewedBy: 'admin-1' }),
      );
      expect(txQB.update).toHaveBeenCalledWith(PlaceEvent);
      expect(txQB.set).toHaveBeenCalledWith({ isHidden: true });
    });

    it('hides service target when targetType is SERVICE', async () => {
      txEm.findOne.mockResolvedValueOnce(
        makeReport({ targetType: ReportTargetType.SERVICE, targetId: SERVICE_ID }),
      );
      await svc.review(REPORT_ID, 'admin-1', { action: 'approve' } as any);
      expect(txQB.update).toHaveBeenCalledWith(PlaceServiceEntity);
    });

    it('busts places cache after approve', async () => {
      await svc.review(REPORT_ID, 'admin-1', { action: 'approve' } as any);
      expect(mockPlacesService.bustCaches).toHaveBeenCalled();
    });

    it('throws NotFoundException when report not found in transaction', async () => {
      txEm.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.review(REPORT_ID, 'admin-1', { action: 'approve' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── unhide ─────────────────────────────────────────────────────────────────

  describe('unhide()', () => {
    it('un-hides an event and busts cache', async () => {
      const result = await svc.unhide(ReportTargetType.EVENT, EVENT_ID);
      expect(mockEventsRepo.update).toHaveBeenCalledWith(
        { id: EVENT_ID },
        { isHidden: false },
      );
      expect(mockPlacesService.bustCaches).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('un-hides a service and busts cache', async () => {
      const result = await svc.unhide(ReportTargetType.SERVICE, SERVICE_ID);
      expect(mockServicesRepo.update).toHaveBeenCalledWith(
        { id: SERVICE_ID },
        { isHidden: false },
      );
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when event does not exist', async () => {
      mockEventsRepo.update.mockResolvedValueOnce({ affected: 0 });
      await expect(svc.unhide(ReportTargetType.EVENT, 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when service does not exist', async () => {
      mockServicesRepo.update.mockResolvedValueOnce({ affected: 0 });
      await expect(svc.unhide(ReportTargetType.SERVICE, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
