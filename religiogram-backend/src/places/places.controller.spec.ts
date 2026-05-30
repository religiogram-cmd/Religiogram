import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceDonationsService } from './place-donations.service';
import { GooglePlacesService } from './google-places.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPlacesService = {
  getDetail:        jest.fn().mockResolvedValue({ id: 'place-1' }),
  listEvents:       jest.fn().mockResolvedValue([]),
  listServices:     jest.fn().mockResolvedValue([]),
  listNearby:       jest.fn().mockResolvedValue([]),
  addGalleryPhoto:  jest.fn().mockResolvedValue({ id: 'place-1', gallery: ['https://img.test/1.jpg'] }),
  removeGalleryPhoto: jest.fn().mockResolvedValue({ id: 'place-1', gallery: [] }),
  setCoverPhoto:    jest.fn().mockResolvedValue({ id: 'place-1', imageUrl: 'https://img.test/1.jpg' }),
};

const mockReviewsService = {
  listReviews:  jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getMyReview:  jest.fn().mockResolvedValue(null),
  upsertReview: jest.fn().mockResolvedValue({ id: 'rev-1' }),
  deleteReview: jest.fn().mockResolvedValue({ deleted: true }),
  markHelpful:  jest.fn().mockResolvedValue({ helpful: 1 }),
};

const mockDonationsService = {
  listMine:      jest.fn().mockResolvedValue([]),
  getStats:      jest.fn().mockResolvedValue({ totalPaise: 0, count: 0 }),
  createOrder:   jest.fn().mockResolvedValue({ orderId: 'order-1' }),
  verifyPayment: jest.fn().mockResolvedValue({ verified: true }),
};

const mockGoogleService = {
  textSearch:   jest.fn().mockResolvedValue({ results: [] }),
  searchNearby: jest.fn().mockResolvedValue({ results: [] }),
  importPlace:  jest.fn().mockResolvedValue({ id: 'place-imported' }),
};

function fakeUser(id = 'user-1'): any {
  return { id, role: 'seeker' };
}

const PLACE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const REVIEW_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('PlacesController', () => {
  let ctrl: PlacesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlacesController],
      providers: [
        { provide: PlacesService,        useValue: mockPlacesService },
        { provide: PlaceReviewsService,  useValue: mockReviewsService },
        { provide: PlaceDonationsService, useValue: mockDonationsService },
        { provide: GooglePlacesService,  useValue: mockGoogleService },
      ],
    }).compile();

    ctrl = module.get<PlacesController>(PlacesController);
  });

  // ── searchGoogle() ─────────────────────────────────────────────────────────

  describe('searchGoogle()', () => {
    it('calls textSearch when q is provided', () => {
      ctrl.searchGoogle('shiva temple', undefined, undefined);
      expect(mockGoogleService.textSearch).toHaveBeenCalledWith(
        'shiva temple', undefined, undefined,
      );
    });

    it('calls textSearch with coords when q + lat/lng provided', () => {
      ctrl.searchGoogle('temple', '28.6', '77.2');
      expect(mockGoogleService.textSearch).toHaveBeenCalledWith('temple', 28.6, 77.2);
    });

    it('calls searchNearby when only coords provided', () => {
      ctrl.searchGoogle(undefined, '28.6139', '77.2090', 'hinduism', '2000');
      expect(mockGoogleService.searchNearby).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 28.6139, lng: 77.2090, religion: 'hinduism', radius: 2000 }),
      );
    });

    it('throws BadRequestException when neither q nor coords provided', () => {
      expect(() => ctrl.searchGoogle(undefined, undefined, undefined)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when lat provided without lng', () => {
      expect(() => ctrl.searchGoogle(undefined, '28.6', undefined)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid lat value', () => {
      expect(() => ctrl.searchGoogle(undefined, 'notANumber', '77.2')).toThrow(BadRequestException);
    });
  });

  // ── importGooglePlace() ────────────────────────────────────────────────────

  describe('importGooglePlace()', () => {
    it('throws BadRequestException when googlePlaceId is absent', () => {
      expect(() => ctrl.importGooglePlace(undefined as any)).toThrow(BadRequestException);
    });

    it('delegates to googleService.importPlace with the id', async () => {
      await ctrl.importGooglePlace('ChIJXYZ123');
      expect(mockGoogleService.importPlace).toHaveBeenCalledWith('ChIJXYZ123');
    });
  });

  // ── getAllMyDonations() ────────────────────────────────────────────────────

  describe('getAllMyDonations()', () => {
    it('delegates to donationsService.listMine with userId only', async () => {
      await ctrl.getAllMyDonations(fakeUser());
      expect(mockDonationsService.listMine).toHaveBeenCalledWith('user-1');
    });
  });

  // ── getDetail() ────────────────────────────────────────────────────────────

  describe('getDetail()', () => {
    it('calls placesService.getDetail with id and null when no coords', async () => {
      await ctrl.getDetail(PLACE_ID, undefined, undefined);
      expect(mockPlacesService.getDetail).toHaveBeenCalledWith(PLACE_ID, null);
    });

    it('passes parsed coords when lat and lng are provided', async () => {
      await ctrl.getDetail(PLACE_ID, '28.6', '77.2');
      expect(mockPlacesService.getDetail).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ lat: 28.6, lng: 77.2 }),
      );
    });
  });

  // ── listEvents() ───────────────────────────────────────────────────────────

  describe('listEvents()', () => {
    it('defaults to upcomingOnly=true and limit=50', async () => {
      await ctrl.listEvents(PLACE_ID, undefined, undefined);
      expect(mockPlacesService.listEvents).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ upcomingOnly: true, limit: 50 }),
      );
    });

    it('sets upcomingOnly=false when upcoming=0', async () => {
      await ctrl.listEvents(PLACE_ID, '0', undefined);
      expect(mockPlacesService.listEvents).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ upcomingOnly: false }),
      );
    });

    it('clamps limit to 100 maximum', async () => {
      await ctrl.listEvents(PLACE_ID, undefined, '200');
      const call = mockPlacesService.listEvents.mock.calls[0][1];
      expect(call.limit).toBe(100);
    });

    it('enforces limit minimum of 1', async () => {
      await ctrl.listEvents(PLACE_ID, undefined, '0');
      const call = mockPlacesService.listEvents.mock.calls[0][1];
      expect(call.limit).toBe(1);
    });
  });

  // ── listServices() ─────────────────────────────────────────────────────────

  describe('listServices()', () => {
    it('delegates to placesService.listServices with id', async () => {
      await ctrl.listServices(PLACE_ID);
      expect(mockPlacesService.listServices).toHaveBeenCalledWith(PLACE_ID);
    });
  });

  // ── nearby() ───────────────────────────────────────────────────────────────

  describe('nearby()', () => {
    it('delegates with id and empty opts when no query params', async () => {
      await ctrl.nearby(PLACE_ID, undefined, undefined, undefined, undefined);
      expect(mockPlacesService.listNearby).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ lat: undefined, lng: undefined }),
      );
    });

    it('passes parsed coords and options', async () => {
      await ctrl.nearby(PLACE_ID, '28.6', '77.2', '10', '5');
      expect(mockPlacesService.listNearby).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ lat: 28.6, lng: 77.2, radiusKm: 10, limit: 5 }),
      );
    });
  });

  // ── addGalleryPhoto() ──────────────────────────────────────────────────────

  describe('addGalleryPhoto()', () => {
    it('throws BadRequestException when imageUrl is absent', () => {
      expect(() => ctrl.addGalleryPhoto(PLACE_ID, undefined as any)).toThrow(BadRequestException);
    });

    it('delegates to placesService.addGalleryPhoto', async () => {
      await ctrl.addGalleryPhoto(PLACE_ID, 'https://cdn.test/photo.jpg');
      expect(mockPlacesService.addGalleryPhoto).toHaveBeenCalledWith(
        PLACE_ID, 'https://cdn.test/photo.jpg',
      );
    });
  });

  // ── removeGalleryPhoto() ───────────────────────────────────────────────────

  describe('removeGalleryPhoto()', () => {
    it('throws BadRequestException when imageUrl is absent', () => {
      expect(() => ctrl.removeGalleryPhoto(PLACE_ID, undefined as any)).toThrow(BadRequestException);
    });

    it('delegates to placesService.removeGalleryPhoto', async () => {
      await ctrl.removeGalleryPhoto(PLACE_ID, 'https://cdn.test/photo.jpg');
      expect(mockPlacesService.removeGalleryPhoto).toHaveBeenCalledWith(
        PLACE_ID, 'https://cdn.test/photo.jpg',
      );
    });
  });

  // ── setCoverPhoto() ────────────────────────────────────────────────────────

  describe('setCoverPhoto()', () => {
    it('throws BadRequestException when imageUrl is absent', () => {
      expect(() => ctrl.setCoverPhoto(PLACE_ID, undefined as any)).toThrow(BadRequestException);
    });

    it('delegates to placesService.setCoverPhoto', async () => {
      await ctrl.setCoverPhoto(PLACE_ID, 'https://cdn.test/cover.jpg');
      expect(mockPlacesService.setCoverPhoto).toHaveBeenCalledWith(
        PLACE_ID, 'https://cdn.test/cover.jpg',
      );
    });
  });

  // ── listReviews() ──────────────────────────────────────────────────────────

  describe('listReviews()', () => {
    it('delegates with defaults when no query params', async () => {
      await ctrl.listReviews(PLACE_ID, undefined, undefined, undefined);
      expect(mockReviewsService.listReviews).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ page: 1, limit: 10, sort: 'newest' }),
      );
    });

    it('parses page and limit as numbers', async () => {
      await ctrl.listReviews(PLACE_ID, '3', '5', 'helpful');
      expect(mockReviewsService.listReviews).toHaveBeenCalledWith(
        PLACE_ID,
        expect.objectContaining({ page: 3, limit: 5, sort: 'helpful' }),
      );
    });
  });

  // ── getMyReview() ──────────────────────────────────────────────────────────

  describe('getMyReview()', () => {
    it('delegates to reviewsService.getMyReview with placeId and userId', async () => {
      await ctrl.getMyReview(PLACE_ID, fakeUser());
      expect(mockReviewsService.getMyReview).toHaveBeenCalledWith(PLACE_ID, 'user-1');
    });
  });

  // ── upsertReview() ─────────────────────────────────────────────────────────

  describe('upsertReview()', () => {
    it('delegates to reviewsService.upsertReview with placeId, userId, dto', async () => {
      const dto: any = { rating: 5, comment: 'Amazing place' };
      await ctrl.upsertReview(PLACE_ID, fakeUser(), dto);
      expect(mockReviewsService.upsertReview).toHaveBeenCalledWith(PLACE_ID, 'user-1', dto);
    });
  });

  // ── deleteMyReview() ───────────────────────────────────────────────────────

  describe('deleteMyReview()', () => {
    it('delegates to reviewsService.deleteReview with placeId and userId', async () => {
      await ctrl.deleteMyReview(PLACE_ID, fakeUser());
      expect(mockReviewsService.deleteReview).toHaveBeenCalledWith(PLACE_ID, 'user-1');
    });
  });

  // ── markHelpful() ──────────────────────────────────────────────────────────

  describe('markHelpful()', () => {
    it('delegates to reviewsService.markHelpful with reviewId', async () => {
      await ctrl.markHelpful(REVIEW_ID);
      expect(mockReviewsService.markHelpful).toHaveBeenCalledWith(REVIEW_ID);
    });
  });

  // ── getDonationStats() ─────────────────────────────────────────────────────

  describe('getDonationStats()', () => {
    it('delegates to donationsService.getStats with placeId', async () => {
      await ctrl.getDonationStats(PLACE_ID);
      expect(mockDonationsService.getStats).toHaveBeenCalledWith(PLACE_ID);
    });
  });

  // ── createDonationOrder() ──────────────────────────────────────────────────

  describe('createDonationOrder()', () => {
    it('delegates to donationsService.createOrder with placeId, userId, dto', async () => {
      const dto: any = { amountPaise: 10_000 };
      await ctrl.createDonationOrder(PLACE_ID, fakeUser(), dto);
      expect(mockDonationsService.createOrder).toHaveBeenCalledWith(PLACE_ID, 'user-1', dto);
    });
  });

  // ── verifyDonation() ───────────────────────────────────────────────────────

  describe('verifyDonation()', () => {
    it('delegates to donationsService.verifyPayment with userId and dto', async () => {
      const dto: any = { razorpayPaymentId: 'pay_1', razorpayOrderId: 'order_1', signature: 'sig' };
      await ctrl.verifyDonation(fakeUser(), dto);
      expect(mockDonationsService.verifyPayment).toHaveBeenCalledWith('user-1', dto);
    });
  });

  // ── getMyDonations() ───────────────────────────────────────────────────────

  describe('getMyDonations()', () => {
    it('delegates to donationsService.listMine with userId and placeId', async () => {
      await ctrl.getMyDonations(PLACE_ID, fakeUser());
      expect(mockDonationsService.listMine).toHaveBeenCalledWith('user-1', PLACE_ID);
    });
  });
});
