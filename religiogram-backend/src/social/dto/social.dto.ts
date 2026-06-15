import { IsString, IsOptional, IsArray, IsUUID, MinLength, MaxLength, IsUrl, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

/** Strip all HTML tags from a string to prevent stored XSS. */
function stripHtml(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]*>/g, '').trim();
}

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  @Transform(({ value }) => stripHtml(value))
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  @Transform(({ value }) => stripHtml(value))
  text?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class CreateCommunityPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2200)
  @Transform(({ value }) => stripHtml(value))
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  @Transform(({ value }) => stripHtml(value))
  caption?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @MaxLength(2048, { each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsIn(['text', 'photo', 'video', 'quote', 'question'])
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  hashtags?: string[];
}

export class CreateCommentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text?: string;
}

export class SendDmDto {
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) => stripHtml(value))
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) => stripHtml(value))
  text?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  imageUrl?: string;
}

export class FriendRequestDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
