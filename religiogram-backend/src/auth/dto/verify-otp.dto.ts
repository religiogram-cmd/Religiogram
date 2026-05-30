import { IsString, Matches, IsOptional, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyOtpDto {
  @Transform(({ value }: { value: any }) =>
    typeof value === 'string' ? value.replace(/^(\+91|0)/, '').trim() : value,
  )
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  deviceId?: string;
}
