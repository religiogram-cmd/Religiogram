import { Test, TestingModule } from '@nestjs/testing';
import { PlaceClaimsController } from './place-claims.controller';
import { PlaceClaimsService } from './place-claims.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPlaceClaimsService = {
  submit:    jest.fn().mockResolvedValue({ id: 'claim-1', status: 'pending' }),
  myStatus:  jest.fn().mockResolvedValue({ status: 'pending' }),
  withdraw:  jest.fn().mockResolvedValue({ success: true }),
  listMine:  jest.fn().mockResolvedValue([]),
};

function fakeUser(id = 'user-1'): any { return { id }; }

const PLACE_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlaceClaimsController', () => {
  let ctrl: PlaceClaimsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaceClaimsController],
      providers: [{ provide: PlaceClaimsService, useValue: mockPlaceClaimsService }],
    }).compile();

    ctrl = module.get<PlaceClaimsController>(PlaceClaimsController);
  });

  // ── submit() ──────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('delegates to claimsService.submit with placeId, userId, dto', async () => {
      const dto: any = { message: 'I am the temple trustee' };
      const result = await ctrl.submit(PLACE_UUID, dto, fakeUser());
      expect(mockPlaceClaimsService.submit).toHaveBeenCalledWith(PLACE_UUID, 'user-1', dto);
      expect(result).toHaveProperty('status', 'pending');
    });
  });

  // ── status() ──────────────────────────────────────────────────────────────

  describe('status()', () => {
    it('delegates to claimsService.myStatus with placeId and userId', async () => {
      await ctrl.status(PLACE_UUID, fakeUser('user-2'));
      expect(mockPlaceClaimsService.myStatus).toHaveBeenCalledWith(PLACE_UUID, 'user-2');
    });
  });

  // ── withdraw() ────────────────────────────────────────────────────────────

  describe('withdraw()', () => {
    it('delegates to claimsService.withdraw with placeId and userId', async () => {
      const result = await ctrl.withdraw(PLACE_UUID, fakeUser('user-3'));
      expect(mockPlaceClaimsService.withdraw).toHaveBeenCalledWith(PLACE_UUID, 'user-3');
      expect(result).toEqual({ success: true });
    });
  });

  // ── listMine() ────────────────────────────────────────────────────────────

  describe('listMine()', () => {
    it('delegates to claimsService.listMine with userId', async () => {
      await ctrl.listMine(fakeUser('user-4'));
      expect(mockPlaceClaimsService.listMine).toHaveBeenCalledWith('user-4');
    });
  });
});
