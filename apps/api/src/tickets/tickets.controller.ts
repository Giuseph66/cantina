import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TicketsService } from './tickets.service';
import { ValidateTicketDto, ConsumeTicketDto, MarkPaidDto, MarkPendingDto, MarkInternalCreditDto } from './dto/ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { Role } from '../common/enums';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
    constructor(private readonly ticketsService: TicketsService) { }

    @Post('validate')
    @Roles(Role.CASHIER, Role.ADMIN)
    @Throttle({ default: { ttl: 60000, limit: 30 } })
    validate(@Body() dto: ValidateTicketDto) {
        // Heuristic: if the code is 64 chars hex it's a token hash, else it's a short code
        if (dto.code.length === 64 && /^[a-f0-9]+$/.test(dto.code)) {
            return this.ticketsService.validateByToken(dto.code);
        }
        return this.ticketsService.validateByCode(dto.code);
    }

    @Post('consume')
    @Roles(Role.ADMIN, Role.CASHIER)
    async consumeTicket(@Body() dto: ConsumeTicketDto, @CurrentUser() user: User) {
        return this.ticketsService.consumeTicket(dto.ticketId, user.id);
    }

    @Get('offline-cache')
    @Roles(Role.ADMIN, Role.CASHIER)
    async getOfflineCache() {
        return this.ticketsService.getOfflineCache();
    }

    @Post('sync-consumptions')
    @Roles(Role.ADMIN, Role.CASHIER)
    async syncConsumptions(@Body() dto: { consumptions: { ticketId: string; consumedAtOffline: string; deviceId: string }[] }, @CurrentUser() user: User) {
        if (!dto.consumptions || !Array.isArray(dto.consumptions)) {
            return { error: 'Formato inválido' };
        }
        if (dto.consumptions.length > 200) {
            return { error: 'Limite de 200 consumos por sincronização excedido' };
        }
        return this.ticketsService.syncConsumptions(dto.consumptions, user.id);
    }

    @Post('mark-paid')
    @Roles(Role.ADMIN, Role.CASHIER)
    markPaid(@Body() dto: MarkPaidDto, @CurrentUser() user: User) {
        return this.ticketsService.markOrderPaid(dto.ticketId, user.id);
    }

    @Post('mark-pending')
    @Roles(Role.ADMIN, Role.CASHIER)
    markPending(@Body() dto: MarkPendingDto, @CurrentUser() user: User) {
        return this.ticketsService.markOrderPending(dto.ticketId, user.id);
    }

    @Post('mark-internal-credit')
    @Roles(Role.ADMIN, Role.CASHIER)
    markInternalCredit(@Body() dto: MarkInternalCreditDto, @CurrentUser() user: User) {
        return this.ticketsService.markOrderInternalCredit(dto.ticketId, user.id, dto);
    }
}
