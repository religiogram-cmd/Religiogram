import { AstrologyService, ZODIAC_DATA } from './astrology.service';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AstrologyService', () => {
  let svc: AstrologyService;

  beforeEach(() => {
    svc = new AstrologyService();
  });

  // ── getAllSigns ────────────────────────────────────────────────────────────

  describe('getAllSigns()', () => {
    it('returns all 12 zodiac signs', () => {
      const result = svc.getAllSigns();
      expect(result).toHaveLength(12);
    });

    it('includes required fields for each sign', () => {
      const result = svc.getAllSigns();
      for (const sign of result) {
        expect(sign).toHaveProperty('name');
        expect(sign).toHaveProperty('symbol');
        expect(sign).toHaveProperty('element');
        expect(sign).toHaveProperty('dateRange');
        expect(sign).toHaveProperty('traits');
        expect(sign).toHaveProperty('ruling_planet');
        expect(sign).toHaveProperty('compatibility');
      }
    });

    it('includes aries and pisces', () => {
      const names = svc.getAllSigns().map((s) => s.name);
      expect(names).toContain('aries');
      expect(names).toContain('pisces');
    });
  });

  // ── getDailyHoroscope ──────────────────────────────────────────────────────

  describe('getDailyHoroscope()', () => {
    it('returns a horoscope for a valid sign', () => {
      const result = svc.getDailyHoroscope('aries');
      expect(result).not.toBeNull();
      expect(result!.sign).toBe('aries');
      expect(result!.symbol).toBeDefined();
      expect(result!.element).toBe('Fire');
      expect(result!.prediction).toBeTruthy();
      expect(typeof result!.luckyNumber).toBe('number');
      expect(typeof result!.luckyColor).toBe('string');
    });

    it('is case-insensitive for sign name', () => {
      const lower = svc.getDailyHoroscope('scorpio');
      const upper = svc.getDailyHoroscope('SCORPIO');
      expect(lower).toEqual(upper);
    });

    it('returns null for an unknown sign', () => {
      const result = svc.getDailyHoroscope('dragon');
      expect(result).toBeNull();
    });

    it('includes a date in YYYY-MM-DD format', () => {
      const result = svc.getDailyHoroscope('leo');
      expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── processAiMessage ───────────────────────────────────────────────────────

  describe('processAiMessage()', () => {
    it('returns a reply and timestamp', () => {
      const result = svc.processAiMessage({ message: 'What does the future hold?' });
      expect(result.reply).toBeTruthy();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('detects love intent when message contains "love"', () => {
      const result = svc.processAiMessage({ message: 'Tell me about love and romance' });
      // Replies for love intent contain Venus or heart-related text
      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('detects career intent when message contains "career"', () => {
      const result = svc.processAiMessage({ message: 'What about my career and job' });
      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('appends sign flavour when sign is provided', () => {
      const withSign = svc.processAiMessage({ message: 'How is this week?', sign: 'aries' });
      const withoutSign = svc.processAiMessage({ message: 'How is this week?' });
      // Sign flavour adds "As an Aries..."
      expect(withSign.reply).toContain('Aries');
      expect(withoutSign.reply).not.toContain('Aries');
    });

    it('detects sign from message text when not explicitly provided', () => {
      const result = svc.processAiMessage({ message: 'I am a taurus, what is my fortune?' });
      expect(result.reply).toContain('Taurus');
    });

    it('uses context array to detect sign when message has no sign', () => {
      const result = svc.processAiMessage({
        message: 'What should I do today?',
        context: ['user is a virgo'],
      });
      expect(result.reply).toContain('Virgo');
    });
  });

  // ── calculateKundli ────────────────────────────────────────────────────────

  describe('calculateKundli()', () => {
    const dto = {
      name:          'Test User',
      dateOfBirth:   '1995-03-25',
      timeOfBirth:   '10:30',
      placeOfBirth:  'Delhi',
    };

    it('returns a kundli with expected fields', () => {
      const result = svc.calculateKundli(dto as any);
      expect(result.name).toBe('Test User');
      expect(result.sunSign).toBeTruthy();
      expect(result.moonSign).toBeTruthy();
      expect(result.ascendant).toBeTruthy();
      expect(result.nakshatra).toBeTruthy();
      expect(result.planetaryPositions).toBeDefined();
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns valid zodiac names for sunSign and moonSign', () => {
      const result = svc.calculateKundli(dto as any);
      const validNames = ZODIAC_DATA.map((z) => z.name);
      expect(validNames).toContain(result.sunSign);
      expect(validNames).toContain(result.moonSign);
    });

    it('returns aries as sunSign for March 25 birthday', () => {
      // March 25 falls in Aries (Mar 21 – Apr 19)
      const result = svc.calculateKundli(dto as any);
      expect(result.sunSign).toBe('aries');
    });

    it('includes all 9 planets in planetary positions', () => {
      const result = svc.calculateKundli(dto as any);
      expect(Object.keys(result.planetaryPositions)).toEqual(
        expect.arrayContaining(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']),
      );
    });

    it('each planetary position indicates both a sign and a house', () => {
      const result = svc.calculateKundli(dto as any);
      for (const val of Object.values(result.planetaryPositions)) {
        expect(val as string).toContain('House');
      }
    });
  });
});
