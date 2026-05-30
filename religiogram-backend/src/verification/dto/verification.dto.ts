import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocType } from '../entities/verification-document.entity';

export class AddDocumentDto {
  @ApiProperty({ enum: DocType })
  @IsEnum(DocType)
  type!: DocType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  s3Key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  s3Bucket!: string;

  @ApiProperty({ description: 'SHA-256 hex hash of the file' })
  @IsString()
  @IsNotEmpty()
  contentHash!: string;
}

export class RejectSubmissionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class MoreInfoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note!: string;
}
