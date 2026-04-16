import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class PaymentReconciliationTask {
    private readonly logger = new Logger(PaymentReconciliationTask.name);

    constructor(private readonly paymentsService: PaymentsService) { }

    @Cron(CronExpression.EVERY_MINUTE)
    async handlePendingPaymentReconciliation() {
        const result = await this.paymentsService.reconcilePendingPaymentsBatch();

        if (result.updated > 0 || result.failed > 0) {
            this.logger.log(`Pagamento pendente reconciliado: verificados=${result.scanned}, atualizados=${result.updated}, falhas=${result.failed}`);
        }
    }
}
