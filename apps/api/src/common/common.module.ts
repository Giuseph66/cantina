import { Module, Global } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { AppSettingsService } from './services/app-settings.service';

@Global()
@Module({
    providers: [AuditService, AppSettingsService],
    exports: [AuditService, AppSettingsService],
})
export class CommonModule { }
