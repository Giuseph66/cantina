import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupsService } from './backups.service';

@Injectable()
export class BackupsTask {
    private readonly logger = new Logger(BackupsTask.name);

    constructor(private readonly backupsService: BackupsService) { }

    @Cron('0 0 * * *', {
        timeZone: process.env.BACKUP_TIMEZONE ?? 'America/Cuiaba',
    })
    async handleDailyBackup() {
        try {
            const result = await this.backupsService.createBackup('cron');
            this.logger.log(`Backup diario concluido: id=${result.id}, tabelas=${result.tableCount}, imagens=${result.imageCount}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Falha no backup diario: ${message}`);
        }
    }
}
