import { IsArray, IsIn, IsInt, IsUUID, Min, Max, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums';

export class OrderItemDto {
    @IsUUID()
    productId: string;

    @IsInt()
    @Min(1)
    @Max(100)
    qty: number;
}

export class CreateOrderDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];

    @IsIn([PaymentMethod.ONLINE, PaymentMethod.ON_PICKUP])
    paymentMethod: PaymentMethod;
}
