import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../common/services/audit.service';
import { BadRequestException } from '@nestjs/common';
import { StockMode, PaymentMethod } from '../common/enums';

describe('OrdersService', () => {
    let service: OrdersService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdersService,
                {
                    provide: PrismaService,
                    useValue: {
                        product: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
                        order: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
                        $transaction: jest.fn((cb) => cb(prisma)),
                    },
                },
                {
                    provide: TicketsService,
                    useValue: { generateTicket: jest.fn().mockResolvedValue({ id: 'ticket-1' }) },
                },
                {
                    provide: AuditService,
                    useValue: { log: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<OrdersService>(OrdersService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('deve criar pedido se tiver estoque ilimitado', async () => {
        jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
            { id: 'prod1', name: 'Coxinha', priceCents: 500, stockMode: StockMode.UNLIMITED, isActive: true } as any
        ]);
        jest.spyOn(prisma.order, 'create').mockResolvedValue({ id: 'order-1', totalCents: 500 } as any);

        const result = await service.createOrder('user-1', {
            paymentMethod: PaymentMethod.PIX,
            items: [{ productId: 'prod1', qty: 1 }],
        });

        expect(result.id).toBe('order-1');
        expect(result.ticket).toBeDefined();
    });

    it('deve falhar se não tiver estoque controlado suficiente', async () => {
        jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
            { id: 'prod1', name: 'Suco', priceCents: 300, stockMode: StockMode.CONTROLLED, stockQty: 0, isActive: true } as any
        ]);

        await expect(
            service.createOrder('user-1', {
                paymentMethod: PaymentMethod.PIX,
                items: [{ productId: 'prod1', qty: 1 }],
            })
        ).rejects.toThrow(BadRequestException);
    });
});
