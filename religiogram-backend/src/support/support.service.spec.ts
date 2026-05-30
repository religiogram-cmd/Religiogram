import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';
import { Ticket, TicketStatus, TicketCategory, TicketPriority } from './entities/ticket.entity';
import { TicketMessage, MessageAuthorType } from './entities/ticket-message.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

const TICKET_ID = 'ticket-1';
const USER_ID   = 'user-1';
const AGENT_ID  = 'agent-1';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id:              TICKET_ID,
    ticketRef:       'RG-T-ABCD1234',
    userId:          USER_ID,
    category:        TicketCategory.GENERAL_QUERY,
    priority:        TicketPriority.P4_LOW,
    subject:         'Test ticket',
    description:     'A test description',
    status:          TicketStatus.OPEN,
    slaDeadline:     new Date(Date.now() + 48 * 3600 * 1000),
    reopenCount:     0,
    firstResponseAt: null as any,
    resolvedAt:      null as any,
    resolutionNote:  null as any,
    assignedAgentId: null as any,
    providerId:      null as any,
    bookingId:       null as any,
    sessionId:       null as any,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  } as unknown as Ticket;
}

function makeMessage(overrides: any = {}): TicketMessage {
  return {
    id: 'msg-1', ticketId: TICKET_ID, authorId: USER_ID,
    authorType: MessageAuthorType.USER, body: 'Hello', isInternal: false,
    createdAt: new Date(), ...overrides,
  } as unknown as TicketMessage;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let storedTicket = makeTicket();

const statsQB: any = {
  select:   jest.fn().mockReturnThis(),
  addSelect:jest.fn().mockReturnThis(),
  groupBy:  jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([
    { status: 'open', count: '5' },
    { status: 'resolved', count: '10' },
  ]),
};

const mockTicketRepo = {
  create:             jest.fn().mockImplementation((d: any) => ({ ...makeTicket(), ...d })),
  save:               jest.fn().mockImplementation((d: any) => Promise.resolve(d)),
  findOne:            jest.fn().mockImplementation(() => Promise.resolve(storedTicket)),
  find:               jest.fn().mockResolvedValue([storedTicket]),
  update:             jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue(statsQB),
};

const mockMessageRepo = {
  create: jest.fn().mockImplementation((d: any) => makeMessage(d)),
  save:   jest.fn().mockImplementation((d: any) => Promise.resolve(makeMessage(d))),
  find:   jest.fn().mockResolvedValue([makeMessage()]),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SupportService', () => {
  let svc: SupportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    storedTicket = makeTicket();
    mockTicketRepo.findOne.mockImplementation(() => Promise.resolve(storedTicket));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: getRepositoryToken(Ticket),        useValue: mockTicketRepo },
        { provide: getRepositoryToken(TicketMessage), useValue: mockMessageRepo },
      ],
    }).compile();

    svc = module.get<SupportService>(SupportService);
  });

  // ── Priority derivation ────────────────────────────────────────────────────

  describe('createTicket() — priority derivation', () => {
    const cases: [TicketCategory, TicketPriority, number][] = [
      [TicketCategory.PROVIDER_MISCONDUCT, TicketPriority.P1_CRITICAL,  2],
      [TicketCategory.REFUND_REQUEST,      TicketPriority.P2_HIGH,       8],
      [TicketCategory.WRONG_CHARGES,       TicketPriority.P2_HIGH,       8],
      [TicketCategory.TECHNICAL_ISSUE,     TicketPriority.P3_MEDIUM,    24],
      [TicketCategory.DISPUTE_REVIEW,      TicketPriority.P3_MEDIUM,    24],
      [TicketCategory.GENERAL_QUERY,       TicketPriority.P4_LOW,       48],
    ];

    it.each(cases)(
      'category %s → priority %s with %sh SLA',
      async (category, expectedPriority, slaHours) => {
        const dto = { category, subject: 'Test', description: 'Desc' };
        mockTicketRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

        await svc.createTicket(USER_ID, dto as any);

        const createdArg = mockTicketRepo.create.mock.calls[0][0];
        expect(createdArg.priority).toBe(expectedPriority);

        // SLA deadline should be ~slaHours in the future (±1 min tolerance)
        const diffMs = createdArg.slaDeadline.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan((slaHours - 0.1) * 3600 * 1000);
        expect(diffMs).toBeLessThan((slaHours + 0.1) * 3600 * 1000);

        jest.clearAllMocks();
      },
    );

    it('generates a ticket ref matching RG-T-XXXXXXXX pattern', async () => {
      const dto = { category: TicketCategory.GENERAL_QUERY, subject: 'S', description: 'D' };
      await svc.createTicket(USER_ID, dto as any);
      const created = mockTicketRepo.create.mock.calls[0][0];
      expect(created.ticketRef).toMatch(/^RG-T-[A-Z0-9]{8}$/);
      jest.clearAllMocks();
    });

    it('adds a system message with priority + SLA info on creation', async () => {
      const dto = { category: TicketCategory.REFUND_REQUEST, subject: 'S', description: 'D' };
      await svc.createTicket(USER_ID, dto as any);
      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ authorType: MessageAuthorType.SYSTEM }),
      );
    });
  });

  // ── getTicket ──────────────────────────────────────────────────────────────

  describe('getTicket()', () => {
    it('returns ticket when caller is the owner', async () => {
      const ticket = await svc.getTicket(TICKET_ID, USER_ID);
      expect(ticket.id).toBe(TICKET_ID);
    });

    it('throws ForbiddenException when wrong userId is provided', async () => {
      await expect(svc.getTicket(TICKET_ID, 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for unknown ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getTicket('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── addUserMessage ─────────────────────────────────────────────────────────

  describe('addUserMessage()', () => {
    it('saves message and returns it', async () => {
      const msg = await svc.addUserMessage(TICKET_ID, USER_ID, { body: 'Hello!' } as any);
      expect(msg.body).toBe('Hello!');
      expect(msg.authorType).toBe(MessageAuthorType.USER);
    });

    it('reopens a RESOLVED ticket when user replies within 7 days', async () => {
      storedTicket = makeTicket({
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000), // 2 days ago
        reopenCount: 0,
      });
      mockTicketRepo.findOne.mockResolvedValue(storedTicket);

      await svc.addUserMessage(TICKET_ID, USER_ID, { body: 'Still broken' } as any);

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ status: TicketStatus.REOPENED, reopenCount: 1 }),
      );
    });

    it('does NOT reopen a RESOLVED ticket after 7 days', async () => {
      storedTicket = makeTicket({
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000), // 10 days ago
      });
      mockTicketRepo.findOne.mockResolvedValue(storedTicket);

      await svc.addUserMessage(TICKET_ID, USER_ID, { body: 'Follow-up' } as any);
      expect(mockTicketRepo.update).not.toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ status: TicketStatus.REOPENED }),
      );
    });

    it('transitions AWAITING_USER → IN_REVIEW when user replies', async () => {
      storedTicket = makeTicket({ status: TicketStatus.AWAITING_USER });
      mockTicketRepo.findOne.mockResolvedValue(storedTicket);

      await svc.addUserMessage(TICKET_ID, USER_ID, { body: 'My response' } as any);

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ status: TicketStatus.IN_REVIEW }),
      );
    });
  });

  // ── addAgentMessage ────────────────────────────────────────────────────────

  describe('addAgentMessage()', () => {
    it('records firstResponseAt on the very first agent reply', async () => {
      storedTicket = makeTicket({ firstResponseAt: null });
      mockTicketRepo.findOne.mockResolvedValue(storedTicket);

      await svc.addAgentMessage(TICKET_ID, AGENT_ID, { body: 'We are looking into it.' } as any);

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ firstResponseAt: expect.any(Date), status: TicketStatus.IN_REVIEW }),
      );
    });

    it('does not overwrite firstResponseAt on subsequent replies', async () => {
      const existingDate = new Date(Date.now() - 3600 * 1000);
      storedTicket = makeTicket({ firstResponseAt: existingDate });
      mockTicketRepo.findOne.mockResolvedValue(storedTicket);

      await svc.addAgentMessage(TICKET_ID, AGENT_ID, { body: 'Update.' } as any);
      expect(mockTicketRepo.update).not.toHaveBeenCalled();
    });

    it('saves message with AGENT authorType', async () => {
      await svc.addAgentMessage(TICKET_ID, AGENT_ID, { body: 'Hi' } as any);
      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ authorType: MessageAuthorType.AGENT }),
      );
    });
  });

  // ── resolveTicket ──────────────────────────────────────────────────────────

  describe('resolveTicket()', () => {
    it('sets RESOLVED status, resolvedAt and resolutionNote', async () => {
      await svc.resolveTicket(TICKET_ID, AGENT_ID, 'Issue fixed');

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({
          status: TicketStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          resolutionNote: 'Issue fixed',
        }),
      );
    });

    it('adds a system message with agent and note info', async () => {
      await svc.resolveTicket(TICKET_ID, AGENT_ID, 'All good');
      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authorType: MessageAuthorType.SYSTEM,
          body: expect.stringContaining(AGENT_ID),
        }),
      );
    });
  });

  // ── closeAbandonedTickets ──────────────────────────────────────────────────

  describe('closeAbandonedTickets()', () => {
    it('closes AWAITING_USER tickets older than 72h', async () => {
      const stale = makeTicket({
        status: TicketStatus.AWAITING_USER,
        updatedAt: new Date(Date.now() - 80 * 3600 * 1000), // 80h ago
      });
      mockTicketRepo.find.mockResolvedValueOnce([stale]);

      await svc.closeAbandonedTickets();

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        stale.id,
        { status: TicketStatus.CLOSED_NO_RESPONSE },
      );
      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          authorType: MessageAuthorType.SYSTEM,
          body: expect.stringContaining('Auto-closed'),
        }),
      );
    });

    it('is a no-op when no stale tickets exist', async () => {
      mockTicketRepo.find.mockResolvedValueOnce([]);
      await svc.closeAbandonedTickets();
      expect(mockTicketRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── getMessages ────────────────────────────────────────────────────────────

  describe('getMessages()', () => {
    it('filters out internal messages when includeInternal=false', async () => {
      mockMessageRepo.find.mockResolvedValueOnce([
        makeMessage({ isInternal: false }),
        makeMessage({ isInternal: true, id: 'msg-internal' }),
      ]);

      const msgs = await svc.getMessages(TICKET_ID, USER_ID, false);
      expect(msgs.every((m: any) => !m.isInternal)).toBe(true);
      expect(msgs).toHaveLength(1);
    });

    it('includes internal messages when includeInternal=true', async () => {
      mockMessageRepo.find.mockResolvedValueOnce([
        makeMessage({ isInternal: false }),
        makeMessage({ isInternal: true, id: 'msg-internal' }),
      ]);

      const msgs = await svc.getMessages(TICKET_ID, undefined, true);
      expect(msgs).toHaveLength(2);
    });
  });

  // ── getTicketStats ─────────────────────────────────────────────────────────

  describe('getTicketStats()', () => {
    it('returns status → count map', async () => {
      const stats = await svc.getTicketStats();
      expect(stats['open']).toBe(5);
      expect(stats['resolved']).toBe(10);
    });
  });
});
