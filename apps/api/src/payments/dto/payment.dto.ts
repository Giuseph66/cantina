import {
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const TAX_ID_PATTERN = /^[0-9.\-\/]{11,18}$/;
const PHONE_PATTERN = /^[0-9()\-\s+]{10,20}$/;

export class CreatePixPaymentDto {
    @IsString()
    @MaxLength(120)
    @IsOptional()
    payerName?: string;

    @IsEmail()
    @MaxLength(160)
    @IsOptional()
    payerEmail?: string;

    @IsString()
    @Matches(TAX_ID_PATTERN)
    payerDocument: string;

    @IsString()
    @Matches(PHONE_PATTERN)
    @IsOptional()
    payerPhone?: string;
}

export class CreateCardPaymentDto {
    @IsString()
    @MaxLength(120)
    @IsOptional()
    payerName?: string;

    @IsEmail()
    @MaxLength(160)
    @IsOptional()
    payerEmail?: string;

    @IsString()
    @Matches(TAX_ID_PATTERN)
    payerDocument: string;

    @IsString()
    @MaxLength(250)
    @IsOptional()
    cardToken?: string;

    @IsString()
    @MaxLength(250)
    @IsOptional()
    cardId?: string;

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
