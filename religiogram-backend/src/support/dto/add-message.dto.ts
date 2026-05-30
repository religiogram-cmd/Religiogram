import { IsString, MaxLength, IsOptional, IsBoolean } from 'class-validator';

export class AddMessageDto {
  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
