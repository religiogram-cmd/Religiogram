import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class KundliDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'timeOfBirth must be HH:MM' })
  timeOfBirth!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  placeOfBirth!: string;
}
