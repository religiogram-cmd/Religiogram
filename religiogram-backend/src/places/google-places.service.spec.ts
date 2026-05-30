import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

// ── Mock axios ────────────────────────────────────────────────────────────────
jest.mock('axios');
import axios from 'axios';
const mockAxiosGet  = jest.spyOn(axios, 'get');
const mockAxiosPost = jest.spyOn(axios, 'post');

import { GooglePlacesService } from './google-places.service';
import { Temple } from '../temples/entities/temple.entity';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    if (key === 'googlePlaces.apiKey') return 'AIza_test_key';
    return def ?? null;
  }),
};

function makeTemple(overrides: any = {}): Temple {
  return {
    id:          'temple-1',
    name:        'Kashi Vishwanath',
    city:        'varanasi',
    state:       'UP',
    lat:         25.3,
    lng:         83.0,
    ratingAvg:   4.5,
    ratingCount: 100,
    ...overrides,
  } as unknown as Temple;
}

const mockTempleRepo = {
  findOne:  jest.fn().mockResolvedValue(null),
  create:   jest.fn().mockImplementation((d: any) => ({ ...makeTemple(), ...d })),
  save:     jest.fn().mockImplementation((d: any) => Promise.resolve({ ...makeTemple(), ...d })),
};

// Google API response factory
function makeGoogleResult() {
  return {
    status: 'OK',
    results: [
      {
        place_id:            'ChIJtest123',
        name:                'Test Temple',
        formatted_address:   '123 Temple St, Varanasi',
        geometry:            { location: { lat: 25.3, lng: 83.0 } },
        rating:              4.5,
        user_ratings_total:  200,
        opening_hours:       { open_now: true },
        photos:              [],
        types:               ['hindu_temple'],
        url:                 'https://maps.google.com/?cid=1',
        formatted_phone_number: null,
        website:             null,
      },
    ],
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('GooglePlacesService', () => {
  let svc: GooglePlacesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: makeGoogleResult() } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesService,
        { provide: getRepositoryToken(Temple), useValue: mockTempleRepo },
        { provide: ConfigService,              useValue: mockConfig },
      ],
    }).compile();

    svc = module.get<GooglePlacesService>(GooglePlacesService);
  });

  // ── nearbySearch ───────────────────────────────────────────────────────────

  describe('nearbySearch()', () => {
    it('returns empty result when API key is not configured', async () => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        if (key === 'googlePlaces.apiKey') return '';
        return def ?? null;
      });
      const result = await svc.nearbySearch({ lat: 25.3, lng: 83.0, religion: 'hindu' });
      expect(result.places).toHaveLength(0);
    });

    it('returns mapped places when API returns OK', async () => {
      const result = await svc.nearbySearch({ lat: 25.3, lng: 83.0, religion: 'hindu' });
      expect(result.places).toHaveLength(1);
      expect(result.places[0].name).toBe('Test Temple');
    });

    it('returns empty array when API returns ZERO_RESULTS', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { status: 'ZERO_RESULTS', results: [] } } as any);
      const result = await svc.nearbySearch({ lat: 25.3, lng: 83.0, religion: 'hindu' });
      expect(result.places).toHaveLength(0);
    });

    it('returns empty array and does not throw when API fails', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));
      const result = await svc.nearbySearch({ lat: 25.3, lng: 83.0, religion: 'hindu' });
      expect(result.places).toHaveLength(0);
    });

    it('includes nextPageToken when present in response', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { ...makeGoogleResult(), next_page_token: 'token-abc' },
      } as any);
      const result = await svc.nearbySearch({ lat: 25.3, lng: 83.0, religion: 'hindu' });
      expect(result.nextPageToken).toBe('token-abc');
    });
  });

  // ── textSearch ─────────────────────────────────────────────────────────────

  describe('textSearch()', () => {
    it('returns mapped places for a valid query', async () => {
      const result = await svc.textSearch('Kashi Vishwanath');
      expect(result.places).toHaveLength(1);
    });

    it('returns empty array and does not throw when API fails', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Timeout'));
      const result = await svc.textSearch('temple');
      expect(result.places).toHaveLength(0);
    });
  });

  // ── getDetails ─────────────────────────────────────────────────────────────

  describe('getDetails()', () => {
    it('returns null when API key is not configured', async () => {
      mockConfig.get.mockImplementation(() => '');
      expect(await svc.getDetails('ChIJtest')).toBeNull();
    });

    it('returns mapped place when API returns OK', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { status: 'OK', result: makeGoogleResult().results[0] },
      } as any);
      const result = await svc.getDetails('ChIJtest123');
      expect(result).not.toBeNull();
      expect(result!.placeId).toBe('ChIJtest123');
    });

    it('returns null when API returns non-OK status', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { status: 'NOT_FOUND' } } as any);
      expect(await svc.getDetails('bad-id')).toBeNull();
    });
  });

  // ── importPlace ────────────────────────────────────────────────────────────

  describe('importPlace()', () => {
    it('throws NotFoundException when place details cannot be retrieved', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { status: 'NOT_FOUND' } } as any);
      await expect(svc.importPlace('bad-place-id')).rejects.toThrow(NotFoundException);
    });

    it('saves a new temple row when importing a new place', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { status: 'OK', result: makeGoogleResult().results[0] },
      } as any);
      mockTempleRepo.findOne.mockResolvedValueOnce(null);

      await svc.importPlace('ChIJtest123');
      expect(mockTempleRepo.save).toHaveBeenCalled();
    });
  });
});
