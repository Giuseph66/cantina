import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller()
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
    ) { }

    @Post('orders')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 5 } })
    createOrder(@Body() dto: CreateOrderDto, @CurrentUser() user: User) {
        return this.ordersService.createOrder(user.id, dto);
    }

    @Get('orders/ready')
    @UseGuards(JwtAuthGuard)
    getReadyOrders() {
        return this.ordersService.getReadyOrders();
    }

    @Get('orders/public/:id')
    @UseGuards(JwtAuthGuard)
    getPublicOrder(@Param('id') id: string, @CurrentUser() user: User) {
        return this.ordersService.getOrderById(id, user.id, user.role);
    }

    @Get('orders/my/summary')
    @UseGuards(JwtAuthGuard)
    getMyOrdersSummary(@CurrentUser() user: User) {
        return this.ordersService.getMyOrdersSummary(user.id);
    }

    @Get('orders/my')
    @UseGuards(JwtAuthGuard)
    getMyOrders(@CurrentUser() user: User) {
        return this.ordersService.getMyOrders(user.id);
    }

    @Get('orders/:id')
    @UseGuards(JwtAuthGuard)
    getOrder(@Param('id') id: string, @CurrentUser() user: User) {
        return this.ordersService.getOrderById(id, user.id, user.role);
    }

    @Get('tickets/:orderId')
    @UseGuards(JwtAuthGuard)
    getTicket(@Param('orderId') orderId: string, @CurrentUser() user: User) {
        return this.ordersService.getTicketByOrderId(orderId, user.id, user.role);
    }
}
