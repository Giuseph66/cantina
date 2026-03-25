import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { buildDateRange } from '../common/utils/date-range';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('kpis')
    async getKpis(
        @Query('date') date?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('paymentMethod') paymentMethod?: string,
        @Query('channel') channel?: string,
    ) {
        return this.reportsService.getDailyKpis(
            buildDateRange({ date, dateFrom, dateTo }),
            { paymentMethod, channel },
        );
    }

    @Get('daily')
    async getDailySummary(
        @Query('date') date?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('paymentMethod') paymentMethod?: string,
        @Query('channel') channel?: string,
    ) {
        return this.reportsService.getDailySummary(
            buildDateRange({ date, dateFrom, dateTo }),
            { paymentMethod, channel },
        );
    }

    @Get('top-items')
    async getTopItems(
        @Query('date') date?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('paymentMethod') paymentMethod?: string,
        @Query('channel') channel?: string,
    ) {
        return this.reportsService.getTopItems(
            buildDateRange({ date, dateFrom, dateTo }),
            { paymentMethod, channel },
        );
    }
}
