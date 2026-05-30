import { IsString, IsOptional, IsArray, MaxLength, MinLength } from 'class-validator';

export class AiChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsString()
  sign?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  context?: string[];
}
