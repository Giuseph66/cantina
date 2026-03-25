import { Controller, Post, Body, NotFoundException, Headers, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { OrderStatus } from '../common/enums';
import * as crypto from 'crypto';

@Controller('webhooks')
export class WebhooksController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly events: EventsGateway
    ) { }

    @Post('pix')
    async handlePixWebhook(
        @Headers('x-webhook-secret') secret: string,
        @Body() payload: { orderId: string; status: string }
    ) {
        const expectedSecret = process.env.WEBHOOK_PIX_SECRET;
        if (!expectedSecret || !secret || !crypto.timingSafeEqual(
            Buffer.from(secret),
            Buffer.from(expectedSecret),
        )) {
            throw new UnauthorizedException('Webhook secret inválido');
        }

        if (payload.status !== 'APPROVED') {
            return { received: true, ignored: true };
        }

        const order = await this.prisma.order.findUnique({
            where: { id: payload.orderId },
            include: { ticket: true }
        });

        if (!order) {
            throw new NotFoundException('Pedido não encontrado');
        }

        if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.CONFIRMED) {
            return { received: true, alreadyProcessed: true };
        }

        await this.prisma.order.update({
            where: { id: payload.orderId },
            data: {
                status: OrderStatus.PAID,
                paidAt: new Date(),
            }
        });

        this.events.broadcastOrderStatus(
            order.id,
            order.userId || '',
            OrderStatus.PAID,
            order.ticket?.codeShort
        );

        return { received: true, success: true };
    }
}
