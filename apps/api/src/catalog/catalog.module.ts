import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
    imports: [UploadsModule],
    providers: [CatalogService],
    controllers: [CatalogController],
    exports: [CatalogService],
})
export class CatalogModule { }
