import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class ResolveForUserDto {
  @IsString()
  @IsNotEmpty()
  note!: string;

  @IsInt()
  @Min(0)
  refundAmountPaise!: number;
}

export class ResolveForProviderDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}

export class AddMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
