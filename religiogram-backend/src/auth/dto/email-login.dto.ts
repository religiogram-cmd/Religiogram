import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailLoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  // Login uses MinLength only (not IsStrongPassword) so older accounts with
  // legacy passwords can still log in. Complexity is enforced on registration
  // and password-change flows. bcrypt compare will reject wrong passwords.
  @ApiProperty({ example: 'MySecure@Pass1' })
  @IsString()
  @MinLength(8)
  password!: string;
}
