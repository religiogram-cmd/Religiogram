import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlacesController } from './admin-places.controller';
import { PlacesService } from './places.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPlacesService = {
  listEvents:    jest.fn().mockResolvedValue([]),
  createEvent:   jest.fn().mockResolvedValue({ id: 'evt-1' }),
  updateEvent:   jest.fn().mockResolvedValue({ id: 'evt-1' }),
  deleteEvent:   jest.fn().mockResolvedValue({ success: true }),
  listServices:  jest.fn().mockResolvedValue([]),
  createService: jest.fn().mockResolvedValue({ id: 'svc-1' }),
  updateService: jest.fn().mockResolvedValue({ id: 'svc-1' }),
  deleteService: jest.fn().mockResolvedValue({ success: true }),
};

const PLACE_UUID   = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const EVENT_UUID   = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const SERVICE_UUID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AdminPlacesController', () => {
  let ctrl: AdminPlacesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPlacesController],
      providers: [{ provide: PlacesService, useValue: mockPlacesService }],
    }).compile();

    ctrl = module.get<AdminPlacesController>(AdminPlacesController);
  });

  // ── listEvents() ──────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('delegates with placeId', async () => {
      await ctrl.listEvents(PLACE_UUID);
      expect(mockPlacesService.listEvents).toHaveBeenCalledWith(PLACE_UUID);
    });
  });

  // ── createEvent() ─────────────────────────────────────────────────────────

  describe('createEvent()', () => {
    it('delegates with placeId and dto', async () => {
      const dto: any = { title: 'Special Puja' };
      const result = await ctrl.createEvent(PLACE_UUID, dto);
      expect(mockPlacesService.createEvent).toHaveBeenCalledWith(PLACE_UUID, dto);
      expect(result).toHaveProperty('id', 'evt-1');
    });
  });

  // ── updateEvent() ─────────────────────────────────────────────────────────

  describe('updateEvent()', () => {
    it('delegates with placeId, eventId, dto', async () => {
      const dto: any = { title: 'Revised Event' };
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
      const dto: any = { name: 'Admin Service', pricePaise: 1000 };
      const result = await ctrl.createService(PLACE_UUID, dto);
      expect(mockPlacesService.createService).toHaveBeenCalledWith(PLACE_UUID, dto);
      expect(result).toHaveProperty('id', 'svc-1');
    });
  });

  // ── updateService() ───────────────────────────────────────────────────────

  describe('updateService()', () => {
    it('delegates with placeId, serviceId, dto', async () => {
      const dto: any = { pricePaise: 2000 };
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
