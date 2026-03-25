import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { CashService } from './cash.service';
import { OpenCashDto, CloseCashDto } from './dto/cash.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { Role } from '../common/enums';
import { buildDateRange } from '../common/utils/date-range';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CASHIER, Role.ADMIN)
export class CashController {
    constructor(private readonly cashService: CashService) { }

    @Post('cash/open')
    open(@Body() dto: OpenCashDto, @CurrentUser() user: User) {
        return this.cashService.open(user.id, dto);
    }

    @Post('cash/close')
    close(@Body() dto: CloseCashDto, @CurrentUser() user: User) {
        return this.cashService.close(user.id, dto);
    }

    @Get('cash/today')
    today(@CurrentUser() user: User) {
        return this.cashService.getToday(user.id);
    }

    @Get('cash/report')
    dailyReport(
        @Query('date') date?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.cashService.getDailyReport(buildDateRange({ date, dateFrom, dateTo }));
    }
}
