import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsDto {
  /**
   * Cursor is the createdAt ISO timestamp of the last item received.
   * The next page returns items strictly older than this cursor
   * (createdAt < cursor), ordered DESC.
   */
  @IsISO8601()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
