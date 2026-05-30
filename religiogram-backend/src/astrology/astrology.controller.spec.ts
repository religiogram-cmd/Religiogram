import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AstrologyController } from './astrology.controller';
import { AstrologyService, ZODIAC_DATA } from './astrology.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAstrologyService = {
  processAiMessage:  jest.fn().mockResolvedValue({ reply: 'Mars is strong today.' }),
  calculateKundli:   jest.fn().mockResolvedValue({ chart: {} }),
  getDailyHoroscope: jest.fn(),
  getAllSigns:        jest.fn().mockReturnValue(ZODIAC_DATA),
};

function fakeUser(id = 'user-1'): any { return { id }; }

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AstrologyController', () => {
  let ctrl: AstrologyController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AstrologyController],
      providers: [{ provide: AstrologyService, useValue: mockAstrologyService }],
    }).compile();

    ctrl = module.get<AstrologyController>(AstrologyController);
  });

  // ── aiChat() ──────────────────────────────────────────────────────────────

  describe('aiChat()', () => {
    it('delegates to astrologyService.processAiMessage with dto', async () => {
      const dto: any = { message: 'What does Mars in retrograde mean?' };
      const result = await ctrl.aiChat(dto);
      expect(mockAstrologyService.processAiMessage).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('reply');
    });
  });

  // ── calculateKundli() ─────────────────────────────────────────────────────

  describe('calculateKundli()', () => {
    it('delegates to astrologyService.calculateKundli with dto', async () => {
      const dto: any = { birthDate: '1990-01-01', birthTime: '10:30', birthPlace: 'Delhi' };
      const result = await ctrl.calculateKundli(dto, fakeUser());
      expect(mockAstrologyService.calculateKundli).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('chart');
    });
  });

  // ── getDailyHoroscope() ───────────────────────────────────────────────────

  describe('getDailyHoroscope()', () => {
    it('returns horoscope for a valid sign', () => {
      const fakeHoroscope = { sign: 'aries', text: 'A good day.' };
      mockAstrologyService.getDailyHoroscope.mockReturnValueOnce(fakeHoroscope);
      const result = ctrl.getDailyHoroscope('Aries');
      expect(mockAstrologyService.getDailyHoroscope).toHaveBeenCalledWith('aries');
      expect(result).toEqual(fakeHoroscope);
    });

    it('lowercases the sign before delegating', () => {
      mockAstrologyService.getDailyHoroscope.mockReturnValueOnce({ sign: 'scorpio' });
      ctrl.getDailyHoroscope('SCORPIO');
      expect(mockAstrologyService.getDailyHoroscope).toHaveBeenCalledWith('scorpio');
    });

    it('throws NotFoundException when service returns null/undefined', () => {
      mockAstrologyService.getDailyHoroscope.mockReturnValueOnce(null);
      expect(() => ctrl.getDailyHoroscope('invalid_sign')).toThrow(NotFoundException);
    });
  });

  // ── getAllSigns() ─────────────────────────────────────────────────────────

  describe('getAllSigns()', () => {
    it('delegates to astrologyService.getAllSigns and returns array', () => {
      const result = ctrl.getAllSigns();
      expect(mockAstrologyService.getAllSigns).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
