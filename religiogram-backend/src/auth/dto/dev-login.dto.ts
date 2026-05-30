import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Used ONLY in development/test — never available in production.
 */
export class DevLoginDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'dev123' })
  @IsString()
  @MinLength(4)
  password!: string;

  @ApiProperty({ required: false, example: 'admin' })
  @IsString()
  role?: string;
}
