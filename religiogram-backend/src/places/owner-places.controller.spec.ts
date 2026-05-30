import { Test, TestingModule } from '@nestjs/testing';
import { OwnerPlacesController } from './owner-places.controller';
import { PlacesService } from './places.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPlacesService = {
  listEvents:    jest.fn().mockResolvedValue([]),
  createEvent:   jest.fn().mockResolvedValue({ id: 'evt-1' }),
  updateEvent:   jest.fn().mockResolvedValue({ id: 'evt-1', updated: true }),
  deleteEvent:   jest.fn().mockResolvedValue({ success: true }),
  listServices:  jest.fn().mockResolvedValue([]),
  createService: jest.fn().mockResolvedValue({ id: 'svc-1' }),
  updateService: jest.fn().mockResolvedValue({ id: 'svc-1', updated: true }),
  deleteService: jest.fn().mockResolvedValue({ success: true }),
};

const PLACE_UUID   = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const EVENT_UUID   = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const SERVICE_UUID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('OwnerPlacesController', () => {
  let ctrl: OwnerPlacesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerPlacesController],
      providers: [{ provide: PlacesService, useValue: mockPlacesService }],
    }).compile();

    ctrl = module.get<OwnerPlacesController>(OwnerPlacesController);
  });

  // ── listEvents() ──────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('passes upcomingOnly=false when upcoming absent', async () => {
      await ctrl.listEvents(PLACE_UUID, undefined, undefined);
      expect(mockPlacesService.listEvents).toHaveBeenCalledWith(
        PLACE_UUID,
        expect.objectContaining({ upcomingOnly: false }),
      );
    });

    it('passes upcomingOnly=true when upcoming="1"', async () => {
      await ctrl.listEvents(PLACE_UUID, '1', undefined);
      expect(mockPlacesService.listEvents).toHaveBeenCalledWith(
        PLACE_UUID,
        expect.objectContaining({ upcomingOnly: true }),
      );
    });

    it('defaults limit to 100 when absent', async () => {
      await ctrl.listEvents(PLACE_UUID, undefined, undefined);
      const [, opts] = mockPlacesService.listEvents.mock.calls[0];
      expect(opts.limit).toBe(100);
    });

    it('clamps limit to max 200', async () => {
      await ctrl.listEvents(PLACE_UUID, undefined, '9999');
      const [, opts] = mockPlacesService.listEvents.mock.calls[0];
      expect(opts.limit).toBe(200);
    });

    it('clamps limit to min 1', async () => {
      await ctrl.listEvents(PLACE_UUID, undefined, '0');
      const [, opts] = mockPlacesService.listEvents.mock.calls[0];
      expect(opts.limit).toBe(1);
    });
  });

  // ── createEvent() ─────────────────────────────────────────────────────────

  describe('createEvent()', () => {
    it('delegates with placeId and dto', async () => {
      const dto: any = { title: 'Diwali Puja', startTime: '2025-11-01T18:00:00Z' };
      const result = await ctrl.createEvent(PLACE_UUID, dto);
      expect(mockPlacesService.createEvent).toHaveBeenCalledWith(PLACE_UUID, dto);
      expect(result).toHaveProperty('id', 'evt-1');
    });
  });

  // ── updateEvent() ─────────────────────────────────────────────────────────

  describe('updateEvent()', () => {
    it('delegates with placeId, eventId, dto', async () => {
      const dto: any = { title: 'Updated Puja' };
      await ctrl.updateEvent(PLACE_UUID, EVENT_UUID, dto);
      expect(mockPlacesService.updateEvent).toHaveBeenCalledWith(PLACE_UUID, EVENT_UUID, dto);
    });
  });

  // ── deleteEvent() ─────────────────────────────────────────────────────────

  describe('deleteEvent()', () => {
    it('delegates with placeId and eventId', async () => {
      await ctrl.deleteEvent(PLACE_UUID, EVENT_UUID);
      expect(mockPlacesService.deleteEvent).toHaveBeenCalledWith(PLACE_UUID, EVENT_UUID);
    });
  });

  // ── listServices() ────────────────────────────────────────────────────────

  describe('listServices()', () => {
    it('delegates with placeId', async () => {
      await ctrl.listServices(PLACE_UUID);
      expect(mockPlacesService.listServices).toHaveBeenCalledWith(PLACE_UUID);
    });
  });

  // ── createService() ───────────────────────────────────────────────────────

  describe('createService()', () => {
    it('delegates with placeId and dto', async () => {
      const dto: any = { name: 'Aarti', pricePaise: 5000 };
      const result = await ctrl.createService(PLACE_UUID, dto);
      expect(mockPlacesService.createService).toHaveBeenCalledWith(PLACE_UUID, dto);
      expect(result).toHaveProperty('id', 'svc-1');
    });
  });

  // ── updateService() ───────────────────────────────────────────────────────

  describe('updateService()', () => {
    it('delegates with placeId, serviceId, dto', async () => {
      const dto: any = { pricePaise: 6000 };
      await ctrl.updateService(PLACE_UUID, SERVICE_UUID, dto);
      expect(mockPlacesService.updateService).toHaveBeenCalledWith(PLACE_UUID, SERVICE_UUID, dto);
    });
  });

  // ── deleteService() ───────────────────────────────────────────────────────

  describe('deleteService()', () => {
    it('delegates with placeId and serviceId', async () => {
      await ctrl.deleteService(PLACE_UUID, SERVICE_UUID);
      expect(mockPlacesService.deleteService).toHaveBeenCalledWith(PLACE_UUID, SERVICE_UUID);
    });
  });
});
