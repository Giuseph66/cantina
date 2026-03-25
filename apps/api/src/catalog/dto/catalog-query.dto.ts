import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CatalogProductsQueryDto {
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;
}
