import { IsString, Matches, IsOptional, Length } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Indian phone number: 10 digits, starting with 6-9
 * Strip +91/0 prefixes before validation
 */
export class SendOtpDto {
  @Transform(({ value }: { value: any }) =>
    typeof value === 'string' ? value.replace(/^(\+91|0)/, '').trim() : value,
  )
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'phone must be a valid 10-digit Indian mobile number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  userAgent?: string;
}
