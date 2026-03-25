import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogProductsQueryDto } from './dto/catalog-query.dto';

@Controller('catalog')
export class CatalogController {
    constructor(private readonly catalogService: CatalogService) { }

    @Get('categories')
    getCategories() {
        return this.catalogService.getCategories();
    }

    @Get('products')
    getProducts(@Query() query: CatalogProductsQueryDto) {
        return this.catalogService.getProducts(query);
    }

    @Get('products/:id')
    getProduct(@Param('id') id: string) {
        return this.catalogService.getProductById(id);
    }
}
