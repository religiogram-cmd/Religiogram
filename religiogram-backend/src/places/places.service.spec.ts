import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacesService } from './places.service';
import { Temple } from '../temples/entities/temple.entity';
import { PlaceEvent } from './entities/place-event.entity';
import { PlaceService as PlaceServiceEntity } from './entities/place-service.entity';
import { RedisService } from '../redis/redis.service';

// ── QB factories ──────────────────────────────────────────────────────────────

function makePlacesQB(getRawOne = jest.fn().mockResolvedValue({ '?column?': 1 })) {
  const qb: any = {
    select:   jest.fn().mockReturnThis(),
    where:    jest.fn().mockReturnThis(),
    getRawOne,
  };
  return qb;
}

function makeEventsQB(
  getMany    = jest.fn().mockResolvedValue([]),
  getManyAndCount = jest.fn().mockResolvedValue([[], 0]),
) {
  const qb: any = {
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy:  jest.fn().mockReturnThis(),
    take:     jest.fn().mockReturnThis(),
    getMany,
    getManyAndCount,
  };
  return qb;
}

// ── stubs ─────────────────────────────────────────────────────────────────────

const FUTURE_MS = Date.now() + 2 * 60 * 60 * 1000; // 2 hours from now

function makeTemple(overrides: any = {}): Temple {
  return {
    id:              'place-1',
    type:            'temple',
    name:            'Kashi Vishwanath',
    city:            'varanasi',
    state:           'UP',
    address:         '123 Vishwanath Gali',
    lat:             25.3109,
    lng:             83.0107,
    ratingAvg:       4.7,
    ratingCount:     500,
    hours:           '6am-8pm',
    imageUrl:        null,
    galleryUrls:     [],
    googlePlaceId:   null,
    description:     null,
    donationEnabled: false,
    donationUpiId:   null,
    ownerId:         null,
    isVerified:      true,
    createdAt:       new Date('2024-01-01'),
    updatedAt:       new Date('2024-06-01'),
    ...overrides,
  } as unknown as Temple;
}

function makeEvent(overrides: any = {}): PlaceEvent {
  return {
    id:          'event-1',
    placeId:     'place-1',
    title:       'Maha Aarti',
    description: null,
    startTime:   new Date(FUTURE_MS),
    endTime:     null,
    recurring:   false,
    isHidden:    false,
    createdAt:   new Date('2024-01-01'),
    ...overrides,
  } as unknown as PlaceEvent;
}

function makeServiceEntity(overrides: any = {}): PlaceServiceEntity {
  return {
    id:          'svc-1',
    placeId:     'place-1',
    name:        'Puja Booking',
    description: null,
    isHidden:    false,
    createdAt:   new Date('2024-01-01'),
    ...overrides,
  } as unknown as PlaceServiceEntity;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

let placesQB = makePlacesQB();
let eventsQB = makeEventsQB();

const mockPlacesRepo = {
  createQueryBuilder: jest.fn(() => placesQB),
  findOne: jest.fn().mockResolvedValue(makeTemple()),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeTemple(), ...d })),
  delete:  jest.fn().mockResolvedValue({ affected: 1 }),
  query:   jest.fn().mockResolvedValue([]),
};

const mockEventsRepo = {
  createQueryBuilder: jest.fn(() => eventsQB),
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeEvent(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeEvent(), ...d })),
  delete:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockServicesRepo = {
  find:    jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create:  jest.fn().mockImplementation((d: any) => ({ ...makeServiceEntity(), ...d })),
  save:    jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeServiceEntity(), ...d })),
  delete:  jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockRedis = {
  get:  jest.fn().mockResolvedValue(null),
  set:  jest.fn().mockResolvedValue('OK'),
  del:  jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlacesService', () => {
  let svc: PlacesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    placesQB = makePlacesQB();
    eventsQB = makeEventsQB();
    mockPlacesRepo.createQueryBuilder.mockReturnValue(placesQB);
    mockEventsRepo.createQueryBuilder.mockReturnValue(eventsQB);
    mockPlacesRepo.findOne.mockResolvedValue(makeTemple());
    mockEventsRepo.findOne.mockResolvedValue(null);
    mockServicesRepo.find.mockResolvedValue([]);
    mockServicesRepo.findOne.mockResolvedValue(null);
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: getRepositoryToken(Temple),            useValue: mockPlacesRepo },
        { provide: getRepositoryToken(PlaceEvent),        useValue: mockEventsRepo },
        { provide: getRepositoryToken(PlaceServiceEntity), useValue: mockServicesRepo },
        { provide: RedisService,                          useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<PlacesService>(PlacesService);
  });

  // ── bustCaches ─────────────────────────────────────────────────────────────

  describe('bustCaches()', () => {
    it('increments the cache version key', async () => {
      await svc.bustCaches();
      expect(mockRedis.incr).toHaveBeenCalledWith('places:cache:version');
    });

    it('clears the in-process version memo', async () => {
      // Prime the memo by calling getCacheVersion indirectly via getDetail
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      await svc.getDetail('place-1');
      // Bust clears memo; next read will hit Redis again
      await svc.bustCaches();
      expect(mockRedis.incr).toHaveBeenCalled();
    });

    it('does not throw when Redis.incr fails', async () => {
      mockRedis.incr.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(svc.bustCaches()).resolves.not.toThrow();
    });
  });

  // ── getDetail ──────────────────────────────────────────────────────────────

  describe('getDetail()', () => {
    it('throws NotFoundException when place does not exist (cache miss)', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.getDetail('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('returns cached DTO when Redis has a hit', async () => {
      const cached = JSON.stringify({
        id: 'place-1', type: 'temple', name: 'Cached Temple',
        city: 'varanasi', state: 'UP', address: null,
        lat: 25.31, lng: 83.01, ratingAvg: 4.5, ratingCount: 100,
        openingHours: null, imageUrl: null, galleryUrls: [],
        googlePlaceId: null, description: null,
        donationEnabled: false, donationUpiId: null,
        ownerId: null, isVerified: true,
        upcomingEvents: [], services: [],
      });
      mockRedis.get.mockResolvedValueOnce('0');  // cache version
      mockRedis.get.mockResolvedValueOnce(cached); // detail cache
      const result = await svc.getDetail('place-1');
      expect(result.name).toBe('Cached Temple');
      expect(mockPlacesRepo.findOne).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and writes result to Redis', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      eventsQB.getMany.mockResolvedValueOnce([]);

      await svc.getDetail('place-1');

      expect(mockPlacesRepo.findOne).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('places:'),
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('adds distanceKm when userCoords are provided', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple({ lat: 25.31, lng: 83.01 }));
      eventsQB.getMany.mockResolvedValueOnce([]);

      const result = await svc.getDetail('place-1', { lat: 25.31, lng: 83.0 });
      expect(result.distanceKm).toBeDefined();
      expect(typeof result.distanceKm).toBe('number');
    });

    it('does not include distanceKm when userCoords are not provided', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      eventsQB.getMany.mockResolvedValueOnce([]);

      const result = await svc.getDetail('place-1');
      expect(result.distanceKm).toBeUndefined();
    });

    it('handles corrupt cached JSON by deleting key and re-fetching', async () => {
      mockRedis.get.mockResolvedValueOnce('0');
      mockRedis.get.mockResolvedValueOnce('not-valid-json!!!');
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      eventsQB.getMany.mockResolvedValueOnce([]);

      const result = await svc.getDetail('place-1');
      expect(mockRedis.del).toHaveBeenCalled();
      expect(result.id).toBe('place-1');
    });
  });

  // ── listEvents ─────────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      // requirePlace uses QB.getRawOne — return null to simulate 404
      placesQB.getRawOne.mockResolvedValueOnce(null);
      await expect(svc.listEvents('bad-place')).rejects.toThrow(NotFoundException);
    });

    it('returns cached events when Redis has a hit', async () => {
      const cached = JSON.stringify([
        { id: 'e-1', placeId: 'place-1', title: 'Cached Event', description: null,
          startTime: new Date(FUTURE_MS).toISOString(), endTime: null,
          recurring: false, createdAt: new Date().toISOString() },
      ]);
      mockRedis.get.mockResolvedValueOnce('0'); // version
      mockRedis.get.mockResolvedValueOnce(cached);
      const result = await svc.listEvents('place-1');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Cached Event');
    });

    it('fetches from DB on cache miss and writes to Redis', async () => {
      eventsQB.getMany.mockResolvedValueOnce([makeEvent()]);

      const result = await svc.listEvents('place-1');
      expect(result).toHaveLength(1);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('clamps limit to 100 maximum', async () => {
      eventsQB.getMany.mockResolvedValueOnce([]);
      await svc.listEvents('place-1', { limit: 500 });
      expect(eventsQB.take).toHaveBeenCalledWith(100);
    });

    it('clamps limit to 1 minimum', async () => {
      eventsQB.getMany.mockResolvedValueOnce([]);
      await svc.listEvents('place-1', { limit: 0 });
      expect(eventsQB.take).toHaveBeenCalledWith(1);
    });
  });

  // ── listServices ───────────────────────────────────────────────────────────

  describe('listServices()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      placesQB.getRawOne.mockResolvedValueOnce(null);
      await expect(svc.listServices('bad-place')).rejects.toThrow(NotFoundException);
    });

    it('returns services from DB when cache misses', async () => {
      mockServicesRepo.find.mockResolvedValueOnce([makeServiceEntity()]);
      const result = await svc.listServices('place-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Puja Booking');
    });

    it('returns cached services on cache hit', async () => {
      const cached = JSON.stringify([
        { id: 'svc-1', placeId: 'place-1', name: 'Cached Service',
          description: null, createdAt: new Date().toISOString() },
      ]);
      mockRedis.get.mockResolvedValueOnce('0'); // version
      mockRedis.get.mockResolvedValueOnce(cached);
      const result = await svc.listServices('place-1');
      expect(result[0].name).toBe('Cached Service');
      expect(mockServicesRepo.find).not.toHaveBeenCalled();
    });
  });

  // ── listNearby ─────────────────────────────────────────────────────────────

  describe('listNearby()', () => {
    it('throws NotFoundException when anchor place does not exist', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.listNearby('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when anchor has no usable coordinates', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(
        makeTemple({ lat: NaN, lng: NaN }),
      );
      await expect(svc.listNearby('place-1')).rejects.toThrow(BadRequestException);
    });

    it('uses anchor coords when no opts.lat/lng are provided', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(
        makeTemple({ lat: 25.31, lng: 83.01 }),
      );
      mockPlacesRepo.query.mockResolvedValueOnce([]);

      await svc.listNearby('place-1');

      const queryCall = mockPlacesRepo.query.mock.calls[0];
      // params: [lng, lat, radiusMeters, limit, anchorId]
      expect(queryCall[1][0]).toBe(83.01); // lng
      expect(queryCall[1][1]).toBe(25.31); // lat
    });

    it('prefers opts.lat/lng over anchor coords when provided', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(
        makeTemple({ lat: 25.31, lng: 83.01 }),
      );
      mockPlacesRepo.query.mockResolvedValueOnce([]);

      await svc.listNearby('place-1', { lat: 28.6, lng: 77.2 });

      const queryCall = mockPlacesRepo.query.mock.calls[0];
      expect(queryCall[1][0]).toBe(77.2); // lng
      expect(queryCall[1][1]).toBe(28.6); // lat
    });

    it('clamps radiusKm to 50 maximum', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      mockPlacesRepo.query.mockResolvedValueOnce([]);

      await svc.listNearby('place-1', { radiusKm: 200 });

      const queryCall = mockPlacesRepo.query.mock.calls[0];
      // radiusKm * 1000 → metres (clamped to 50km = 50000m)
      expect(queryCall[1][2]).toBe(50_000);
    });

    it('clamps limit to 20 maximum', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      mockPlacesRepo.query.mockResolvedValueOnce([]);

      await svc.listNearby('place-1', { limit: 100 });

      const queryCall = mockPlacesRepo.query.mock.calls[0];
      expect(queryCall[1][3]).toBe(20);
    });

    it('maps raw rows to NearbyPlaceDto with distanceKm', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      mockPlacesRepo.query.mockResolvedValueOnce([
        {
          id: 'place-2', type: 'temple', name: 'Other Temple',
          city: 'varanasi', state: 'UP', rating_avg: '4.2',
          rating_count: 30, is_verified: true, image_url: null,
          distance_m: 1500,
        },
      ]);

      const result = await svc.listNearby('place-1');
      expect(result).toHaveLength(1);
      expect(result[0].distanceKm).toBe(1.5);
    });

    it('excludes anchor place from results (SQL WHERE id != $5)', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple({ id: 'anchor-1' }));
      mockPlacesRepo.query.mockResolvedValueOnce([]);

      await svc.listNearby('anchor-1');

      const queryCall = mockPlacesRepo.query.mock.calls[0];
      expect(queryCall[1][4]).toBe('anchor-1');
      expect(queryCall[0]).toContain('id != $5');
    });

    it('caches results and returns cached list on second call', async () => {
      const nearbyCache = JSON.stringify([
        { id: 'place-2', type: 'temple', name: 'Cached Nearby',
          city: 'varanasi', state: null, imageUrl: null,
          ratingAvg: null, ratingCount: 0, isVerified: true, distanceKm: 0.5 },
      ]);
      // First get is cache version, second get is the nearby cache key
      mockPlacesRepo.findOne.mockResolvedValueOnce(makeTemple());
      mockRedis.get.mockResolvedValueOnce('0');
      mockRedis.get.mockResolvedValueOnce(nearbyCache);

      const result = await svc.listNearby('place-1');
      expect(result[0].name).toBe('Cached Nearby');
      expect(mockPlacesRepo.query).not.toHaveBeenCalled();
    });
  });

  // ── createEvent ────────────────────────────────────────────────────────────

  describe('createEvent()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      placesQB.getRawOne.mockResolvedValueOnce(null);
      await expect(
        svc.createEvent('bad-place', { title: 'Aarti', startTime: new Date(FUTURE_MS).toISOString() }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when endTime is before startTime', async () => {
      const start = new Date(FUTURE_MS).toISOString();
      const end   = new Date(FUTURE_MS - 60_000).toISOString();
      await expect(
        svc.createEvent('place-1', { title: 'Aarti', startTime: start, endTime: end }),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves the event and returns a DTO', async () => {
      const result = await svc.createEvent('place-1', {
        title: 'Maha Aarti',
        startTime: new Date(FUTURE_MS).toISOString(),
      });
      expect(mockEventsRepo.save).toHaveBeenCalled();
      expect(result.title).toBe('Maha Aarti');
    });

    it('busts caches after saving', async () => {
      await svc.createEvent('place-1', {
        title: 'Aarti',
        startTime: new Date(FUTURE_MS).toISOString(),
      });
      expect(mockRedis.incr).toHaveBeenCalledWith('places:cache:version');
    });
  });

  // ── updateEvent ────────────────────────────────────────────────────────────

  describe('updateEvent()', () => {
    it('throws NotFoundException when event does not exist', async () => {
      mockEventsRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.updateEvent('place-1', 'bad-event', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when updated endTime is before startTime', async () => {
      const event = makeEvent({
        startTime: new Date(FUTURE_MS),
        endTime:   new Date(FUTURE_MS + 60 * 60 * 1000),
      });
      mockEventsRepo.findOne.mockResolvedValueOnce(event);

      await expect(
        svc.updateEvent('place-1', 'event-1', {
          endTime: new Date(FUTURE_MS - 60_000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves the updated event and busts caches', async () => {
      mockEventsRepo.findOne.mockResolvedValueOnce(makeEvent());
      const result = await svc.updateEvent('place-1', 'event-1', { title: 'Updated Aarti' });
      expect(mockEventsRepo.save).toHaveBeenCalled();
      expect(result.title).toBe('Updated Aarti');
      expect(mockRedis.incr).toHaveBeenCalled();
    });
  });

  // ── deleteEvent ────────────────────────────────────────────────────────────

  describe('deleteEvent()', () => {
    it('returns { removed: true } when event exists', async () => {
      mockEventsRepo.delete.mockResolvedValueOnce({ affected: 1 });
      const result = await svc.deleteEvent('place-1', 'event-1');
      expect(result.removed).toBe(true);
    });

    it('returns { removed: false } when event does not exist', async () => {
      mockEventsRepo.delete.mockResolvedValueOnce({ affected: 0 });
      const result = await svc.deleteEvent('place-1', 'bad-event');
      expect(result.removed).toBe(false);
    });

    it('busts caches after deletion', async () => {
      await svc.deleteEvent('place-1', 'event-1');
      expect(mockRedis.incr).toHaveBeenCalled();
    });
  });

  // ── createService ──────────────────────────────────────────────────────────

  describe('createService()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      placesQB.getRawOne.mockResolvedValueOnce(null);
      await expect(
        svc.createService('bad-place', { name: 'Puja' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves the service and returns a DTO', async () => {
      const result = await svc.createService('place-1', { name: 'Puja Booking' });
      expect(mockServicesRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Puja Booking');
    });

    it('busts caches after saving', async () => {
      await svc.createService('place-1', { name: 'Puja' });
      expect(mockRedis.incr).toHaveBeenCalled();
    });
  });

  // ── updateService ──────────────────────────────────────────────────────────

  describe('updateService()', () => {
    it('throws NotFoundException when service does not exist', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        svc.updateService('place-1', 'bad-svc', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves updated service and busts caches', async () => {
      mockServicesRepo.findOne.mockResolvedValueOnce(makeServiceEntity());
      const result = await svc.updateService('place-1', 'svc-1', { name: 'Kalash Puja' });
      expect(mockServicesRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Kalash Puja');
      expect(mockRedis.incr).toHaveBeenCalled();
    });
  });

  // ── deleteService ──────────────────────────────────────────────────────────

  describe('deleteService()', () => {
    it('returns { removed: true } when service exists', async () => {
      mockServicesRepo.delete.mockResolvedValueOnce({ affected: 1 });
      const result = await svc.deleteService('place-1', 'svc-1');
      expect(result.removed).toBe(true);
    });

    it('returns { removed: false } when service does not exist', async () => {
      mockServicesRepo.delete.mockResolvedValueOnce({ affected: 0 });
      const result = await svc.deleteService('place-1', 'bad-svc');
      expect(result.removed).toBe(false);
    });
  });

  // ── addGalleryPhoto ────────────────────────────────────────────────────────

  describe('addGalleryPhoto()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.addGalleryPhoto('bad-place', 'http://img.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('appends photo URL to gallery and saves', async () => {
      const place = makeTemple({ galleryUrls: [] });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);

      const result = await svc.addGalleryPhoto('place-1', 'http://img.jpg');
      expect(result).toContain('http://img.jpg');
      expect(mockPlacesRepo.save).toHaveBeenCalled();
    });

    it('sets imageUrl as cover when no cover is currently set', async () => {
      const place = makeTemple({ galleryUrls: [], imageUrl: null });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      await svc.addGalleryPhoto('place-1', 'http://img.jpg');
      expect(mockPlacesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'http://img.jpg' }),
      );
    });

    it('is idempotent — does not add duplicate URLs', async () => {
      const place = makeTemple({ galleryUrls: ['http://img.jpg'] });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);

      await svc.addGalleryPhoto('place-1', 'http://img.jpg');
      expect(mockPlacesRepo.save).not.toHaveBeenCalled();
    });

    it('caps gallery at 20 photos', async () => {
      const existing = Array.from({ length: 20 }, (_, i) => `http://img${i}.jpg`);
      const place = makeTemple({ galleryUrls: existing });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      await svc.addGalleryPhoto('place-1', 'http://img-new.jpg');
      const saveArg = mockPlacesRepo.save.mock.calls[0][0];
      expect(saveArg.galleryUrls).toHaveLength(20);
    });
  });

  // ── removeGalleryPhoto ─────────────────────────────────────────────────────

  describe('removeGalleryPhoto()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.removeGalleryPhoto('bad-place', 'http://img.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes the URL from gallery and saves', async () => {
      const place = makeTemple({ galleryUrls: ['http://img.jpg', 'http://img2.jpg'] });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      const result = await svc.removeGalleryPhoto('place-1', 'http://img.jpg');
      expect(result).not.toContain('http://img.jpg');
      expect(result).toContain('http://img2.jpg');
    });

    it('updates cover to next gallery photo when removed URL was the cover', async () => {
      const place = makeTemple({
        galleryUrls: ['http://cover.jpg', 'http://next.jpg'],
        imageUrl:    'http://cover.jpg',
      });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      await svc.removeGalleryPhoto('place-1', 'http://cover.jpg');
      expect(mockPlacesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'http://next.jpg' }),
      );
    });
  });

  // ── setCoverPhoto ──────────────────────────────────────────────────────────

  describe('setCoverPhoto()', () => {
    it('throws NotFoundException when place does not exist', async () => {
      mockPlacesRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.setCoverPhoto('bad-place', 'http://img.jpg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets imageUrl to the new cover URL', async () => {
      const place = makeTemple({ galleryUrls: ['http://img.jpg'], imageUrl: null });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      await svc.setCoverPhoto('place-1', 'http://img.jpg');
      expect(mockPlacesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'http://img.jpg' }),
      );
    });

    it('prepends new cover URL to gallery when not already present', async () => {
      const place = makeTemple({ galleryUrls: ['http://img2.jpg'], imageUrl: null });
      mockPlacesRepo.findOne.mockResolvedValueOnce(place);
      mockPlacesRepo.save.mockImplementationOnce((d: any) => Promise.resolve(d));

      await svc.setCoverPhoto('place-1', 'http://new-cover.jpg');
      const saveArg = mockPlacesRepo.save.mock.calls[0][0];
      expect(saveArg.galleryUrls[0]).toBe('http://new-cover.jpg');
    });
  });
});
