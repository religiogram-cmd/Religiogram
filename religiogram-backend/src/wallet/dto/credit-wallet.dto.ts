import { IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreditWalletDto {
  @IsNumber() @IsPositive()
  amount!: number;

  @IsUUID()
  referenceId!: string;

  @IsString() @IsNotEmpty()
  referenceType!: string;

  @IsString() @MaxLength(255)
  idempotencyKey!: string;

  @IsString()
  description!: string;
}
