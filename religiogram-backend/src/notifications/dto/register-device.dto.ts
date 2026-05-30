import { IsEnum, IsString, Length } from 'class-validator';
import { DevicePlatform } from '../entities/device-token.entity';

export class RegisterDeviceDto {
  @IsString()
  @Length(10, 500)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
