import { Body, Controller, Get, Param, Post, Query, Req, Headers, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreateCardPaymentDto, CreatePixPaymentDto } from './dto/payment.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller()
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Get('payments/public-config')
    getPublicConfig() {
        return this.paymentsService.getPublicConfig();
    }

    @Post('payments/orders/:orderId/pix')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 8 } })
    createPixPayment(@Param('orderId') orderId: string, @Body() dto: CreatePixPaymentDto, @CurrentUser() user: User) {
        return this.paymentsService.createPixPayment(orderId, user.id, user.role, dto);
    }

    @Post('payments/orders/:orderId/card')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 8 } })
    createCardPayment(@Param('orderId') orderId: string, @Body() dto: CreateCardPaymentDto, @CurrentUser() user: User) {
        return this.paymentsService.createCardPayment(orderId, user.id, user.role, dto);
    }

    @Get('payments/orders/:orderId/reconcile')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { ttl: 60000, limit: 20 } })
    reconcileOrderPayment(@Param('orderId') orderId: string, @CurrentUser() user: User) {
        return this.paymentsService.reconcileOrderPayment(orderId, user.id, user.role);
    }

    @Get('payments/saved-cards')
    @UseGuards(JwtAuthGuard)
    listSavedCards(@CurrentUser() user: User) {
        return this.paymentsService.listSavedCards(user.id);
    }

    @Post('webhooks/mercadopago')
    async mercadoPagoWebhook(
        @Query('webhookSecret') webhookSecret: string | undefined,
        @Body() body: Record<string, any>,
        @Query() query: Record<string, string | undefined>,
    ) {
        return this.paymentsService.handleMercadoPagoWebhook(webhookSecret, body, query);
    }

    @Post('webhooks/abacatepay')
    async abacatePayWebhook(
        @Query('webhookSecret') webhookSecret: string | undefined,
        @Headers('x-webhook-signature') signature: string | undefined,
        @Req() req: Request & { rawBody?: Buffer },
        @Body() body: Record<string, any>,
    ) {
        const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body ?? {});
        return this.paymentsService.handleAbacatePayWebhook(webhookSecret, signature, rawBody, body);
    }
}
