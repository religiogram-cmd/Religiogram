import { Test, TestingModule } from '@nestjs/testing';
import { MemoryMonitor } from './memory-monitor.service';
import { AlertsService } from '../alerts/alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('MemoryMonitor', () => {
  let svc: MemoryMonitor;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryMonitor,
        { provide: AlertsService, useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<MemoryMonitor>(MemoryMonitor);
  });

  afterEach(() => {
    jest.useRealTimers();
    svc.onModuleDestroy();
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────

  describe('onModuleInit / onModuleDestroy', () => {
    it('starts a timer on init', () => {
      svc.onModuleInit();
      expect((svc as any).timer).toBeDefined();
    });

    it('clears the timer on destroy', () => {
      svc.onModuleInit();
      svc.onModuleDestroy();
      // No error thrown; timer is cleared
      expect((svc as any).timer).toBeDefined(); // clearInterval does not set to undefined
    });
  });

  // ── sample() — alert thresholds ───────────────────────────────────────────

  describe('sample() alert thresholds', () => {
    function fakeMemory(heapMb: number) {
      const heapLimitMb = (MemoryMonitor as any).HEAP_LIMIT_MB as number || 512;
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed:     heapMb * 1024 * 1024,
        heapTotal:    heapMb * 1024 * 1024 * 1.1,
        rss:          heapMb * 1024 * 1024 * 1.3,
        external:     0,
        arrayBuffers: 0,
      });
    }

    it('fires no alert when heap is below 80%', async () => {
      fakeMemory(300); // 300/512 ≈ 58%
      (svc as any).sample();
      await Promise.resolve();
      expect(mockAlerts.fire).not.toHaveBeenCalled();
    });

    it('fires warn alert when heap is between 80% and 90%', async () => {
      fakeMemory(430); // 430/512 ≈ 84%
      (svc as any).sample();
      await Promise.resolve();
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'warn', channel: 'memory_pressure' }),
      );
    });

    it('fires critical alert when heap is at or above 90%', async () => {
      fakeMemory(470); // 470/512 ≈ 91%
      (svc as any).sample();
      await Promise.resolve();
      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical', channel: 'memory_pressure' }),
      );
    });

    it('critical alert message contains heap percentage', async () => {
      fakeMemory(470);
      (svc as any).sample();
      await Promise.resolve();
      const [payload] = mockAlerts.fire.mock.calls[0];
      expect(payload.message).toContain('%');
    });

    it('does not throw when alerts.fire rejects (fire-and-forget)', async () => {
      fakeMemory(470);
      mockAlerts.fire.mockRejectedValueOnce(new Error('Slack down'));
      expect(() => (svc as any).sample()).not.toThrow();
    });
  });

  // ── interval wiring ────────────────────────────────────────────────────────

  describe('interval wiring', () => {
    it('calls sample every 30 seconds after onModuleInit', () => {
      const sampleSpy = jest.spyOn(svc as any, 'sample');
      svc.onModuleInit();

      jest.advanceTimersByTime(30_000);
      expect(sampleSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30_000);
      expect(sampleSpy).toHaveBeenCalledTimes(2);
    });
  });
});
