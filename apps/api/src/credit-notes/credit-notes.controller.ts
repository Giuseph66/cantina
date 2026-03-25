import { Controller, Get, Param, Post, Query, Body, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { Role } from '../common/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreditNotesService } from './credit-notes.service';
import { ListCreditNotesQueryDto, SearchCustomersQueryDto, SettleCreditNoteDto, BulkSettleCreditNotesDto } from './dto/credit-note.dto';

@Controller('credit-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CASHIER, Role.ADMIN)
export class CreditNotesController {
    constructor(private readonly creditNotesService: CreditNotesService) { }

    @Get()
    list(@Query() query: ListCreditNotesQueryDto) {
        return this.creditNotesService.list(query);
    }

    @Get('summary')
    summary() {
        return this.creditNotesService.getSummary();
    }

    @Get('customers')
    customers(@Query() query: SearchCustomersQueryDto) {
        return this.creditNotesService.searchCustomers(query);
    }

    @Post(':id/settle')
    settle(@Param('id') id: string, @Body() dto: SettleCreditNoteDto, @CurrentUser() user: User) {
        return this.creditNotesService.settle(id, user.id, dto);
    }

    @Post('bulk-settle')
    bulkSettle(@Body() dto: BulkSettleCreditNotesDto, @CurrentUser() user: User) {
        return this.creditNotesService.bulkSettle(user.id, dto);
    }
}
