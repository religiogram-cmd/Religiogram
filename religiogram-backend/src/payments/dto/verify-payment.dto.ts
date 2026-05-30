import { IsString, IsUUID } from 'class-validator';

export class VerifyPaymentDto {
  @IsUUID()
  bookingId!: string;

  @IsString()
  razorpayOrderId!: string;

  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}
