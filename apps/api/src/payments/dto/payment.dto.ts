import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
export class CreatePixPaymentDto { }

export class CreateCardPaymentDto {
    @IsString()
    @MaxLength(250)
    @IsOptional()
    cardToken?: string;

    @IsString()
    @MaxLength(250)
    @IsOptional()
    cardId?: string;

    @IsBoolean()
    @IsOptional()
    saveCard?: boolean;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    paymentMethodId?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    issuerId?: string;

    @IsInt()
    @Min(1)
    @Max(24)
    @IsOptional()
    installments?: number;
}
