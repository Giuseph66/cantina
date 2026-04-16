import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { EventsGateway } from '../events/events.gateway';
import { AppSettingsService } from '../common/services/app-settings.service';
import { OrderStatus, PaymentMethod } from '../common/enums';
import { CreateCardPaymentDto, CreatePixPaymentDto } from './dto/payment.dto';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

type GatewayProvider = 'MERCADO_PAGO' | 'ABACATE_PAY';
type InternalPaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGEBACK';
type PaymentInitiationMethod = 'PIX' | 'CARD';

const PAYMENT_LOCK_TTL_MS = 30_000;

type GatewayPaymentResult = {
    provider: GatewayProvider;
    paymentMethod: 'PIX' | 'CARD';
    externalId?: string | null;
    externalReference?: string | null;
    attemptKey?: string | null;
    gatewayRequestId?: string | null;
    status: InternalPaymentStatus;
    details?: Record<string, unknown> | null;
    paidAt?: Date | null;
    expiresAt?: Date | null;
    webhookVerifiedAt?: Date | null;
    webhookSource?: string | null;
    lastError?: string | null;
    webhookPayload?: Record<string, unknown> | null;
};

@Injectable()
export class PaymentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
        private readonly events: EventsGateway,
        private readonly appSettings: AppSettingsService,
    ) { }

    getPublicConfig() {
        const settings = this.appSettings.getSettings();
        const mercadoPagoPublicKey = this.getMercadoPagoPublicKey();
        const mercadoPagoAccessToken = this.getMercadoPagoAccessToken();
        const abacateApiKey = this.getAbacateApiKey();

        const pixEnabled = !!(mercadoPagoAccessToken || abacateApiKey);
        const cardEnabled = !!(mercadoPagoAccessToken && mercadoPagoPublicKey);

        return {
            allowOnPickupPayment: settings.allowOnPickupPayment,
            onlineEnabled: pixEnabled || cardEnabled,
            pixEnabled,
            cardEnabled,
            mercadoPagoPublicKey: cardEnabled ? mercadoPagoPublicKey : null,
        };
    }

    async createPixPayment(orderId: string, userId: string, role: string, _dto: CreatePixPaymentDto) {
        await this.getOrderForPayment(orderId, userId, role);

        return this.withOrderPaymentLock(orderId, 'PIX', async () => {
            const order = await this.getOrderForPayment(orderId, userId, role);
            const payer = this.resolvePayer(order.user);

            const reusableTransaction = order.paymentTransactions.find((transaction: any) => {
                if (transaction.paymentMethod !== PaymentMethod.PIX) return false;
                if (transaction.status !== 'PENDING') return false;
                if (!transaction.detailsJson) return false;
                if (transaction.expiresAt && transaction.expiresAt <= new Date()) return false;
                return true;
            });

            if (reusableTransaction) {
                await this.audit.log(order.user?.id ?? null, 'PAYMENT_ATTEMPT_REUSED', 'PaymentTransaction', reusableTransaction.id, {
                    orderId: order.id,
                    provider: reusableTransaction.provider,
                    paymentMethod: reusableTransaction.paymentMethod,
                    status: reusableTransaction.status,
                });
                return this.serializePaymentTransaction(reusableTransaction);
            }

            const provider = this.pickPixProvider(order.totalCents);
            const externalReference = this.buildExternalReference(order.id, 'pix');
            const result = provider === 'MERCADO_PAGO'
                ? await this.createMercadoPagoPix(order, payer, externalReference)
                : await this.createAbacatePix(order, payer, externalReference);

            const transaction = await this.persistPaymentResult(order.id, payer, result);
            await this.logPaymentAttempt(order.user?.id ?? null, order.id, transaction.id, result, 'checkout_pix');
            await this.auditPaymentStatus(order.user?.id ?? null, order.id, transaction.id, result.status, 'checkout_pix');

            await this.prisma.order.update({
                where: { id: order.id },
                data: { paymentMethod: PaymentMethod.PIX },
            });

            if (result.status === 'APPROVED') {
                await this.markOrderPaid(order.id, result.paidAt ?? new Date(), PaymentMethod.PIX);
            }

            return this.serializePaymentTransaction(transaction);
        });
    }

    async reconcileOrderPayment(orderId: string, userId: string, role: string) {
        const order = await this.getOwnedOrder(orderId, userId, role, {
            paymentTransactions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
        });

        const latestTransaction = order.paymentTransactions[0] ?? null;
        if (latestTransaction?.status === 'PENDING') {
            const result = await this.fetchGatewayStatus(latestTransaction);
            if (result) {
                await this.applyWebhookResult(latestTransaction.id, order.id, result, 'reconcile');
            }
        }

        const refreshedOrder = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                paymentTransactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (!refreshedOrder) {
            throw new NotFoundException('Pedido não encontrado');
        }

        return {
            orderId: refreshedOrder.id,
            orderStatus: refreshedOrder.status,
            paymentMethod: refreshedOrder.paymentMethod,
            totalCents: refreshedOrder.totalCents,
            latestPayment: refreshedOrder.paymentTransactions[0]
                ? this.serializePaymentTransaction(refreshedOrder.paymentTransactions[0])
                : null,
        };
    }

    async reconcilePendingPaymentsBatch(limit = this.getPaymentReconciliationBatchSize()) {
        const pendingTransactions = await this.prisma.paymentTransaction.findMany({
            where: {
                status: 'PENDING',
                externalId: { not: null },
                order: {
                    is: {
                        status: {
                            notIn: [
                                OrderStatus.PAID,
                                OrderStatus.READY,
                                OrderStatus.PICKED_UP,
                                OrderStatus.CANCELLED,
                                OrderStatus.EXPIRED,
                            ],
                        },
                    },
                },
            },
            select: {
                id: true,
                orderId: true,
                provider: true,
                paymentMethod: true,
                externalId: true,
                externalReference: true,
                detailsJson: true,
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });

        let updated = 0;
        let failed = 0;

        for (const transaction of pendingTransactions) {
            try {
                const result = await this.fetchGatewayStatus(transaction);
                if (!result) {
                    continue;
                }

                const applied = await this.applyWebhookResult(transaction.id, transaction.orderId, result, 'scheduler_reconcile');
                if (applied) {
                    updated += 1;
                }
            } catch (error) {
                failed += 1;
                console.error('[Payments] Erro ao reconciliar pagamento pendente', {
                    transactionId: transaction.id,
                    orderId: transaction.orderId,
                    error,
                });
            }
        }

        return {
            scanned: pendingTransactions.length,
            updated,
            failed,
        };
    }

    async createCardPayment(orderId: string, userId: string, role: string, dto: CreateCardPaymentDto) {
        await this.getOrderForPayment(orderId, userId, role);

        return this.withOrderPaymentLock(orderId, 'CARD', async () => {
            const order = await this.getOrderForPayment(orderId, userId, role);
            const payer = this.resolvePayer(order.user);

            const reusableTransaction = order.paymentTransactions.find((transaction: any) => {
                if (transaction.paymentMethod !== PaymentMethod.CARD) return false;
                if (transaction.status !== 'PENDING') return false;
                return true;
            });

            if (reusableTransaction) {
                const result = await this.fetchGatewayStatus(reusableTransaction);
                if (result) {
                    await this.applyWebhookResult(reusableTransaction.id, order.id, result, 'card_reuse_reconcile');
                }

                const refreshedTransaction = await this.prisma.paymentTransaction.findUnique({
                    where: { id: reusableTransaction.id },
                });

                if (refreshedTransaction && ['PENDING', 'APPROVED'].includes(refreshedTransaction.status)) {
                    await this.audit.log(order.user?.id ?? null, 'PAYMENT_ATTEMPT_REUSED', 'PaymentTransaction', refreshedTransaction.id, {
                        orderId: order.id,
                        provider: refreshedTransaction.provider,
                        paymentMethod: refreshedTransaction.paymentMethod,
                        status: refreshedTransaction.status,
                    });
                    return this.serializePaymentTransaction(refreshedTransaction);
                }
            }

            let customerId = order.user?.mercadoPagoCustomerId ?? null;
            if (!customerId && (dto.saveCard || dto.cardId)) {
                customerId = await this.getOrCreateMercadoPagoCustomer(order.user!);
            }

            const result = await this.createMercadoPagoCard(order, payer, dto, customerId);
            const transaction = await this.persistPaymentResult(order.id, payer, result);
            await this.logPaymentAttempt(order.user?.id ?? null, order.id, transaction.id, result, 'checkout_card');
            await this.auditPaymentStatus(order.user?.id ?? null, order.id, transaction.id, result.status, 'checkout_card');

            if (result.status === 'APPROVED' && dto.saveCard && dto.cardToken && customerId) {
                await this.saveCardToMercadoPagoCustomer(customerId, dto.cardToken).catch(err => {
                    console.error('[Payments] Erro ao salvar cartão no cliente', err);
                });
            }

            await this.prisma.order.update({
                where: { id: order.id },
                data: { paymentMethod: PaymentMethod.CARD },
            });

            if (result.status === 'APPROVED') {
                await this.markOrderPaid(order.id, result.paidAt ?? new Date(), PaymentMethod.CARD);
            }

            return this.serializePaymentTransaction(transaction);
        });
    }

    async listSavedCards(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { mercadoPagoCustomerId: true },
        });

        if (!user?.mercadoPagoCustomerId) {
            return [];
        }

        try {
            return await this.listMercadoPagoCustomerCards(user.mercadoPagoCustomerId);
        } catch (err) {
            console.error('[Payments] Erro ao listar cartões do cliente', err);
            return [];
        }
    }

    async handleMercadoPagoWebhook(
        webhookSecret: string | undefined,
        signature: string | undefined,
        requestId: string | undefined,
        body: Record<string, any>,
        query: Record<string, string | undefined>,
    ) {
        const topic = body.type ?? query.type ?? query.topic;
        const paymentId = String(body.data?.id ?? query['data.id'] ?? query.id ?? '');

        if (topic !== 'payment' || !paymentId) {
            return { received: true, ignored: true };
        }

        this.verifyMercadoPagoSignature(signature, requestId, paymentId);
        this.assertWebhookSecret(webhookSecret ?? query.webhookSecret, { required: false });

        const payment = await this.fetchMercadoPagoPayment(String(paymentId));
        const externalReference = typeof payment.external_reference === 'string'
            ? payment.external_reference
            : null;
        const amountCents = Math.round(Number(payment.transaction_amount ?? 0) * 100);
        const transaction = await this.prisma.paymentTransaction.findFirst({
            where: {
                provider: 'MERCADO_PAGO',
                OR: [
                    { externalId: String(payment.id) },
                    ...(externalReference ? [{ externalReference }] : []),
                ],
            },
            include: { order: true },
            orderBy: { createdAt: 'desc' },
        });

        if (!transaction) {
            throw new NotFoundException('Transação do Mercado Pago não encontrada');
        }

        if (transaction.amountCents !== amountCents) {
            await this.raiseOperationalAlert('PAYMENT_AMOUNT_MISMATCH', {
                provider: 'MERCADO_PAGO',
                orderId: transaction.orderId,
                transactionId: transaction.id,
                expectedAmountCents: transaction.amountCents,
                receivedAmountCents: amountCents,
            });
            throw new UnauthorizedException('Valor do pagamento divergente');
        }

        const eventKey = this.buildMercadoPagoWebhookEventKey(body, paymentId, topic);
        const registered = await this.registerWebhookEvent(
            'MERCADO_PAGO',
            eventKey,
            String(topic),
            transaction.id,
            transaction.orderId,
            body,
        );

        if (!registered) {
            return { received: true, duplicate: true, ignored: true };
        }

        const result: GatewayPaymentResult = {
            provider: 'MERCADO_PAGO',
            paymentMethod: transaction.paymentMethod === PaymentMethod.CARD ? 'CARD' : 'PIX',
            externalId: String(payment.id),
            externalReference,
            attemptKey: transaction.attemptKey ?? externalReference,
            gatewayRequestId: requestId ?? null,
            status: this.mapMercadoPagoStatus(payment.status),
            paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
            expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
            webhookVerifiedAt: new Date(),
            webhookSource: 'webhook_mercadopago',
            lastError: payment.status_detail ?? null,
            details: {
                statusDetail: payment.status_detail ?? null,
                qrCode: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
                qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
                ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
            },
            webhookPayload: body,
        };

        const applied = await this.applyWebhookResult(transaction.id, transaction.orderId, result, 'webhook_mercadopago');
        return { received: true, success: true, ignored: !applied };
    }

    async handleAbacatePayWebhook(
        webhookSecret: string | undefined,
        signature: string | undefined,
        rawBody: string,
        body: Record<string, any>,
    ) {
        this.assertWebhookSecret(webhookSecret, { required: false });
        this.verifyAbacateSignature(signature, rawBody);

        const event = body.event;
        const transparent = body.data?.transparent;
        const legacyPixId = body.transaction_id ?? body.id ?? body.data?.id;
        const legacyStatus = body.status ?? body.data?.status;
        if (!event || !transparent?.id) {
            if (!legacyPixId || !legacyStatus) {
                return { received: true, ignored: true };
            }

            const transaction = await this.prisma.paymentTransaction.findFirst({
                where: {
                    provider: 'ABACATE_PAY',
                    OR: [
                        { externalId: String(legacyPixId) },
                        ...(body.metadata?.externalId ? [{ externalReference: String(body.metadata.externalId) }] : []),
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });

            if (!transaction) {
                throw new NotFoundException('Transação da AbacatePay não encontrada');
            }

            const eventKey = this.buildAbacateWebhookEventKey(body, String(legacyPixId), legacyStatus);
            const registered = await this.registerWebhookEvent(
                'ABACATE_PAY',
                eventKey,
                typeof event === 'string' ? event : 'legacy',
                transaction.id,
                transaction.orderId,
                body,
            );

            if (!registered) {
                return { received: true, duplicate: true, ignored: true };
            }

            const currentDetails = this.parseJson<Record<string, unknown>>(transaction.detailsJson) ?? {};
            const result: GatewayPaymentResult = {
                provider: 'ABACATE_PAY',
                paymentMethod: 'PIX',
                externalId: String(legacyPixId),
                externalReference: transaction.externalReference,
                attemptKey: transaction.attemptKey ?? transaction.externalReference,
                status: this.mapAbacateTransparentStatus(legacyStatus),
                paidAt: this.mapAbacateTransparentStatus(legacyStatus) === 'APPROVED'
                    ? new Date(body.updatedAt ?? body.data?.updatedAt ?? Date.now())
                    : null,
                expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
                webhookVerifiedAt: new Date(),
                webhookSource: 'webhook_abacatepay_legacy',
                details: {
                    ...currentDetails,
                    statusDetail: legacyStatus,
                },
                webhookPayload: body,
            };

                const applied = await this.applyWebhookResult(transaction.id, transaction.orderId, result, 'webhook_abacatepay_legacy');
                return { received: true, success: true, ignored: !applied };
        }

        const transaction = await this.prisma.paymentTransaction.findFirst({
            where: {
                provider: 'ABACATE_PAY',
                OR: [
                    { externalId: String(transparent.id) },
                    ...(transparent.externalId ? [{ externalReference: String(transparent.externalId) }] : []),
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!transaction) {
            throw new NotFoundException('Transação da AbacatePay não encontrada');
        }

        const expectedAmountCents = Number(transparent.paidAmount ?? transparent.amount ?? 0);
        if (Number.isFinite(expectedAmountCents) && expectedAmountCents > 0 && transaction.amountCents !== expectedAmountCents) {
            await this.raiseOperationalAlert('PAYMENT_AMOUNT_MISMATCH', {
                provider: 'ABACATE_PAY',
                orderId: transaction.orderId,
                transactionId: transaction.id,
                expectedAmountCents: transaction.amountCents,
                receivedAmountCents: expectedAmountCents,
            });
            throw new UnauthorizedException('Valor do pagamento divergente');
        }

        const eventKey = this.buildAbacateWebhookEventKey(body, String(transparent.id), transparent.status);
        const registered = await this.registerWebhookEvent(
            'ABACATE_PAY',
            eventKey,
            typeof event === 'string' ? event : 'transparent.unknown',
            transaction.id,
            transaction.orderId,
            body,
        );

        if (!registered) {
            return { received: true, duplicate: true, ignored: true };
        }

        const status = this.mapAbacateStatus(event, transparent.status);
        const result: GatewayPaymentResult = {
            provider: 'ABACATE_PAY',
            paymentMethod: 'PIX',
            externalId: String(transparent.id),
            externalReference: transparent.externalId ? String(transparent.externalId) : transaction.externalReference,
            attemptKey: transaction.attemptKey ?? transaction.externalReference,
            status,
            paidAt: status === 'APPROVED' ? new Date(transparent.updatedAt ?? Date.now()) : null,
            expiresAt: transparent.expiresAt ? new Date(transparent.expiresAt) : null,
            webhookVerifiedAt: new Date(),
            webhookSource: 'webhook_abacatepay',
            details: {
                receiptUrl: transparent.receiptUrl ?? null,
                methods: transparent.methods ?? [],
                status: transparent.status ?? null,
            },
            webhookPayload: body,
        };

        const applied = await this.applyWebhookResult(transaction.id, transaction.orderId, result, 'webhook_abacatepay');
        return { received: true, success: true, ignored: !applied };
    }

    serializePaymentTransaction(transaction: {
        id: string;
        provider: string;
        paymentMethod: string;
        status: string;
        externalId: string | null;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date | null;
        paidAt: Date | null;
        lastError: string | null;
        detailsJson: string | null;
    }) {
        const details = this.parseJson<Record<string, unknown>>(transaction.detailsJson);
        return {
            id: transaction.id,
            provider: transaction.provider,
            paymentMethod: transaction.paymentMethod,
            status: transaction.status,
            externalId: transaction.externalId,
            expiresAt: transaction.expiresAt,
            paidAt: transaction.paidAt,
            lastError: transaction.lastError,
            qrCode: details?.qrCode ?? null,
            qrCodeBase64: this.normalizeQrCodeBase64(details?.qrCodeBase64),
            ticketUrl: details?.ticketUrl ?? null,
            brand: details?.brand ?? null,
            lastFourDigits: details?.lastFourDigits ?? null,
            statusDetail: details?.statusDetail ?? null,
            receiptUrl: details?.receiptUrl ?? null,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
        };
    }

    private async getOrderForPayment(orderId: string, userId: string, role: string): Promise<any> {
        const order = await this.getOwnedOrder(orderId, userId, role, {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    cpf: true,
                    phone: true,
                    mercadoPagoCustomerId: true,
                    isActive: true,
                },
            },
            paymentTransactions: {
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    provider: true,
                    paymentMethod: true,
                    status: true,
                    externalId: true,
                    externalReference: true,
                    attemptKey: true,
                    detailsJson: true,
                    expiresAt: true,
                    paidAt: true,
                    lastError: true,
                    createdAt: true,
                    updatedAt: true,
                },
            },
        });

        if (order.channel !== 'ONLINE') {
            throw new BadRequestException('Somente pedidos online aceitam este pagamento');
        }

        if (
            order.status === OrderStatus.PAID
            || order.status === OrderStatus.READY
            || order.status === OrderStatus.PICKED_UP
            || order.status === OrderStatus.CANCELLED
            || order.status === OrderStatus.EXPIRED
        ) {
            throw new BadRequestException('Este pedido não aceita novos pagamentos');
        }

        if (order.paymentMethod === PaymentMethod.ON_PICKUP) {
            throw new BadRequestException('Este pedido está configurado para pagamento no balcão');
        }

        if (!order.user?.isActive) {
            throw new ForbiddenException('Conta desativada para realizar pagamentos.');
        }

        if (!order.user?.cpf || !order.user?.phone) {
            throw new BadRequestException('Complete CPF e celular antes de iniciar o pagamento.');
        }

        return order;
    }

    private resolvePayer(
        user: { name: string; email: string; cpf: string | null; phone: string | null } | null,
    ) {
        if (!user) {
            throw new ForbiddenException('Pedido sem cliente vinculado não pode ser pago online.');
        }

        const payerName = (user.name ?? '').trim();
        const payerEmail = (user.email ?? '').trim();
        const payerDocument = this.normalizeDocument(user.cpf ?? '');
        const payerPhone = this.normalizePhone(user.phone ?? '');

        if (!payerName) {
            throw new BadRequestException('Informe o nome do pagador');
        }

        if (!payerEmail) {
            throw new BadRequestException('Informe o e-mail do pagador');
        }

        if (![11, 14].includes(payerDocument.length)) {
            throw new BadRequestException('Informe um CPF ou CNPJ válido');
        }

        return { payerName, payerEmail, payerDocument, payerPhone };
    }

    private async getOwnedOrder(orderId: string, userId: string, role: string, include: any): Promise<any> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include,
        }) as any;

        if (!order) {
            throw new NotFoundException('Pedido não encontrado');
        }

        if (role === 'CLIENT' && order.userId !== userId) {
            throw new ForbiddenException('Acesso negado a este pedido.');
        }

        return order;
    }

    private async createMercadoPagoPix(
        order: { id: string; totalCents: number },
        payer: { payerName: string; payerEmail: string; payerDocument: string; payerPhone?: string },
        externalReference: string,
    ): Promise<GatewayPaymentResult> {
        const accessToken = this.getMercadoPagoAccessToken();
        if (!accessToken) {
            throw new InternalServerErrorException('Mercado Pago não configurado');
        }

        const { payload: response, meta } = await this.requestJsonWithMeta('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': this.buildMercadoPagoIdempotencyKey(externalReference),
            },
            body: JSON.stringify({
                transaction_amount: order.totalCents / 100,
                payment_method_id: 'pix',
                external_reference: externalReference,
                notification_url: this.buildWebhookUrl('mercadopago'),
                description: `Pedido ${order.id.slice(0, 8)}`,
                payer: {
                    email: payer.payerEmail,
                    first_name: this.splitName(payer.payerName).firstName,
                    last_name: this.splitName(payer.payerName).lastName,
                    identification: {
                        type: payer.payerDocument.length === 14 ? 'CNPJ' : 'CPF',
                        number: payer.payerDocument,
                    },
                },
            }),
        });

        return {
            provider: 'MERCADO_PAGO',
            paymentMethod: 'PIX',
            externalId: response.id ? String(response.id) : null,
            externalReference: response.external_reference ?? externalReference,
            attemptKey: externalReference,
            gatewayRequestId: meta.requestId,
            status: this.mapMercadoPagoStatus(response.status),
            paidAt: response.date_approved ? new Date(response.date_approved) : null,
            expiresAt: response.date_of_expiration ? new Date(response.date_of_expiration) : null,
            lastError: response.status_detail ?? null,
            details: {
                qrCode: response.point_of_interaction?.transaction_data?.qr_code ?? null,
                qrCodeBase64: response.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
                ticketUrl: response.point_of_interaction?.transaction_data?.ticket_url ?? null,
                statusDetail: response.status_detail ?? null,
            },
        };
    }

    private async createMercadoPagoCard(
        order: { id: string; totalCents: number },
        payer: { payerName: string; payerEmail: string; payerDocument: string; payerPhone?: string },
        dto: CreateCardPaymentDto,
        customerId?: string | null,
    ): Promise<GatewayPaymentResult> {
        const accessToken = this.getMercadoPagoAccessToken();
        if (!accessToken) {
            throw new InternalServerErrorException('Mercado Pago não configurado');
        }

        const isSavedCardPayment = !!(dto.cardId && customerId);

        const body: any = {
            transaction_amount: order.totalCents / 100,
            description: `Pedido ${order.id.slice(0, 8)}`,
            installments: dto.installments ?? 1,
            external_reference: this.buildExternalReference(order.id, 'card'),
            notification_url: this.buildWebhookUrl('mercadopago'),
            binary_mode: true,
        };

        if (isSavedCardPayment) {
            body.payer = {
                type: 'customer',
                id: customerId,
            };
        } else {
            body.issuer_id = dto.issuerId || undefined;
            body.payment_method_id = dto.paymentMethodId;
            body.payer = {
                email: payer.payerEmail,
                identification: {
                    type: payer.payerDocument.length === 14 ? 'CNPJ' : 'CPF',
                    number: payer.payerDocument,
                },
            };
        }

        if (dto.cardToken) {
            body.token = dto.cardToken;
        } else if (dto.cardId) {
            body.token = dto.cardId;
        } else {
            throw new BadRequestException('Token ou ID do cartão é obrigatório');
        }

        const { payload: response, meta } = await this.requestJsonWithMeta('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': this.buildMercadoPagoIdempotencyKey(body.external_reference),
            },
            body: JSON.stringify(body),
        });

        return {
            provider: 'MERCADO_PAGO',
            paymentMethod: 'CARD',
            externalId: response.id ? String(response.id) : null,
            externalReference: response.external_reference ?? null,
            attemptKey: body.external_reference,
            gatewayRequestId: meta.requestId,
            status: this.mapMercadoPagoStatus(response.status),
            paidAt: response.date_approved ? new Date(response.date_approved) : null,
            expiresAt: null,
            lastError: response.status === 'approved' ? null : this.translateMercadoPagoError(response.status_detail),
            details: {
                statusDetail: response.status_detail ?? null,
                brand: response.payment_method_id ?? dto.paymentMethodId,
                lastFourDigits: response.card?.last_four_digits ?? null,
            },
        };
    }

    private async getOrCreateMercadoPagoCustomer(user: { id: string; name: string; email: string; cpf: string | null; phone: string | null; mercadoPagoCustomerId?: string | null }) {
        if (user.mercadoPagoCustomerId) {
            return user.mercadoPagoCustomerId;
        }

        const accessToken = this.getMercadoPagoAccessToken();
        const { firstName, lastName } = this.splitName(user.name);

        let customer: any;
        try {
            customer = await this.requestJson('https://api.mercadopago.com/v1/customers', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: user.email,
                    first_name: firstName,
                    last_name: lastName,
                    phone: user.phone ? { area_code: user.phone.slice(0, 2), number: user.phone.slice(2) } : undefined,
                    identification: user.cpf ? { type: 'CPF', number: user.cpf } : undefined,
                }),
            });
        } catch (error) {
            if (!this.isMercadoPagoDuplicateCustomer(error)) {
                throw error;
            }

            customer = await this.findMercadoPagoCustomerByEmail(user.email);
            if (!customer?.id) {
                throw error;
            }
        }

        await this.prisma.user.update({
            where: { id: user.id },
            data: { mercadoPagoCustomerId: String(customer.id) },
        });

        return String(customer.id);
    }

    private async listMercadoPagoCustomerCards(customerId: string) {
        const accessToken = this.getMercadoPagoAccessToken();
        const cards = await this.requestJson(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!Array.isArray(cards)) return [];

        return cards.map((c: any) => ({
            id: c.id,
            lastFourDigits: c.last_four_digits,
            brand: c.payment_method?.name || c.payment_method?.id,
            paymentMethodId: c.payment_method?.id ?? null,
            issuerId: c.issuer?.id ? String(c.issuer.id) : null,
            expirationMonth: c.expiration_month,
            expirationYear: c.expiration_year,
            thumbnail: c.payment_method?.thumbnail,
        }));
    }

    private async saveCardToMercadoPagoCustomer(customerId: string, cardToken: string) {
        const accessToken = this.getMercadoPagoAccessToken();
        return this.requestJson(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: cardToken }),
        });
    }

    private async findMercadoPagoCustomerByEmail(email: string) {
        const accessToken = this.getMercadoPagoAccessToken();
        const url = new URL('https://api.mercadopago.com/v1/customers/search');
        url.searchParams.set('email', email);

        const payload = await this.requestJson(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (Array.isArray(payload?.results) && payload.results.length > 0) {
            return payload.results[0];
        }

        return null;
    }

    private async createAbacatePix(
        order: { id: string; totalCents: number },
        payer: { payerName: string; payerEmail: string; payerDocument: string; payerPhone?: string },
        externalReference: string,
    ): Promise<GatewayPaymentResult> {
        const apiKey = this.getAbacateApiKey();
        if (!apiKey) {
            throw new InternalServerErrorException('AbacatePay não configurado');
        }

        if (!payer.payerPhone) {
            throw new BadRequestException('Informe o celular do pagador para gerar este PIX.');
        }

        const { payload: response, meta } = await this.requestJsonWithMeta('https://api.abacatepay.com/v1/pixQrCode/create', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: order.totalCents,
                description: `Pedido ${order.id.slice(0, 8)}`,
                expiresIn: 3600,
                customer: {
                    name: payer.payerName,
                    email: payer.payerEmail,
                    taxId: payer.payerDocument,
                    cellphone: payer.payerPhone,
                },
                metadata: {
                    orderId: order.id,
                    externalId: externalReference,
                },
            }),
        });

        const paymentData = response.data ?? response;
        return {
            provider: 'ABACATE_PAY',
            paymentMethod: 'PIX',
            externalId: paymentData.id ? String(paymentData.id) : null,
            externalReference,
            attemptKey: externalReference,
            gatewayRequestId: meta.requestId,
            status: this.mapAbacateTransparentStatus(paymentData.status),
            paidAt: null,
            expiresAt: paymentData.expiresAt ? new Date(paymentData.expiresAt) : null,
            lastError: null,
            details: {
                qrCode: paymentData.brCode ?? null,
                qrCodeBase64: paymentData.brCodeBase64 ?? null,
                statusDetail: paymentData.status ?? null,
            },
        };
    }

    private async persistPaymentResult(
        orderId: string,
        payer: { payerName: string; payerEmail: string; payerDocument: string; payerPhone?: string },
        result: GatewayPaymentResult,
    ) {
        return this.prisma.paymentTransaction.create({
            data: {
                orderId,
                provider: result.provider,
                paymentMethod: result.paymentMethod === 'CARD' ? PaymentMethod.CARD : PaymentMethod.PIX,
                status: result.status,
                externalId: result.externalId ?? undefined,
                externalReference: result.externalReference ?? undefined,
                attemptKey: result.attemptKey ?? result.externalReference ?? undefined,
                gatewayRequestId: result.gatewayRequestId ?? undefined,
                amountCents: await this.getOrderAmount(orderId),
                payerName: payer.payerName,
                payerEmail: payer.payerEmail,
                payerDocument: payer.payerDocument,
                detailsJson: result.details ? JSON.stringify(result.details) : undefined,
                webhookPayloadJson: result.webhookPayload ? JSON.stringify(result.webhookPayload) : undefined,
                webhookVerifiedAt: result.webhookVerifiedAt ?? undefined,
                webhookSource: result.webhookSource ?? undefined,
                lastError: result.lastError ?? undefined,
                paidAt: result.paidAt ?? undefined,
                expiresAt: result.expiresAt ?? undefined,
            },
        });
    }

    private async fetchGatewayStatus(transaction: {
        id: string;
        provider: string;
        paymentMethod: string;
        externalId: string | null;
        externalReference: string | null;
        detailsJson: string | null;
    }): Promise<GatewayPaymentResult | null> {
        if (!transaction.externalId) {
            return null;
        }

        const currentDetails = this.parseJson<Record<string, unknown>>(transaction.detailsJson) ?? {};

        if (transaction.provider === 'MERCADO_PAGO') {
            try {
                const payment = await this.fetchMercadoPagoPayment(String(transaction.externalId));
                return {
                    provider: 'MERCADO_PAGO',
                    paymentMethod: transaction.paymentMethod === PaymentMethod.CARD ? 'CARD' : 'PIX',
                    externalId: String(payment.id),
                    externalReference: typeof payment.external_reference === 'string'
                        ? payment.external_reference
                        : transaction.externalReference,
                    status: this.mapMercadoPagoStatus(payment.status),
                    paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
                    expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
                    lastError: payment.status === 'approved'
                        ? null
                        : this.translateMercadoPagoError(payment.status_detail),
                    details: {
                        ...currentDetails,
                        qrCode: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
                        qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
                        ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
                        statusDetail: payment.status_detail ?? null,
                        brand: payment.payment_method_id ?? null,
                        lastFourDigits: payment.card?.last_four_digits ?? null,
                    },
                };
            } catch (err) {
                if (this.isGatewayPaymentMissing(err)) {
                    return {
                        provider: 'MERCADO_PAGO',
                        paymentMethod: transaction.paymentMethod === PaymentMethod.CARD ? 'CARD' : 'PIX',
                        externalId: transaction.externalId,
                        externalReference: transaction.externalReference,
                        status: 'REJECTED',
                        lastError: 'O pagamento pendente anterior não foi encontrado no gateway. Gere um novo pagamento.',
                        details: {
                            ...currentDetails,
                            statusDetail: 'not_found',
                        },
                    };
                }

                throw err;
            }
        }

        if (transaction.provider === 'ABACATE_PAY') {
            try {
                const transparent = await this.fetchAbacateTransparentStatus(String(transaction.externalId));
                return {
                    provider: 'ABACATE_PAY',
                    paymentMethod: 'PIX',
                    externalId: String(transparent.id),
                    externalReference: transaction.externalReference,
                    status: this.mapAbacateTransparentStatus(transparent.status),
                    paidAt: this.mapAbacateTransparentStatus(transparent.status) === 'APPROVED'
                        ? new Date(transparent.updatedAt ?? Date.now())
                        : null,
                    expiresAt: transparent.expiresAt ? new Date(transparent.expiresAt) : null,
                    details: {
                        ...currentDetails,
                        statusDetail: transparent.status ?? null,
                    },
                };
            } catch (err) {
                if (this.isGatewayPaymentMissing(err)) {
                    return {
                        provider: 'ABACATE_PAY',
                        paymentMethod: 'PIX',
                        externalId: transaction.externalId,
                        externalReference: transaction.externalReference,
                        status: 'REJECTED',
                        lastError: 'O pagamento pendente anterior não foi encontrado no gateway. Gere um novo pagamento.',
                        details: {
                            ...currentDetails,
                            statusDetail: 'not_found',
                        },
                    };
                }

                throw err;
            }
        }

        return null;
    }

    private async applyWebhookResult(
        transactionId: string,
        orderId: string,
        result: GatewayPaymentResult,
        source: string,
    ) {
        const currentTransaction = await this.prisma.paymentTransaction.findUnique({
            where: { id: transactionId },
            select: { id: true, status: true, provider: true, paymentMethod: true, attemptKey: true },
        });

        if (!currentTransaction) {
            throw new NotFoundException('Transação não encontrada para processar webhook');
        }

        if (!this.isValidStatusTransition(currentTransaction.status, result.status)) {
            await this.raiseOperationalAlert('PAYMENT_INVALID_STATUS_TRANSITION', {
                orderId,
                transactionId,
                provider: currentTransaction.provider,
                paymentMethod: currentTransaction.paymentMethod,
                currentStatus: currentTransaction.status,
                attemptedStatus: result.status,
                source,
            });
            return false;
        }

        const webhookVerifiedAt = result.webhookVerifiedAt ?? (source.startsWith('webhook_') ? new Date() : undefined);
        const webhookSource = result.webhookSource ?? (source.startsWith('webhook_') ? source : undefined);

        await this.prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                status: result.status,
                externalId: result.externalId ?? undefined,
                externalReference: result.externalReference ?? undefined,
                attemptKey: result.attemptKey ?? currentTransaction.attemptKey ?? undefined,
                gatewayRequestId: result.gatewayRequestId ?? undefined,
                detailsJson: result.details ? JSON.stringify(result.details) : undefined,
                webhookPayloadJson: result.webhookPayload ? JSON.stringify(result.webhookPayload) : undefined,
                webhookVerifiedAt,
                webhookSource,
                lastError: result.lastError ?? undefined,
                paidAt: result.paidAt ?? undefined,
                expiresAt: result.expiresAt ?? undefined,
            },
        });

        if (result.status === 'APPROVED') {
            const paymentMethod = result.paymentMethod === 'CARD' ? PaymentMethod.CARD : PaymentMethod.PIX;
            await this.markOrderPaid(orderId, result.paidAt ?? new Date(), paymentMethod);
        }

        await this.auditPaymentStatus(null, orderId, transactionId, result.status, source);
        await this.raiseDuplicateApprovalAlertIfNeeded(orderId, transactionId, result.status, currentTransaction.provider);

        return true;
    }

    private async markOrderPaid(orderId: string, paidAt: Date, paymentMethod: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { ticket: true },
        });

        if (!order) {
            throw new NotFoundException('Pedido não encontrado');
        }

        if (
            order.status === OrderStatus.PAID
            || order.status === OrderStatus.READY
            || order.status === OrderStatus.PICKED_UP
        ) {
            return;
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: OrderStatus.PAID,
                paidAt,
                paymentMethod,
            },
        });

        await this.audit.log(null, 'ORDER_PAID', 'Order', orderId, {
            source: 'gateway',
            paymentMethod,
        });

        this.events.broadcastOrderStatus(
            orderId,
            order.userId ?? '',
            OrderStatus.PAID,
            order.ticket?.codeShort,
        );
    }

    private async getOrderAmount(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { totalCents: true },
        });

        if (!order) {
            throw new NotFoundException('Pedido não encontrado');
        }

        return order.totalCents;
    }

    private pickPixProvider(totalCents: number): GatewayProvider {
        const thresholdCents = this.getPixThresholdCents();
        const mercadoPagoAccessToken = this.getMercadoPagoAccessToken();
        const abacateApiKey = this.getAbacateApiKey();

        if (mercadoPagoAccessToken && totalCents <= thresholdCents) {
            return 'MERCADO_PAGO';
        }

        if (abacateApiKey) {
            return 'ABACATE_PAY';
        }

        if (mercadoPagoAccessToken) {
            return 'MERCADO_PAGO';
        }

        throw new InternalServerErrorException('Nenhum gateway PIX está configurado');
    }

    private async requestJsonWithMeta(url: string, init: RequestInit) {
        const response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(15000),
        });

        const rawText = await response.text();
        const payload = rawText ? JSON.parse(rawText) : null;

        if (!response.ok) {
            const message = this.extractGatewayError(payload) ?? `Erro ao processar pagamento (${response.status})`;
            throw new BadRequestException(message);
        }

        if (payload && typeof payload === 'object' && 'success' in payload && payload.success === false) {
            throw new BadRequestException(this.extractGatewayError(payload) ?? 'Gateway recusou a operação');
        }

        return {
            payload,
            meta: {
                requestId: this.extractGatewayRequestId(response.headers),
            },
        };
    }

    private async requestJson(url: string, init: RequestInit) {
        const response = await this.requestJsonWithMeta(url, init);
        return response.payload;
    }

    private async fetchMercadoPagoPayment(paymentId: string) {
        const accessToken = this.getMercadoPagoAccessToken();
        if (!accessToken) {
            throw new InternalServerErrorException('Mercado Pago não configurado');
        }

        return this.requestJson(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    private async fetchAbacateTransparentStatus(paymentId: string) {
        const apiKey = this.getAbacateApiKey();
        if (!apiKey) {
            throw new InternalServerErrorException('AbacatePay não configurado');
        }

        const url = new URL('https://api.abacatepay.com/v1/pixQrCode/check');
        url.searchParams.set('id', paymentId);

        const response = await this.requestJson(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        return response.data ?? response;
    }

    private extractGatewayError(payload: any) {
        if (!payload) return null;
        if (payload.cause?.length && typeof payload.cause[0]?.description === 'string') {
            return this.translateMercadoPagoMessage(payload.cause[0].description);
        }
        if (typeof payload.status_detail === 'string') {
            return this.translateMercadoPagoError(payload.status_detail);
        }
        if (typeof payload.message === 'string') return this.translateMercadoPagoMessage(payload.message);
        if (typeof payload.error === 'string') return this.translateMercadoPagoMessage(payload.error);
        return null;
    }

    private isGatewayPaymentMissing(error: unknown) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        return message.includes('payment not found')
            || message.includes('pagamento não encontrado')
            || message.includes('pagamento nao encontrado')
            || message.includes('not found');
    }

    private isMercadoPagoDuplicateCustomer(error: unknown) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        return message.includes('customer already exist')
            || message.includes('customer already exists')
            || message.includes('the customer already exist');
    }

    private translateMercadoPagoMessage(message: string) {
        const normalized = message.toLowerCase();

        if (normalized.includes('card not found')) {
            return 'Cartão salvo não encontrado no Mercado Pago. Salve o cartão novamente nesta mesma conta antes de reutilizá-lo.';
        }

        if (normalized.includes('invalid domain user email')) {
            return 'O Mercado Pago recusou o e-mail deste cliente para criar o customer. Para salvar cartões, use um e-mail com domínio comum, como Gmail ou Outlook, e evite endereços @testuser.com.';
        }

        if (normalized.includes('customer already exist') || normalized.includes('the customer already exist')) {
            return 'O cliente já existe no Mercado Pago. O sistema vai reutilizar esse cadastro automaticamente.';
        }

        return message;
    }

    private translateMercadoPagoError(detail?: string | null) {
        const errors: Record<string, string> = {
            'cc_rejected_bad_filled_card_number': 'Número do cartão inválido.',
            'cc_rejected_bad_filled_date': 'Validade do cartão inválida.',
            'cc_rejected_bad_filled_security_code': 'CVV inválido.',
            'cc_rejected_call_for_authorize': 'Cartão recusado. Entre em contato com o banco emissor.',
            'cc_rejected_card_disabled': 'Cartão desabilitado.',
            'cc_rejected_duplicated_payment': 'Pagamento duplicado detectado.',
            'cc_rejected_high_risk': 'Pagamento recusado por análise de risco.',
            'cc_rejected_insufficient_amount': 'Saldo insuficiente.',
            'cc_rejected_invalid_installments': 'Parcelamento inválido para este cartão.',
            'cc_rejected_max_attempts': 'Muitas tentativas com este cartão.',
            'cc_rejected_other_reason': 'Pagamento recusado pela operadora.',
        };

        return detail ? (errors[detail] ?? detail) : 'Pagamento recusado.';
    }

    private extractGatewayRequestId(headers: Headers) {
        return headers.get('x-request-id')
            ?? headers.get('request-id')
            ?? headers.get('x-requestid')
            ?? null;
    }

    private async logPaymentAttempt(
        actorUserId: string | null,
        orderId: string,
        transactionId: string,
        result: GatewayPaymentResult,
        source: string,
    ) {
        await this.audit.log(actorUserId, 'PAYMENT_ATTEMPT_CREATED', 'PaymentTransaction', transactionId, {
            orderId,
            provider: result.provider,
            paymentMethod: result.paymentMethod,
            status: result.status,
            source,
        });
        await this.raiseAbnormalRetryAlertIfNeeded(orderId, transactionId, result.provider, result.paymentMethod);
    }

    private async auditPaymentStatus(
        actorUserId: string | null,
        orderId: string,
        transactionId: string,
        status: InternalPaymentStatus,
        source: string,
    ) {
        const actionByStatus: Record<InternalPaymentStatus, string> = {
            PENDING: 'PAYMENT_PENDING',
            APPROVED: 'PAYMENT_APPROVED',
            REJECTED: 'PAYMENT_REJECTED',
            REFUNDED: 'PAYMENT_REFUNDED',
            CHARGEBACK: 'PAYMENT_CHARGEBACK',
        };

        await this.audit.log(actorUserId, actionByStatus[status], 'PaymentTransaction', transactionId, {
            orderId,
            status,
            source,
        });
    }

    private isValidStatusTransition(currentStatus: string, nextStatus: InternalPaymentStatus) {
        if (currentStatus === nextStatus) {
            return true;
        }

        switch (currentStatus) {
            case 'PENDING':
                return true;
            case 'APPROVED':
                return nextStatus === 'REFUNDED' || nextStatus === 'CHARGEBACK';
            case 'REJECTED':
                return false;
            case 'REFUNDED':
                return false;
            case 'CHARGEBACK':
                return false;
            default:
                return nextStatus !== 'PENDING';
        }
    }

    private mapMercadoPagoStatus(status?: string): InternalPaymentStatus {
        switch (status) {
            case 'approved':
                return 'APPROVED';
            case 'refunded':
                return 'REFUNDED';
            case 'charged_back':
                return 'CHARGEBACK';
            case 'rejected':
            case 'cancelled':
                return 'REJECTED';
            default:
                return 'PENDING';
        }
    }

    private mapAbacateTransparentStatus(status?: string): InternalPaymentStatus {
        switch ((status ?? '').toUpperCase()) {
            case 'PAID':
                return 'APPROVED';
            case 'REFUNDED':
                return 'REFUNDED';
            case 'CANCELLED':
            case 'FAILED':
                return 'REJECTED';
            default:
                return 'PENDING';
        }
    }

    private mapAbacateStatus(event?: string, transparentStatus?: string): InternalPaymentStatus {
        if (event === 'transparent.completed') return 'APPROVED';
        if (event === 'transparent.refunded') return 'REFUNDED';
        if (event === 'transparent.disputed') return 'CHARGEBACK';
        return this.mapAbacateTransparentStatus(transparentStatus);
    }

    private splitName(fullName: string) {
        const [firstName, ...rest] = fullName.trim().split(/\s+/);
        return {
            firstName,
            lastName: rest.join(' ') || undefined,
        };
    }

    private normalizeDocument(value: string) {
        return value.replace(/\D/g, '');
    }

    private normalizePhone(value: string) {
        return value.replace(/[^\d+]/g, '');
    }

    private normalizeQrCodeBase64(value: unknown) {
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        if (!normalized) return null;
        if (normalized.startsWith('data:image')) {
            return normalized;
        }
        return `data:image/png;base64,${normalized}`;
    }

    private buildExternalReference(orderId: string, suffix: string) {
        return `cantina:${orderId}:${suffix}:${Date.now()}`;
    }

    private getPaymentReconciliationBatchSize() {
        const rawValue = Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE ?? 20);
        if (!Number.isFinite(rawValue) || rawValue <= 0) {
            return 20;
        }

        return Math.min(Math.trunc(rawValue), 100);
    }

    private buildMercadoPagoIdempotencyKey(reference: string) {
        return crypto.createHash('sha256').update(reference).digest('hex');
    }

    private buildMercadoPagoWebhookEventKey(
        body: Record<string, any>,
        paymentId: string,
        topic?: string,
    ) {
        if (typeof body.id === 'string' || typeof body.id === 'number') {
            return String(body.id);
        }

        return `payment:${paymentId}:${topic ?? 'payment'}:${body.action ?? 'unknown'}:${body.date_created ?? ''}`;
    }

    private buildAbacateWebhookEventKey(
        body: Record<string, any>,
        paymentId: string,
        status?: string,
    ) {
        if (typeof body.id === 'string' || typeof body.id === 'number') {
            return String(body.id);
        }

        const updatedAt = body.data?.transparent?.updatedAt ?? body.updatedAt ?? body.data?.updatedAt ?? '';
        const event = typeof body.event === 'string' ? body.event : 'legacy';
        return `${event}:${paymentId}:${status ?? 'unknown'}:${updatedAt}`;
    }

    private buildWebhookUrl(provider: 'mercadopago' | 'abacatepay') {
        const appPublicUrl = process.env.APP_PUBLIC_URL?.trim();
        if (!appPublicUrl) {
            return undefined;
        }

        const url = new URL(`/api/v1/webhooks/${provider}`, appPublicUrl.endsWith('/') ? appPublicUrl : `${appPublicUrl}/`);
        return url.toString();
    }

    private verifyMercadoPagoSignature(
        signatureHeader: string | undefined,
        requestId: string | undefined,
        dataId: string,
    ) {
        const secret = this.getMercadoPagoWebhookSecret();
        if (!secret) {
            if (this.isProductionEnv()) {
                void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                    provider: 'MERCADO_PAGO',
                    reason: 'missing_webhook_secret',
                });
                throw new UnauthorizedException('Webhook secret do Mercado Pago não configurado');
            }
            return;
        }

        if (!signatureHeader || !requestId || !dataId) {
            void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                provider: 'MERCADO_PAGO',
                reason: 'missing_signature_headers',
                requestId: requestId ?? null,
                dataId: dataId || null,
            });
            throw new UnauthorizedException('Assinatura do webhook do Mercado Pago ausente');
        }

        const parts = this.parseSignatureHeader(signatureHeader);
        const ts = parts.ts;
        const v1 = parts.v1;
        if (!ts || !v1) {
            void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                provider: 'MERCADO_PAGO',
                reason: 'malformed_signature',
                requestId,
                dataId,
            });
            throw new UnauthorizedException('Assinatura do webhook do Mercado Pago inválida');
        }

        const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
        const expected = crypto
            .createHmac('sha256', secret)
            .update(manifest)
            .digest('hex');

        const received = Buffer.from(v1);
        const expectedBuffer = Buffer.from(expected);
        if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) {
            void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                provider: 'MERCADO_PAGO',
                reason: 'signature_mismatch',
                requestId,
                dataId,
            });
            throw new UnauthorizedException('Assinatura do webhook do Mercado Pago inválida');
        }
    }

    private assertWebhookSecret(receivedSecret?: string, options?: { required?: boolean }) {
        const expectedSecret = process.env.WEBHOOK_SHARED_SECRET?.trim();
        const required = options?.required ?? true;

        if (!receivedSecret) {
            if (required && expectedSecret) {
                throw new UnauthorizedException('Webhook secret ausente');
            }
            return;
        }

        if (!expectedSecret) {
            if (required) {
                throw new UnauthorizedException('Webhook secret ausente');
            }
            return;
        }

        if (!expectedSecret || !receivedSecret) {
            throw new UnauthorizedException('Webhook secret ausente');
        }

        const received = Buffer.from(receivedSecret);
        const expected = Buffer.from(expectedSecret);
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                provider: 'ABACATE_PAY',
                reason: 'shared_secret_mismatch',
            });
            throw new UnauthorizedException('Webhook secret inválido');
        }
    }

    private verifyAbacateSignature(signature: string | undefined, rawBody: string) {
        const publicHmacKey = process.env.ABACATEPAY_PUBLIC_HMAC_KEY?.trim();
        const mustValidate = this.isProductionEnv() || Boolean(publicHmacKey);

        if (!publicHmacKey || !signature) {
            if (mustValidate) {
                void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                    provider: 'ABACATE_PAY',
                    reason: 'missing_hmac_signature',
                });
                throw new UnauthorizedException('Assinatura HMAC da AbacatePay ausente');
            }
            return;
        }

        const expectedSignature = crypto
            .createHmac('sha256', publicHmacKey)
            .update(Buffer.from(rawBody, 'utf8'))
            .digest('base64');

        const received = Buffer.from(signature);
        const expected = Buffer.from(expectedSignature);
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            void this.raiseOperationalAlert('PAYMENT_INVALID_WEBHOOK', {
                provider: 'ABACATE_PAY',
                reason: 'hmac_signature_mismatch',
            });
            throw new UnauthorizedException('Assinatura HMAC da AbacatePay inválida');
        }
    }

    private parseSignatureHeader(signatureHeader: string) {
        return signatureHeader
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .reduce<Record<string, string>>((acc, part) => {
                const [rawKey, rawValue] = part.split('=');
                const key = rawKey?.trim();
                const value = rawValue?.trim();
                if (key && value) {
                    acc[key] = value;
                }
                return acc;
            }, {});
    }

    private async registerWebhookEvent(
        provider: GatewayProvider,
        eventKey: string,
        eventType: string,
        paymentTransactionId: string,
        orderId: string,
        payload: Record<string, any>,
    ) {
        try {
            await this.prisma.paymentWebhookEvent.create({
                data: {
                    provider,
                    eventKey,
                    eventType,
                    paymentTransactionId,
                    orderId,
                    payloadJson: JSON.stringify(payload),
                },
            });
            return true;
        } catch (error) {
            if (this.isUniqueConstraintError(error)) {
                return false;
            }

            throw error;
        }
    }

    private getMercadoPagoWebhookSecret() {
        const environmentSecret = this.isProductionEnv()
            ? process.env.MP_WEBHOOK_SECRET_PRODUCTION?.trim()
            : process.env.MP_WEBHOOK_SECRET_SANDBOX?.trim();

        return environmentSecret || process.env.MP_WEBHOOK_SECRET?.trim() || null;
    }

    private isUniqueConstraintError(error: unknown) {
        return error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code === 'P2002'
            : typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
    }

    private async raiseDuplicateApprovalAlertIfNeeded(
        orderId: string,
        transactionId: string,
        status: InternalPaymentStatus,
        provider: string,
    ) {
        if (status !== 'APPROVED') {
            return;
        }

        const approvedCount = await this.prisma.paymentTransaction.count({
            where: {
                orderId,
                status: 'APPROVED',
            },
        });

        if (approvedCount > 1) {
            await this.raiseOperationalAlert('PAYMENT_DUPLICATE_APPROVAL', {
                orderId,
                transactionId,
                provider,
                approvedCount,
            });
        }
    }

    private async raiseAbnormalRetryAlertIfNeeded(
        orderId: string,
        transactionId: string,
        provider: string,
        paymentMethod: string,
    ) {
        const since = new Date(Date.now() - 15 * 60 * 1000);
        const recentAttempts = await this.prisma.paymentTransaction.count({
            where: {
                orderId,
                createdAt: {
                    gte: since,
                },
            },
        });

        if (recentAttempts >= 5) {
            await this.raiseOperationalAlert('PAYMENT_ABNORMAL_RETRY_PATTERN', {
                orderId,
                transactionId,
                provider,
                paymentMethod,
                recentAttempts,
                windowMinutes: 15,
            });
        }
    }

    private async raiseOperationalAlert(code: string, payload: Record<string, unknown>) {
        console.warn(`[Payments][Alert] ${code}`, payload);
        await this.audit.log(null, code, 'PaymentSecurity', null, payload);
    }

    private async withOrderPaymentLock<T>(
        orderId: string,
        paymentMethod: PaymentInitiationMethod,
        callback: () => Promise<T>,
    ): Promise<T> {
        const lockId = crypto.randomUUID();
        const now = new Date();
        const lockExpiresAt = new Date(now.getTime() + PAYMENT_LOCK_TTL_MS);
        const acquired = await this.prisma.order.updateMany({
            where: {
                id: orderId,
                OR: [
                    { paymentLockExpiresAt: null },
                    { paymentLockExpiresAt: { lte: now } },
                ],
            },
            data: {
                paymentLockId: lockId,
                paymentLockMethod: paymentMethod,
                paymentLockExpiresAt: lockExpiresAt,
            },
        });

        if (acquired.count !== 1) {
            const lockedOrder = await this.prisma.order.findUnique({
                where: { id: orderId },
                select: { paymentLockMethod: true, paymentLockExpiresAt: true },
            });
            const lockedUntil = lockedOrder?.paymentLockExpiresAt instanceof Date
                ? lockedOrder.paymentLockExpiresAt.toISOString()
                : null;
            throw new ConflictException(
                lockedUntil
                    ? `Ja existe um pagamento ${lockedOrder?.paymentLockMethod === 'CARD' ? 'com cartao' : 'em andamento'} sendo iniciado para este pedido ate ${lockedUntil}.`
                    : 'Ja existe um pagamento sendo iniciado para este pedido.',
            );
        }

        try {
            return await callback();
        } finally {
            await this.releaseOrderPaymentLock(orderId, lockId);
        }
    }

    private async releaseOrderPaymentLock(orderId: string, lockId: string) {
        await this.prisma.order.updateMany({
            where: {
                id: orderId,
                paymentLockId: lockId,
            },
            data: {
                paymentLockId: null,
                paymentLockMethod: null,
                paymentLockExpiresAt: null,
            },
        });
    }

    private getPixThresholdCents() {
        const threshold = Number.parseFloat(process.env.PIX_THRESHOLD ?? '80');
        return Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold * 100) : 8000;
    }

    private isProductionEnv() {
        return process.env.NODE_ENV === 'production';
    }

    private getMercadoPagoAccessToken() {
        return this.isProductionEnv()
            ? process.env.MP_ACCESS_TOKEN_PRODUCTION?.trim()
            : process.env.MP_ACCESS_TOKEN_SANDBOX?.trim();
    }

    private getMercadoPagoPublicKey() {
        return this.isProductionEnv()
            ? process.env.MP_PUBLIC_KEY_PRODUCTION?.trim()
            : process.env.MP_PUBLIC_KEY_SANDBOX?.trim();
    }

    private getAbacateApiKey() {
        return this.isProductionEnv()
            ? process.env.ABACATEPAY_API_KEY_PRODUCTION?.trim()
            : process.env.ABACATEPAY_API_KEY_SANDBOX?.trim();
    }

    private parseJson<T>(value: string | null) {
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            return null;
        }
    }
}
