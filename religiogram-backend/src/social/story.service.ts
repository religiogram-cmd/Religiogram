import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository, DataSource } from 'typeorm';
import { Story } from './entities/story.entity';

export interface CreateStoryDto {
  mediaType?: string;
  mediaUrl?: string;
  textContent?: string;
  backgroundColor?: string;
}

@Injectable()
export class StoryService {
  constructor(
    @InjectRepository(Story) private readonly storyRepo: Repository<Story>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createStory(authorId: string, dto: CreateStoryDto): Promise<Story> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = this.storyRepo.create({
      authorId,
      mediaType: dto.mediaType ?? 'text',
      mediaUrl: dto.mediaUrl ?? null,
      textContent: dto.textContent ?? null,
      backgroundColor: dto.backgroundColor ?? null,
      expiresAt,
    });
    return this.storyRepo.save(story);
  }

  /** Returns active (non-expired) stories from the given set of authorIds */
  async getFriendsStories(userId: string, friendIds: string[]): Promise<Story[]> {
    const authorIds = [userId, ...friendIds];
    const now = new Date();
    return this.storyRepo.find({
      where: authorIds.map((id) => ({ authorId: id, expiresAt: MoreThan(now) })),
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStoryById(id: string): Promise<Story | null> {
    return this.storyRepo.findOne({ where: { id }, relations: ['author'] });
  }

  async markViewed(storyId: string, viewerId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [storyId, viewerId],
    );
  }

  async hasViewed(storyId: string, viewerId: string): Promise<boolean> {
    const row = await this.dataSource.query(
      `SELECT 1 FROM story_views WHERE story_id = $1 AND viewer_id = $2 LIMIT 1`,
      [storyId, viewerId],
    );
    return row.length > 0;
  }

  async getViewCount(storyId: string): Promise<number> {
    const row = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM story_views WHERE story_id = $1`,
      [storyId],
    );
    return parseInt(row[0].cnt, 10);
  }

  async deleteExpired(): Promise<void> {
    await this.storyRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}
