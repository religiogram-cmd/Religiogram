import { UploadsCleanerProcessor } from './uploads-cleaner.processor';
import { UploadsService } from './uploads.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockUploads = {
  sweepExpired: jest.fn(),
};

function fakeJob(name = 'sweep-expired', id = 'job-up-1'): any {
  return { name, id };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('UploadsCleanerProcessor', () => {
  let processor: UploadsCleanerProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new UploadsCleanerProcessor(
      mockUploads as unknown as UploadsService,
    );
  });

  describe('process()', () => {
    it('calls uploads.sweepExpired()', async () => {
      mockUploads.sweepExpired.mockResolvedValueOnce({ rowsFound: 10, s3Deleted: 8, dbDeleted: 8 });
      await processor.process(fakeJob());
      expect(mockUploads.sweepExpired).toHaveBeenCalledTimes(1);
    });

    it('returns the sweep result', async () => {
      const expected = { rowsFound: 5, s3Deleted: 5, dbDeleted: 5 };
      mockUploads.sweepExpired.mockResolvedValueOnce(expected);
      const result = await processor.process(fakeJob());
      expect(result).toEqual(expected);
    });

    it('returns zero counts when nothing is expired', async () => {
      const expected = { rowsFound: 0, s3Deleted: 0, dbDeleted: 0 };
      mockUploads.sweepExpired.mockResolvedValueOnce(expected);
      const result = await processor.process(fakeJob());
      expect(result).toEqual(expected);
    });

    it('propagates errors so BullMQ retries', async () => {
      mockUploads.sweepExpired.mockRejectedValueOnce(new Error('S3 unreachable'));
      await expect(processor.process(fakeJob())).rejects.toThrow('S3 unreachable');
    });
  });
});
