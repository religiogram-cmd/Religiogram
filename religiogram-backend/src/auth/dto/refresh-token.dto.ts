import { IsJWT, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsJWT()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
