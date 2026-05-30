import { IsEnum, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { DisputeReferenceType } from '../entities/dispute.entity';

export class RaiseDisputeDto {
  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @IsEnum(DisputeReferenceType)
  referenceType!: DisputeReferenceType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;
}
