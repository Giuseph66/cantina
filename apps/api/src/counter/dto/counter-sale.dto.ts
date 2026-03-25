import { IsArray, IsEnum, IsOptional, IsString, IsInt, IsUUID, Min, Max, ValidateNested, IsDateString, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums';

export class CounterItemDto {
    @IsUUID()
    productId: string;

    @IsInt()
    @Min(1)
    @Max(100)
    qty: number;
}

export class CounterSaleDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => CounterItemDto)
    items: CounterItemDto[];

    @IsEnum(PaymentMethod)
    paymentMethod: PaymentMethod;

    @IsOptional()
    @IsUUID()
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
