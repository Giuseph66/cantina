import { Module } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { BackupsTask } from './backups.task';

@Module({
    providers: [BackupsService, BackupsTask],
    exports: [BackupsService],
})
export class BackupsModule { }
