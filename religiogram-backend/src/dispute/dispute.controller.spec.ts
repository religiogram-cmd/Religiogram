import { Test, TestingModule } from '@nestjs/testing';
import { DisputeController } from './dispute.controller';
import { DisputeService } from './dispute.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDisputeService = {
  raise:              jest.fn().mockResolvedValue({ id: 'disp-1' }),
  getAdminQueue:      jest.fn().mockResolvedValue([]),
  getUserDisputes:    jest.fn().mockResolvedValue([]),
  getDispute:         jest.fn().mockResolvedValue({ id: 'disp-1' }),
  addMessage:         jest.fn().mockResolvedValue({ id: 'msg-1' }),
  investigate:        jest.fn().mockResolvedValue({ id: 'disp-1', status: 'investigating' }),
  resolveForUser:     jest.fn().mockResolvedValue({ id: 'disp-1', status: 'resolved_user' }),
  resolveForProvider: jest.fn().mockResolvedValue({ id: 'disp-1', status: 'resolved_provider' }),
  escalate:           jest.fn().mockResolvedValue({ id: 'disp-1', status: 'escalated' }),
};

function fakeUser(id = 'user-1', role = 'seeker'): any {
  return { id, role };
}

const FAKE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('DisputeController', () => {
  let ctrl: DisputeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputeController],
      providers: [
        { provide: DisputeService, useValue: mockDisputeService },
      ],
    }).compile();

    ctrl = module.get<DisputeController>(DisputeController);
  });

  // ── raise() ────────────────────────────────────────────────────────────────

  describe('raise()', () => {
    it('delegates to disputeService.raise with userId and dto', async () => {
      const dto: any = { bookingId: FAKE_UUID, reason: 'no show' };
      await ctrl.raise(dto, fakeUser());
      expect(mockDisputeService.raise).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── getAdminQueue() ────────────────────────────────────────────────────────

  describe('getAdminQueue()', () => {
    it('delegates without status when not provided', async () => {
      await ctrl.getAdminQueue();
      expect(mockDisputeService.getAdminQueue).toHaveBeenCalledWith(undefined);
    });

    it('passes status filter through', async () => {
      await ctrl.getAdminQueue('open');
      expect(mockDisputeService.getAdminQueue).toHaveBeenCalledWith('open');
    });
  });

  // ── getUserDisputes() ──────────────────────────────────────────────────────

  describe('getUserDisputes()', () => {
    it('delegates with the current user id', async () => {
      await ctrl.getUserDisputes(fakeUser('user-7'));
      expect(mockDisputeService.getUserDisputes).toHaveBeenCalledWith('user-7');
    });
  });

  // ── getDispute() ───────────────────────────────────────────────────────────

  describe('getDispute()', () => {
    it('delegates with the dispute id', async () => {
      await ctrl.getDispute(FAKE_UUID);
      expect(mockDisputeService.getDispute).toHaveBeenCalledWith(FAKE_UUID);
    });
  });

  // ── addMessage() ───────────────────────────────────────────────────────────

  describe('addMessage()', () => {
    it('uses dto.senderRole when provided', async () => {
      const dto: any = { senderRole: 'admin', message: 'Reviewing now' };
      await ctrl.addMessage(FAKE_UUID, dto, fakeUser('admin-1', 'admin'));
      expect(mockDisputeService.addMessage).toHaveBeenCalledWith(
        FAKE_UUID, 'admin-1', 'admin', 'Reviewing now',
      );
    });

    it('falls back to user.role when dto.senderRole is absent', async () => {
      const dto: any = { message: 'My side of the story' };
      await ctrl.addMessage(FAKE_UUID, dto, fakeUser('user-1', 'seeker'));
      expect(mockDisputeService.addMessage).toHaveBeenCalledWith(
        FAKE_UUID, 'user-1', 'seeker', 'My side of the story',
      );
    });

    it('falls back to "user" when neither dto.senderRole nor user.role is present', async () => {
      const dto: any = { message: 'Hello' };
      const userWithoutRole: any = { id: 'user-1' }; // no role field
      await ctrl.addMessage(FAKE_UUID, dto, userWithoutRole);
      expect(mockDisputeService.addMessage).toHaveBeenCalledWith(
        FAKE_UUID, 'user-1', 'user', 'Hello',
      );
    });
  });

  // ── investigate() ──────────────────────────────────────────────────────────

  describe('investigate()', () => {
    it('delegates with dispute id and admin id', async () => {
      await ctrl.investigate(FAKE_UUID, fakeUser('admin-1', 'admin'));
      expect(mockDisputeService.investigate).toHaveBeenCalledWith(FAKE_UUID, 'admin-1');
    });
  });

  // ── resolveForUser() ───────────────────────────────────────────────────────

  describe('resolveForUser()', () => {
    it('delegates with id, adminId, and dto', async () => {
      const dto: any = { refundAmount: 500, note: 'User is right' };
      await ctrl.resolveForUser(FAKE_UUID, dto, fakeUser('admin-1', 'admin'));
      expect(mockDisputeService.resolveForUser).toHaveBeenCalledWith(FAKE_UUID, 'admin-1', dto);
    });
  });

  // ── resolveForProvider() ───────────────────────────────────────────────────

  describe('resolveForProvider()', () => {
    it('delegates with id, adminId, and dto', async () => {
      const dto: any = { note: 'Provider is right' };
      await ctrl.resolveForProvider(FAKE_UUID, dto, fakeUser('admin-1', 'admin'));
      expect(mockDisputeService.resolveForProvider).toHaveBeenCalledWith(FAKE_UUID, 'admin-1', dto);
    });
  });

  // ── escalate() ─────────────────────────────────────────────────────────────

  describe('escalate()', () => {
    it('delegates with dispute id and admin id', async () => {
      await ctrl.escalate(FAKE_UUID, fakeUser('admin-1', 'admin'));
      expect(mockDisputeService.escalate).toHaveBeenCalledWith(FAKE_UUID, 'admin-1');
    });
  });
});
