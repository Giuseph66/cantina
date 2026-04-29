import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UploadsModule } from '../uploads/uploads.module';
import { BackupsModule } from '../backups/backups.module';

@Module({
    imports: [UploadsModule, BackupsModule],
    providers: [AdminService],
    controllers: [AdminController],
})
export class AdminModule { }
