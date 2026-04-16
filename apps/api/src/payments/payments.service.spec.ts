import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { EventsGateway } from '../events/events.gateway';
import { AppSettingsService } from '../common/services/app-settings.service';
import { PaymentMethod } from '../common/enums';
import { Prisma } from '@prisma/client';
import * as crypto from 'node:crypto';

describe('PaymentsService', () => {
    let service: PaymentsService;
    let prisma: any;

    beforeEach(async () => {
        prisma = {
            order: {
                updateMany: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            paymentTransaction: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                findFirst: jest.fn(),
                count: jest.fn(),
            },
            paymentWebhookEvent: {
                create: jest.fn(),
            },
            user: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentsService,
                { provide: PrismaService, useValue: prisma },
                { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
                { provide: EventsGateway, useValue: { broadcastOrderStatus: jest.fn() } },
                { provide: AppSettingsService, useValue: { getSettings: jest.fn().mockReturnValue({ allowOnPickupPayment: true }) } },
            ],
        }).compile();

        service = module.get<PaymentsService>(PaymentsService);
    });

    it('reuses a pending card transaction instead of creating a new charge', async () => {
        const pendingTransaction = {
            id: 'txn-1',
            provider: 'MERCADO_PAGO',
            paymentMethod: PaymentMethod.CARD,
            status: 'PENDING',
            externalId: 'mp-1',
            externalReference: 'cantina:order-1:card:1',
            detailsJson: null,
            expiresAt: null,
            paidAt: null,
            lastError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const order = {
            id: 'order-1',
            channel: 'ONLINE',
            status: 'CREATED',
            paymentMethod: PaymentMethod.ONLINE,
            totalCents: 2590,
            user: {
                id: 'user-1',
                name: 'Cliente',
                email: 'cliente@cantina.local',
                cpf: '12345678901',
                phone: '65999999999',
                mercadoPagoCustomerId: null,
                isActive: true,
            },
            paymentTransactions: [pendingTransaction],
        };

        prisma.order.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
        prisma.paymentTransaction.findUnique.mockResolvedValue(pendingTransaction);
        prisma.paymentTransaction.count.mockResolvedValue(1);

        jest.spyOn(service as any, 'getOrderForPayment').mockResolvedValue(order);
        jest.spyOn(service as any, 'fetchGatewayStatus').mockResolvedValue(null);
        const createMercadoPagoCardSpy = jest.spyOn(service as any, 'createMercadoPagoCard');

        const result = await service.createCardPayment('order-1', 'user-1', 'CLIENT', {
            cardToken: 'tok_test',
            paymentMethodId: 'visa',
        });

        expect(result.id).toBe('txn-1');
        expect(createMercadoPagoCardSpy).not.toHaveBeenCalled();
    });

    it('blocks a second payment initiation while the order is locked', async () => {
        const order = {
            id: 'order-1',
            channel: 'ONLINE',
            status: 'CREATED',
            paymentMethod: PaymentMethod.ONLINE,
            totalCents: 2590,
            user: {
                id: 'user-1',
                name: 'Cliente',
                email: 'cliente@cantina.local',
                cpf: '12345678901',
                phone: '65999999999',
                mercadoPagoCustomerId: null,
                isActive: true,
            },
            paymentTransactions: [],
        };

        prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
        prisma.order.findUnique.mockResolvedValue({
            paymentLockMethod: 'CARD',
            paymentLockExpiresAt: new Date('2026-04-01T12:00:00.000Z'),
        });

        jest.spyOn(service as any, 'getOrderForPayment').mockResolvedValue(order);

        await expect(
            service.createCardPayment('order-1', 'user-1', 'CLIENT', {
                cardToken: 'tok_test',
                paymentMethodId: 'visa',
            }),
        ).rejects.toThrow(ConflictException);
    });

    it('does not append the webhook secret to generated callback URLs', () => {
        const previousPublicUrl = process.env.APP_PUBLIC_URL;
        const previousWebhookSecret = process.env.WEBHOOK_SHARED_SECRET;

        process.env.APP_PUBLIC_URL = 'https://cantina.example.com';
        process.env.WEBHOOK_SHARED_SECRET = 'top-secret';

        const url = (service as any).buildWebhookUrl('mercadopago');

        expect(url).toBe('https://cantina.example.com/api/v1/webhooks/mercadopago');

        process.env.APP_PUBLIC_URL = previousPublicUrl;
        process.env.WEBHOOK_SHARED_SECRET = previousWebhookSecret;
    });

    it('requires AbacatePay signature in production', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousHmacKey = process.env.ABACATEPAY_PUBLIC_HMAC_KEY;

        process.env.NODE_ENV = 'production';
        delete process.env.ABACATEPAY_PUBLIC_HMAC_KEY;

        expect(() => (service as any).verifyAbacateSignature(undefined, '{}')).toThrow('Assinatura HMAC da AbacatePay ausente');

        process.env.NODE_ENV = previousNodeEnv;
        process.env.ABACATEPAY_PUBLIC_HMAC_KEY = previousHmacKey;
    });

    it('rejects duplicate webhook events', async () => {
        prisma.paymentWebhookEvent.create
            .mockResolvedValueOnce({ id: 'evt-1' })
            .mockRejectedValueOnce({ code: 'P2002' } as Prisma.PrismaClientKnownRequestError);

        await expect(
            (service as any).registerWebhookEvent('MERCADO_PAGO', 'evt-key', 'payment', 'txn-1', 'order-1', { id: 'evt-1' }),
        ).resolves.toBe(true);

        await expect(
            (service as any).registerWebhookEvent('MERCADO_PAGO', 'evt-key', 'payment', 'txn-1', 'order-1', { id: 'evt-1' }),
        ).resolves.toBe(false);
    });

    it('ignores invalid status regressions from approved to pending', async () => {
        prisma.paymentTransaction.findUnique.mockResolvedValue({
            status: 'APPROVED',
            provider: 'MERCADO_PAGO',
            paymentMethod: PaymentMethod.CARD,
            attemptKey: 'attempt-1',
        });

        const result = await (service as any).applyWebhookResult(
            'txn-1',
            'order-1',
            {
                provider: 'MERCADO_PAGO',
                paymentMethod: 'CARD',
                status: 'PENDING',
            },
            'webhook_mercadopago',
        );

        expect(result).toBe(false);
        expect(prisma.paymentTransaction.update).not.toHaveBeenCalled();
    });

    it('reconciles pending payments in background', async () => {
        prisma.paymentTransaction.findMany.mockResolvedValue([
            {
                id: 'txn-1',
                orderId: 'order-1',
                provider: 'MERCADO_PAGO',
                paymentMethod: PaymentMethod.PIX,
                externalId: 'mp-1',
                externalReference: 'cantina:order-1:pix:1',
                detailsJson: null,
            },
        ]);

        jest.spyOn(service as any, 'fetchGatewayStatus').mockResolvedValue({
            provider: 'MERCADO_PAGO',
            paymentMethod: 'PIX',
            status: 'APPROVED',
        });
        const applySpy = jest.spyOn(service as any, 'applyWebhookResult').mockResolvedValue(true);

        const result = await service.reconcilePendingPaymentsBatch(10);

        expect(result).toEqual({
            scanned: 1,
            updated: 1,
            failed: 0,
        });
        expect(applySpy).toHaveBeenCalledWith(
            'txn-1',
            'order-1',
            expect.objectContaining({ status: 'APPROVED' }),
            'scheduler_reconcile',
        );
    });

    it('alerts on abnormal retry patterns', async () => {
        prisma.paymentTransaction.count.mockResolvedValue(5);
        const alertSpy = jest.spyOn(service as any, 'raiseOperationalAlert').mockResolvedValue(undefined);

        await (service as any).raiseAbnormalRetryAlertIfNeeded('order-1', 'txn-1', 'MERCADO_PAGO', 'CARD');

        expect(alertSpy).toHaveBeenCalledWith('PAYMENT_ABNORMAL_RETRY_PATTERN', expect.objectContaining({
            orderId: 'order-1',
            transactionId: 'txn-1',
            recentAttempts: 5,
        }));
    });

    it('alerts on duplicate approvals', async () => {
        prisma.paymentTransaction.count.mockResolvedValue(2);
        const alertSpy = jest.spyOn(service as any, 'raiseOperationalAlert').mockResolvedValue(undefined);

        await (service as any).raiseDuplicateApprovalAlertIfNeeded('order-1', 'txn-1', 'APPROVED', 'MERCADO_PAGO');

        expect(alertSpy).toHaveBeenCalledWith('PAYMENT_DUPLICATE_APPROVAL', expect.objectContaining({
            orderId: 'order-1',
            transactionId: 'txn-1',
            approvedCount: 2,
        }));
    });

    it('validates Mercado Pago webhook signatures when configured', () => {
        const previousSecret = process.env.MP_WEBHOOK_SECRET;
        process.env.MP_WEBHOOK_SECRET = 'mercado-secret';

        const manifest = 'id:123;request-id:req-1;ts:1710000000;';
        const signature = crypto
            .createHmac('sha256', 'mercado-secret')
            .update(manifest)
            .digest('hex');

        expect(() => (service as any).verifyMercadoPagoSignature(`ts=1710000000,v1=${signature}`, 'req-1', '123')).not.toThrow();

        process.env.MP_WEBHOOK_SECRET = previousSecret;
    });
});
