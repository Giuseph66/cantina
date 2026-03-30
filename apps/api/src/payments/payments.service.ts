import {
    BadRequestException,
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

type GatewayProvider = 'MERCADO_PAGO' | 'ABACATE_PAY';
type InternalPaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REFUNDED' | 'CHARGEBACK';

type GatewayPaymentResult = {
    provider: GatewayProvider;
    paymentMethod: 'PIX' | 'CARD';
    externalId?: string | null;
    externalReference?: string | null;
    status: InternalPaymentStatus;
    details?: Record<string, unknown> | null;
    paidAt?: Date | null;
    expiresAt?: Date | null;
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

    async createPixPayment(orderId: string, userId: string, role: string, dto: CreatePixPaymentDto) {
        const order = await this.getOrderForPayment(orderId, userId, role);
        const payer = this.resolvePayer(order.user, dto);

        const reusableTransaction = order.paymentTransactions.find((transaction: any) => {
            if (transaction.paymentMethod !== PaymentMethod.PIX) return false;
            if (transaction.status !== 'PENDING') return false;
            if (!transaction.detailsJson) return false;
            if (transaction.expiresAt && transaction.expiresAt <= new Date()) return false;
            return true;
        });

        if (reusableTransaction) {
            return this.serializePaymentTransaction(reusableTransaction);
        }

        const provider = this.pickPixProvider(order.totalCents);
        const externalReference = this.buildExternalReference(order.id, 'pix');
        const result = provider === 'MERCADO_PAGO'
            ? await this.createMercadoPagoPix(order, payer, externalReference)
            : await this.createAbacatePix(order, payer, externalReference);

        const transaction = await this.persistPaymentResult(order.id, payer, result);

        await this.prisma.order.update({
            where: { id: order.id },
            data: { paymentMethod: PaymentMethod.PIX },
        });

        if (result.status === 'APPROVED') {
            await this.markOrderPaid(order.id, result.paidAt ?? new Date(), PaymentMethod.PIX);
        }

        return this.serializePaymentTransaction(transaction);
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
                await this.applyWebhookResult(latestTransaction.id, order.id, result);
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

    async createCardPayment(orderId: string, userId: string, role: string, dto: CreateCardPaymentDto) {
        const order = await this.getOrderForPayment(orderId, userId, role);
        const payer = this.resolvePayer(order.user, dto);

        let customerId = order.user?.mercadoPagoCustomerId ?? null;
        if (!customerId && (dto.saveCard || dto.cardId)) {
            customerId = await this.getOrCreateMercadoPagoCustomer(order.user!);
        }

        const result = await this.createMercadoPagoCard(order, payer, dto, customerId);
        const transaction = await this.persistPaymentResult(order.id, payer, result);

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
        body: Record<string, any>,
        query: Record<string, string | undefined>,
    ) {
        this.assertWebhookSecret(webhookSecret ?? query.webhookSecret);

        const topic = body.type ?? query.type ?? query.topic;
        const paymentId = body.data?.id ?? query['data.id'] ?? query.id;

        if (topic !== 'payment' || !paymentId) {
            return { received: true, ignored: true };
        }

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
            throw new UnauthorizedException('Valor do pagamento divergente');
        }

        const result: GatewayPaymentResult = {
            provider: 'MERCADO_PAGO',
            paymentMethod: transaction.paymentMethod === PaymentMethod.CARD ? 'CARD' : 'PIX',
            externalId: String(payment.id),
            externalReference,
            status: this.mapMercadoPagoStatus(payment.status),
            paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
            expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
            lastError: payment.status_detail ?? null,
            details: {
                statusDetail: payment.status_detail ?? null,
                qrCode: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
                qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
                ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
            },
            webhookPayload: body,
        };

        await this.applyWebhookResult(transaction.id, transaction.orderId, result);
        return { received: true, success: true };
    }

    async handleAbacatePayWebhook(
        webhookSecret: string | undefined,
        signature: string | undefined,
        rawBody: string,
        body: Record<string, any>,
    ) {
        this.assertWebhookSecret(webhookSecret);
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

            const currentDetails = this.parseJson<Record<string, unknown>>(transaction.detailsJson) ?? {};
            const result: GatewayPaymentResult = {
                provider: 'ABACATE_PAY',
                paymentMethod: 'PIX',
                externalId: String(legacyPixId),
                externalReference: transaction.externalReference,
                status: this.mapAbacateTransparentStatus(legacyStatus),
                paidAt: this.mapAbacateTransparentStatus(legacyStatus) === 'APPROVED'
                    ? new Date(body.updatedAt ?? body.data?.updatedAt ?? Date.now())
                    : null,
                expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
                details: {
                    ...currentDetails,
                    statusDetail: legacyStatus,
                },
                webhookPayload: body,
            };

            await this.applyWebhookResult(transaction.id, transaction.orderId, result);
            return { received: true, success: true };
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
            throw new UnauthorizedException('Valor do pagamento divergente');
        }

        const status = this.mapAbacateStatus(event, transparent.status);
        const result: GatewayPaymentResult = {
            provider: 'ABACATE_PAY',
            paymentMethod: 'PIX',
            externalId: String(transparent.id),
            externalReference: transparent.externalId ? String(transparent.externalId) : transaction.externalReference,
            status,
            paidAt: status === 'APPROVED' ? new Date(transparent.updatedAt ?? Date.now()) : null,
            expiresAt: transparent.expiresAt ? new Date(transparent.expiresAt) : null,
            details: {
                receiptUrl: transparent.receiptUrl ?? null,
                methods: transparent.methods ?? [],
                status: transparent.status ?? null,
            },
            webhookPayload: body,
        };

        await this.applyWebhookResult(transaction.id, transaction.orderId, result);
        return { received: true, success: true };
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
                    isActive: true,
                },
            },
            paymentTransactions: {
                orderBy: { createdAt: 'desc' },
                take: 10,
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
        dto: { payerName?: string; payerEmail?: string; payerDocument: string; payerPhone?: string },
    ) {
        if (!user) {
            throw new ForbiddenException('Pedido sem cliente vinculado não pode ser pago online.');
        }

        const payerName = (user.name ?? '').trim();
        const payerEmail = (user.email ?? '').trim();
        const payerDocument = this.normalizeDocument(user.cpf ?? dto.payerDocument);
        const payerPhone = this.normalizePhone(user.phone ?? dto.payerPhone ?? '');
        const requestedDocument = this.normalizeDocument(dto.payerDocument);

        if (!payerName) {
            throw new BadRequestException('Informe o nome do pagador');
        }

        if (!payerEmail) {
            throw new BadRequestException('Informe o e-mail do pagador');
        }

        if (![11, 14].includes(payerDocument.length)) {
            throw new BadRequestException('Informe um CPF ou CNPJ válido');
        }

        if (requestedDocument && requestedDocument !== payerDocument) {
            throw new ForbiddenException('O documento informado difere do cadastro autenticado.');
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

        const response = await this.requestJson('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': crypto.randomUUID(),
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

        const body: any = {
            transaction_amount: order.totalCents / 100,
            description: `Pedido ${order.id.slice(0, 8)}`,
            installments: dto.installments ?? 1,
            issuer_id: dto.issuerId || undefined,
            payment_method_id: dto.paymentMethodId,
            external_reference: this.buildExternalReference(order.id, 'card'),
            notification_url: this.buildWebhookUrl('mercadopago'),
            binary_mode: true,
            payer: {
                id: customerId || undefined,
                email: payer.payerEmail,
                identification: {
                    type: payer.payerDocument.length === 14 ? 'CNPJ' : 'CPF',
                    number: payer.payerDocument,
                },
            },
        };

        if (dto.cardId) {
            body.token = dto.cardId;
        } else if (dto.cardToken) {
            body.token = dto.cardToken;
        } else {
            throw new BadRequestException('Token ou ID do cartão é obrigatório');
        }

        const response = await this.requestJson('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': crypto.randomUUID(),
            },
            body: JSON.stringify(body),
        });

        return {
            provider: 'MERCADO_PAGO',
            paymentMethod: 'CARD',
            externalId: response.id ? String(response.id) : null,
            externalReference: response.external_reference ?? null,
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

        const customer = await this.requestJson('https://api.mercadopago.com/v1/customers', {
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

        const response = await this.requestJson('https://api.abacatepay.com/v1/pixQrCode/create', {
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
                amountCents: await this.getOrderAmount(orderId),
                payerName: payer.payerName,
                payerEmail: payer.payerEmail,
                payerDocument: payer.payerDocument,
                detailsJson: result.details ? JSON.stringify(result.details) : undefined,
                webhookPayloadJson: result.webhookPayload ? JSON.stringify(result.webhookPayload) : undefined,
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

        if (transaction.provider === 'MERCADO_PAGO') {
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
                    qrCode: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
                    qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
                    ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
                    statusDetail: payment.status_detail ?? null,
                    brand: payment.payment_method_id ?? null,
                    lastFourDigits: payment.card?.last_four_digits ?? null,
                },
            };
        }

        if (transaction.provider === 'ABACATE_PAY') {
            const currentDetails = this.parseJson<Record<string, unknown>>(transaction.detailsJson) ?? {};
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
        }

        return null;
    }

    private async applyWebhookResult(
        transactionId: string,
        orderId: string,
        result: GatewayPaymentResult,
    ) {
        await this.prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                status: result.status,
                externalId: result.externalId ?? undefined,
                externalReference: result.externalReference ?? undefined,
                detailsJson: result.details ? JSON.stringify(result.details) : undefined,
                webhookPayloadJson: result.webhookPayload ? JSON.stringify(result.webhookPayload) : undefined,
                lastError: result.lastError ?? undefined,
                paidAt: result.paidAt ?? undefined,
                expiresAt: result.expiresAt ?? undefined,
            },
        });

        if (result.status === 'APPROVED') {
            const paymentMethod = result.paymentMethod === 'CARD' ? PaymentMethod.CARD : PaymentMethod.PIX;
            await this.markOrderPaid(orderId, result.paidAt ?? new Date(), paymentMethod);
        }
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

    private async requestJson(url: string, init: RequestInit) {
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

        return payload;
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
        if (typeof payload.message === 'string') return payload.message;
        if (typeof payload.error === 'string') return payload.error;
        if (payload.cause?.length && typeof payload.cause[0]?.description === 'string') {
            return payload.cause[0].description;
        }
        if (typeof payload.status_detail === 'string') {
            return this.translateMercadoPagoError(payload.status_detail);
        }
        return null;
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

    private buildWebhookUrl(provider: 'mercadopago' | 'abacatepay') {
        if (!this.hasWebhookConfig()) {
            return undefined;
        }

        const appPublicUrl = process.env.APP_PUBLIC_URL?.trim();
        if (!appPublicUrl) {
            return undefined;
        }

        const sharedSecret = process.env.WEBHOOK_SHARED_SECRET?.trim();
        const url = new URL(`/api/v1/webhooks/${provider}`, appPublicUrl.endsWith('/') ? appPublicUrl : `${appPublicUrl}/`);
        if (sharedSecret) {
            url.searchParams.set('webhookSecret', sharedSecret);
        }
        return url.toString();
    }

    private assertWebhookSecret(receivedSecret?: string) {
        const expectedSecret = process.env.WEBHOOK_SHARED_SECRET?.trim();
        if (!expectedSecret || !receivedSecret) {
            throw new UnauthorizedException('Webhook secret ausente');
        }

        const received = Buffer.from(receivedSecret);
        const expected = Buffer.from(expectedSecret);
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            throw new UnauthorizedException('Webhook secret inválido');
        }
    }

    private verifyAbacateSignature(signature: string | undefined, rawBody: string) {
        const publicHmacKey = process.env.ABACATEPAY_PUBLIC_HMAC_KEY?.trim();
        if (!publicHmacKey || !signature) {
            return;
        }

        const expectedSignature = crypto
            .createHmac('sha256', publicHmacKey)
            .update(Buffer.from(rawBody, 'utf8'))
            .digest('base64');

        const received = Buffer.from(signature);
        const expected = Buffer.from(expectedSignature);
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
            throw new UnauthorizedException('Assinatura HMAC da AbacatePay inválida');
        }
    }

    private hasWebhookConfig() {
        return Boolean(process.env.APP_PUBLIC_URL?.trim() && process.env.WEBHOOK_SHARED_SECRET?.trim());
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
