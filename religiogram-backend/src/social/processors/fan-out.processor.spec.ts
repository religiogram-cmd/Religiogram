import { FanOutProcessor } from './fan-out.processor';
import { FeedService } from '../feed.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockFeed = {
  fanOut: jest.fn().mockResolvedValue(undefined),
};

function fakeJob(data: {
  postId: string;
  authorId: string;
  postCreatedAt: string;
}, id = 'fanout-job-1'): any {
  return { data, id };
}

const POST_TS = '2024-06-15T10:00:00.000Z';

// ── suite ─────────────────────────────────────────────────────────────────────

describe('FanOutProcessor', () => {
  let processor: FanOutProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new FanOutProcessor(mockFeed as unknown as FeedService);
  });

  describe('process()', () => {
    it('calls feed.fanOut with postId, authorId, and parsed Date', async () => {
      await processor.process(
        fakeJob({ postId: 'post-1', authorId: 'author-1', postCreatedAt: POST_TS }),
      );
      expect(mockFeed.fanOut).toHaveBeenCalledWith(
        'post-1',
        'author-1',
        new Date(POST_TS),
      );
    });

    it('converts ISO string to Date correctly', async () => {
      await processor.process(
        fakeJob({ postId: 'p', authorId: 'a', postCreatedAt: POST_TS }),
      );
      const [, , calledDate] = mockFeed.fanOut.mock.calls[0];
      expect(calledDate).toBeInstanceOf(Date);
      expect(calledDate.toISOString()).toBe(POST_TS);
    });

    it('resolves on success', async () => {
      await expect(
        processor.process(
          fakeJob({ postId: 'p', authorId: 'a', postCreatedAt: POST_TS }),
        ),
      ).resolves.not.toThrow();
    });

    it('propagates errors so BullMQ retries with backoff', async () => {
      mockFeed.fanOut.mockRejectedValueOnce(new Error('DB overloaded'));
      await expect(
        processor.process(
          fakeJob({ postId: 'p', authorId: 'a', postCreatedAt: POST_TS }),
        ),
      ).rejects.toThrow('DB overloaded');
    });

    it('passes different postIds on different calls', async () => {
      await processor.process(
        fakeJob({ postId: 'post-A', authorId: 'author-1', postCreatedAt: POST_TS }),
      );
      await processor.process(
        fakeJob({ postId: 'post-B', authorId: 'author-1', postCreatedAt: POST_TS }),
      );
      expect(mockFeed.fanOut).toHaveBeenNthCalledWith(
        1, 'post-A', 'author-1', new Date(POST_TS),
      );
      expect(mockFeed.fanOut).toHaveBeenNthCalledWith(
        2, 'post-B', 'author-1', new Date(POST_TS),
      );
    });
  });
});
