import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { DisputeMessage } from './entities/dispute-message.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const DISPUTE_ID  = 'disp-1';
const USER_ID     = 'user-1';
const ADMIN_ID    = 'admin-1';
const BOOKING_ID  = 'book-1';

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id:               DISPUTE_ID,
    disputeRef:       'RG-D-ABCDEF12',
    raisedById:       USER_ID,
    referenceId:      BOOKING_ID,
    referenceType:    'booking',
    title:            'Service not rendered',
    description:      'Provider did not show up',
    status:           DisputeStatus.RAISED,
    slaDeadline:      new Date(Date.now() + 48 * 3600 * 1000),
    evidence:         [],
    refundAmountPaise:0,
    resolvedById:     null as any,
    resolutionNote:   null as any,
    resolvedAt:       null as any,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    ...overrides,
  } as unknown as Dispute;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let storedDispute = makeDispute();

const mockQB = {
  where:    jest.fn().mockReturnThis(),
  orderBy:  jest.fn().mockReturnThis(),
  getMany:  jest.fn().mockResolvedValue([storedDispute]),
};

const mockDisputeRepo = {
  findOne:            jest.fn().mockImplementation(() => Promise.resolve(storedDispute)),
  find:               jest.fn().mockImplementation(() => Promise.resolve([storedDispute])),
  create:             jest.fn().mockImplementation((d: any) => ({ ...d, id: DISPUTE_ID })),
  save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  createQueryBuilder: jest.fn().mockReturnValue(mockQB),
};

const mockMessageRepo = {
  create: jest.fn().mockImplementation((d: any) => d),
  save:   jest.fn().mockImplementation((d: any) => Promise.resolve({ id: 'msg-1', ...d })),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('DisputeService', () => {
  let svc: DisputeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    storedDispute = makeDispute();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: getRepositoryToken(Dispute),        useValue: mockDisputeRepo },
        { provide: getRepositoryToken(DisputeMessage), useValue: mockMessageRepo },
      ],
    }).compile();

    svc = module.get<DisputeService>(DisputeService);
  });

  // ── raise ──────────────────────────────────────────────────────────────────

  describe('raise()', () => {
    it('creates a dispute with RAISED status and 48h SLA deadline', async () => {
      const dto = {
        referenceId: BOOKING_ID,
        referenceType: 'booking',
        title: 'No-show',
        description: 'Provider did not arrive',
      };
      await svc.raise(USER_ID, dto as any);

      expect(mockDisputeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          raisedById:    USER_ID,
          status:        DisputeStatus.RAISED,
          refundAmountPaise: 0,
        }),
      );
      // SLA deadline should be ~48h in the future
      const createdArg = mockDisputeRepo.create.mock.calls[0][0];
      const diffMs = createdArg.slaDeadline.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(47 * 3600 * 1000);
      expect(diffMs).toBeLessThan(49 * 3600 * 1000);
    });
  });

  // ── investigate ────────────────────────────────────────────────────────────

  describe('investigate()', () => {
    it('sets status to UNDER_INVESTIGATION and records adminId', async () => {
      const result = await svc.investigate(DISPUTE_ID, ADMIN_ID);
      expect(result.status).toBe(DisputeStatus.UNDER_INVESTIGATION);
      expect(result.resolvedById).toBe(ADMIN_ID);
    });

    it('throws NotFoundException when dispute does not exist', async () => {
      mockDisputeRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.investigate('nope', ADMIN_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── resolveForUser ─────────────────────────────────────────────────────────

  describe('resolveForUser()', () => {
    it('sets RESOLVED_FOR_USER status and records refund amount', async () => {
      const dto = { note: 'User wins', refundAmountPaise: 10000 };
      const result = await svc.resolveForUser(DISPUTE_ID, ADMIN_ID, dto as any);

      expect(result.status).toBe(DisputeStatus.RESOLVED_FOR_USER);
      expect(result.refundAmountPaise).toBe(10000);
      expect(result.resolvedAt).toBeDefined();
    });

    it('records the resolution note', async () => {
      const dto = { note: 'Provider was absent', refundAmountPaise: 5000 };
      const result = await svc.resolveForUser(DISPUTE_ID, ADMIN_ID, dto as any);
      expect(result.resolutionNote).toBe('Provider was absent');
    });
  });

  // ── resolveForProvider ─────────────────────────────────────────────────────

  describe('resolveForProvider()', () => {
    it('sets RESOLVED_FOR_PROVIDER status with zero refund', async () => {
      const dto = { note: 'Provider completed the service' };
      const result = await svc.resolveForProvider(DISPUTE_ID, ADMIN_ID, dto as any);

      expect(result.status).toBe(DisputeStatus.RESOLVED_FOR_PROVIDER);
      expect(result.resolvedById).toBe(ADMIN_ID);
      expect(result.resolvedAt).toBeDefined();
    });
  });

  // ── escalate ───────────────────────────────────────────────────────────────

  describe('escalate()', () => {
    it('sets ESCALATED status', async () => {
      const result = await svc.escalate(DISPUTE_ID, ADMIN_ID);
      expect(result.status).toBe(DisputeStatus.ESCALATED);
    });
  });

  // ── addMessage ─────────────────────────────────────────────────────────────

  describe('addMessage()', () => {
    it('saves a message linked to the dispute', async () => {
      const msg = await svc.addMessage(DISPUTE_ID, USER_ID, 'user', 'I want a refund');
      expect(msg.disputeId).toBe(DISPUTE_ID);
      expect(msg.message).toBe('I want a refund');
      expect(msg.senderRole).toBe('user');
    });

    it('throws NotFoundException for non-existent dispute', async () => {
      mockDisputeRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.addMessage('bad-id', USER_ID, 'user', 'test'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getUserDisputes ────────────────────────────────────────────────────────

  describe('getUserDisputes()', () => {
    it('returns disputes for the given user sorted by createdAt DESC', async () => {
      const disputes = await svc.getUserDisputes(USER_ID);
      expect(mockDisputeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { raisedById: USER_ID },
          order: { createdAt: 'DESC' },
        }),
      );
      expect(disputes.length).toBeGreaterThan(0);
    });
  });

  // ── getAdminQueue ──────────────────────────────────────────────────────────

  describe('getAdminQueue()', () => {
    it('returns unresolved disputes ordered by SLA deadline', async () => {
      const queue = await svc.getAdminQueue();
      expect(mockDisputeRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQB.orderBy).toHaveBeenCalledWith('d.sla_deadline', 'ASC');
      expect(queue.length).toBeGreaterThan(0);
    });

    it('filters by status when provided', async () => {
      await svc.getAdminQueue('RAISED');
      expect(mockQB.where).toHaveBeenCalledWith('d.status = :status', { status: 'RAISED' });
    });
  });
});
