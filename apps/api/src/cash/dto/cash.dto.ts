import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class OpenCashDto {
    @IsInt()
    @Min(0)
    openingCashCents: number;
}

export class CloseCashDto {
    @IsInt()
    @Min(0)
    countedCashCents: number;

    @IsString()
    @IsOptional()
    notes?: string;
}
