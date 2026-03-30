import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../common/services/audit.service';
import { AppSettingsService } from '../common/services/app-settings.service';
import { StockMode, PaymentMethod } from '../common/enums';

describe('OrdersService', () => {
    let service: OrdersService;
    let prisma: any;

    beforeEach(async () => {
        const prismaMock: any = {
            user: { findUnique: jest.fn() },
            product: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            order: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
            $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdersService,
                { provide: PrismaService, useValue: prismaMock },
                { provide: TicketsService, useValue: { generateTicket: jest.fn().mockResolvedValue({ id: 'ticket-1' }) } },
                { provide: AuditService, useValue: { log: jest.fn() } },
                { provide: AppSettingsService, useValue: { getSettings: jest.fn().mockReturnValue({ allowOnPickupPayment: true }) } },
            ],
        }).compile();

        service = module.get<OrdersService>(OrdersService);
        prisma = module.get(PrismaService);
        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            isActive: true,
            cpf: '12345678901',
            phone: '65999999999',
        });
    });

    it('deve criar pedido se tiver estoque ilimitado', async () => {
        prisma.product.findMany.mockResolvedValue([
            { id: 'prod1', name: 'Coxinha', priceCents: 500, stockMode: StockMode.UNLIMITED, isActive: true } as any,
        ]);
        prisma.order.create.mockResolvedValue({ id: 'order-1', totalCents: 500 } as any);
        prisma.order.findUnique.mockResolvedValue({
            id: 'order-1',
            totalCents: 500,
            items: [],
            ticket: null,
            paymentTransactions: [],
        } as any);

        const result = await service.createOrder('user-1', {
            paymentMethod: PaymentMethod.ONLINE,
            items: [{ productId: 'prod1', qty: 1 }],
        });

        expect(result.id).toBe('order-1');
        expect(result.ticket).toBeDefined();
    });

    it('deve falhar se o perfil do cliente estiver incompleto', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            isActive: true,
            cpf: null,
            phone: '65999999999',
        });

        await expect(
            service.createOrder('user-1', {
                paymentMethod: PaymentMethod.ONLINE,
                items: [{ productId: 'prod1', qty: 1 }],
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it('deve falhar se não tiver estoque controlado suficiente', async () => {
        prisma.product.findMany.mockResolvedValue([
            { id: 'prod1', name: 'Suco', priceCents: 300, stockMode: StockMode.CONTROLLED, stockQty: 0, isActive: true } as any,
        ]);

        await expect(
            service.createOrder('user-1', {
                paymentMethod: PaymentMethod.ONLINE,
                items: [{ productId: 'prod1', qty: 1 }],
            }),
        ).rejects.toThrow(BadRequestException);
    });
});
