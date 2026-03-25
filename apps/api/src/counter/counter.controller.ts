import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CounterService } from './counter.service';
import { CounterSaleDto } from './dto/counter-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { Role } from '../common/enums';

@Controller('counter')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CASHIER, Role.ADMIN)
export class CounterController {
    constructor(private readonly counterService: CounterService) { }

    @Post('sale')
    createSale(@Body() dto: CounterSaleDto, @CurrentUser() user: User) {
        return this.counterService.createSale(user.id, dto);
    }
}
