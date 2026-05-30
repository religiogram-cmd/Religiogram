import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Job } from 'bullmq';
import { Story } from '../entities/story.entity';
import { QUEUE } from '../../common/queues/queue.constants';

@Processor(QUEUE.STORY_EXPIRY)
export class StoryExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(StoryExpiryProcessor.name);

  constructor(
    @InjectRepository(Story)
    private readonly stories: Repository<Story>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    let totalDeleted = 0;
    const BATCH_SIZE = 500;
    let deleted: number;

    do {
      // Delete in batches to avoid long-running table locks
      const result = await this.stories.createQueryBuilder()
        .delete()
        .where('expires_at < :now', { now: new Date() })
        .andWhere(`id IN (
          SELECT id FROM stories WHERE expires_at < :now ORDER BY expires_at LIMIT ${BATCH_SIZE}
        )`, { now: new Date() })
        .execute();
      deleted = result.affected ?? 0;
      totalDeleted += deleted;
    } while (deleted === BATCH_SIZE);

    this.logger.log({ totalDeleted }, 'Expired stories cleaned up');
  }
}
