import { IsEmail, IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';

export class EmailRegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'MySecure@Pass1',
    minLength: 8,
    description:
      'Min 8 chars, with at least one uppercase, one lowercase, one number, and one special character.',
  })
  @IsString()
  @MaxLength(72)
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({ example: 'Arjun Sharma' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
