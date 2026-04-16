import { Module } from '@nestjs/common';
import { ExpirationTask } from './expiration.task';
import { TicketsModule } from '../tickets/tickets.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentReconciliationTask } from './payment-reconciliation.task';

@Module({
    imports: [TicketsModule, PaymentsModule],
    providers: [ExpirationTask, PaymentReconciliationTask],
})
export class SchedulerModule { }
