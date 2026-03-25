import { Module } from '@nestjs/common';
import { ExpirationTask } from './expiration.task';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
    imports: [TicketsModule],
    providers: [ExpirationTask],
})
export class SchedulerModule { }
