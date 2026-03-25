import { IsDateString, IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class ValidateTicketDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    code: string; // short code or token hash
}

export class ConsumeTicketDto {
    @IsUUID()
    ticketId: string;
}

export class MarkPaidDto {
    @IsUUID()
    ticketId: string;
}

export class MarkPendingDto {
    @IsUUID()
    ticketId: string;
}

export class MarkInternalCreditDto {
    @IsUUID()
    ticketId: string;

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
