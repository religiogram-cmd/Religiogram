import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Trust-zero contract:
 *   The client only needs to tell us WHICH payment succeeded (paymentId).
 *   The wallet controller re-verifies that payment via the payments table,
 *   uses the authoritative Razorpay-captured `amountPaise` from that row,
 *   and derives the idempotency key from the payment id.
 *
 *   `amount` (informational only, client-suggested) and `idempotencyKey`
 *   (kept for backward-compat with older client builds) are OPTIONAL — the
 *   backend ignores anything the client sends here. This prevents a class-
 *   validator whitelist mismatch from blowing up the recharge round-trip.
 */
export class RechargeWalletDto {
  @IsString()
  paymentId!: string;

  @ApiProperty({ example: 500, required: false })
  @IsOptional() @IsNumber() @IsPositive()
  amount?: number;

  /** Legacy field: previously frontend passed a client-generated UUID; now
   *  the server derives the idempotency key from the payment id. Optional. */
  @IsOptional() @IsUUID()
  idempotencyKey?: string;

  /** Legacy field: some client builds send `amountRupees` (rupees, not paise).
   *  We accept it silently so old builds don't fail validation; the value is
   *  ignored — the server credits `payment.amountPaise` from the verified
   *  Razorpay record. */
  @IsOptional() @IsNumber() @IsPositive()
  amountRupees?: number;
}
