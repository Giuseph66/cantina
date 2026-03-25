import { IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, ArrayMaxSize, Min, MaxLength } from 'class-validator';
import { CreditNoteStatus, PaymentMethod } from '../../common/enums';

export class ListCreditNotesQueryDto {
    @IsOptional()
    @IsEnum(CreditNoteStatus)
    status?: CreditNoteStatus;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class SettleCreditNoteDto {
    @IsIn([PaymentMethod.CASH, PaymentMethod.PIX, PaymentMethod.CARD], {
        message: 'Método de recebimento inválido. Use CASH, PIX ou CARD.',
    })
    paymentMethod: PaymentMethod;
}

export class SearchCustomersQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class BulkSettleCreditNotesDto {
    @IsArray()
    @ArrayMaxSize(100)
    @IsUUID('4', { each: true })
    noteIds: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    amountCents?: number;

    @IsIn([PaymentMethod.CASH, PaymentMethod.PIX, PaymentMethod.CARD], {
        message: 'Método de recebimento inválido. Use CASH, PIX ou CARD.',
    })
    paymentMethod: PaymentMethod;
}

export class CreateCreditMetaDto {
    @IsOptional()
    @IsString()
    customerUserId?: string;

    @IsOptional()
    @IsString()
    customerName?: string;

    @IsOptional()
    @IsString()
    customerPhone?: string;

    @IsOptional()
    @IsDateString()
    dueAt?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
