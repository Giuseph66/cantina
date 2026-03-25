import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class ExpirationTask {
    private readonly logger = new Logger(ExpirationTask.name);

    constructor(private readonly ticketsService: TicketsService) { }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleExpiration() {
        const count = await this.ticketsService.expireOverdueTickets();
        if (count > 0) {
            this.logger.log(`⏰ ${count} pedido(s) expirado(s) e estoque devolvido`);
        }
    }
}
