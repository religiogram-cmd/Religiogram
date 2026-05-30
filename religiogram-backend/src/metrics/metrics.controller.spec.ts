import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const PROMETHEUS_SAMPLE = `# HELP process_cpu_seconds_total Total user and system CPU time
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 0.42
`;

const mockMetricsService = {
  getMetrics: jest.fn().mockResolvedValue(PROMETHEUS_SAMPLE),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('MetricsController', () => {
  let ctrl: MetricsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: mockMetricsService }],
    }).compile();

    ctrl = module.get<MetricsController>(MetricsController);
  });

  // ── getMetrics() ──────────────────────────────────────────────────────────

  describe('getMetrics()', () => {
    it('delegates to metricsService.getMetrics', async () => {
      await ctrl.getMetrics();
      expect(mockMetricsService.getMetrics).toHaveBeenCalled();
    });

    it('returns the raw string from the service', async () => {
      const result = await ctrl.getMetrics();
      expect(typeof result).toBe('string');
      expect(result).toContain('process_cpu_seconds_total');
    });
  });
});
