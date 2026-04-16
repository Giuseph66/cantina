import { Module, Global } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { AppSettingsService } from './services/app-settings.service';
import { CsrfGuard } from './guards/csrf.guard';

@Global()
@Module({
    providers: [AuditService, AppSettingsService, CsrfGuard],
    exports: [AuditService, AppSettingsService, CsrfGuard],
})
export class CommonModule { }
