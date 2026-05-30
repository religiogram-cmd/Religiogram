import { IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeWalletDto {
  @ApiProperty({ example: 500 })
  @IsNumber() @IsPositive()
  amount!: number;

  @IsString()
  paymentId!: string;

  @IsUUID()
  idempotencyKey!: string;
}
