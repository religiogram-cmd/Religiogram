import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordEarningDto {
  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty()
  @IsString()
  referenceId!: string;

  @ApiProperty({ enum: ['booking', 'session'] })
  @IsString()
  referenceType!: string;

  @ApiProperty({ description: 'Gross amount in paise' })
  @IsNumber()
  @Min(0)
  grossPaise!: number;

  @ApiProperty({ description: 'Platform fee in paise' })
  @IsNumber()
  @Min(0)
  feePaise!: number;

  @ApiProperty({ description: 'TDS deducted in paise' })
  @IsNumber()
  @Min(0)
  tdsPaise!: number;
}
