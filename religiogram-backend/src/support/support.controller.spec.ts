import { Test, TestingModule } from '@nestjs/testing';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSupportService = {
  createTicket:      jest.fn().mockResolvedValue({ id: 'ticket-1', status: 'open' }),
  getMyTickets:      jest.fn().mockResolvedValue([]),
  getTicket:         jest.fn().mockResolvedValue({ id: 'ticket-1' }),
  addUserMessage:    jest.fn().mockResolvedValue({ id: 'msg-1' }),
  getMessages:       jest.fn().mockResolvedValue([]),
  getAdminQueue:     jest.fn().mockResolvedValue({ items: [], total: 0 }),
  adminUpdateTicket: jest.fn().mockResolvedValue({ id: 'ticket-1', assignedTo: 'admin-1' }),
  resolveTicket:     jest.fn().mockResolvedValue({ id: 'ticket-1', status: 'closed' }),
};

function fakeUser(id = 'user-1', role = 'seeker'): any { return { id, role }; }

const TICKET_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SupportController', () => {
  let ctrl: SupportController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [{ provide: SupportService, useValue: mockSupportService }],
    }).compile();

    ctrl = module.get<SupportController>(SupportController);
  });

  // ── createTicket() ─────────────────────────────────────────────────────────

  describe('createTicket()', () => {
    it('delegates to supportService.createTicket with userId and dto', async () => {
      const dto: any = { subject: 'Payment issue', message: 'I was charged twice' };
      const result = await ctrl.createTicket(dto, fakeUser());
      expect(mockSupportService.createTicket).toHaveBeenCalledWith('user-1', dto);
      expect(result.status).toBe('open');
    });
  });

  // ── getUserTickets() ────────────────────────────────────────────────────────

  describe('getUserTickets()', () => {
    it('delegates to supportService.getMyTickets with userId', async () => {
      await ctrl.getUserTickets(fakeUser(), 1, 20);
      expect(mockSupportService.getMyTickets).toHaveBeenCalledWith('user-1');
    });
  });

  // ── getTicket() ────────────────────────────────────────────────────────────

  describe('getTicket()', () => {
    it('delegates to supportService.getTicket with id and userId', async () => {
      const result = await ctrl.getTicket(TICKET_UUID, fakeUser());
      expect(mockSupportService.getTicket).toHaveBeenCalledWith(TICKET_UUID, 'user-1');
      expect(result.id).toBe('ticket-1');
    });
  });

  // ── addMessage() ───────────────────────────────────────────────────────────

  describe('addMessage()', () => {
    it('delegates to supportService.addUserMessage with ticketId, userId, dto', async () => {
      const dto: any = { message: 'Still having this issue' };
      const result = await ctrl.addMessage(TICKET_UUID, dto, fakeUser());
      expect(mockSupportService.addUserMessage).toHaveBeenCalledWith(TICKET_UUID, 'user-1', dto);
      expect(result.id).toBe('msg-1');
    });
  });

  // ── getMessages() ──────────────────────────────────────────────────────────

  describe('getMessages()', () => {
    it('delegates to supportService.getMessages with ticketId and userId', async () => {
      await ctrl.getMessages(TICKET_UUID, fakeUser());
      expect(mockSupportService.getMessages).toHaveBeenCalledWith(TICKET_UUID, 'user-1');
    });
  });

  // ── getAdminQueue() (admin) ────────────────────────────────────────────────

  describe('getAdminQueue()', () => {
    it('delegates to supportService.getAdminQueue with status and priority', async () => {
      await ctrl.getAdminQueue('open' as any, 'p1_critical' as any);
      expect(mockSupportService.getAdminQueue).toHaveBeenCalledWith({
        status: 'open',
        priority: 'p1_critical',
      });
    });

    it('passes undefined for both filters when not provided', async () => {
      await ctrl.getAdminQueue(undefined, undefined);
      expect(mockSupportService.getAdminQueue).toHaveBeenCalledWith({
        status: undefined,
        priority: undefined,
      });
    });
  });

  // ── assignTicket() (admin) ─────────────────────────────────────────────────

  describe('assignTicket()', () => {
    it('delegates to supportService.adminUpdateTicket with id, adminId, dto', async () => {
      const dto: any = { assignedTo: 'agent-1' };
      const result = await ctrl.assignTicket(TICKET_UUID, dto, fakeUser('admin-1', 'admin'));
      expect(mockSupportService.adminUpdateTicket).toHaveBeenCalledWith(TICKET_UUID, 'admin-1', dto);
      expect(result.assignedTo).toBe('admin-1');
    });
  });

  // ── closeTicket() (admin) ──────────────────────────────────────────────────

  describe('closeTicket()', () => {
    it('delegates to supportService.resolveTicket with id, adminId, note', async () => {
      const result = await ctrl.closeTicket(
        TICKET_UUID,
        { note: 'Resolved via refund' },
        fakeUser('admin-1', 'admin'),
      );
      expect(mockSupportService.resolveTicket).toHaveBeenCalledWith(
        TICKET_UUID, 'admin-1', 'Resolved via refund',
      );
      expect(result.status).toBe('closed');
    });

    it('uses "Closed by admin" when note is absent in body', async () => {
      await ctrl.closeTicket(TICKET_UUID, {}, fakeUser('admin-1', 'admin'));
      const [,, note] = mockSupportService.resolveTicket.mock.calls[0];
      expect(note).toBe('Closed by admin');
    });
  });
});
