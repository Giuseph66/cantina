import {
    Injectable,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../common/services/audit.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, StockMode } from '../common/enums';

@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ticketsService: TicketsService,
        private readonly audit: AuditService,
    ) { }

    async createOrder(userId: string | null, dto: CreateOrderDto) {
        // Validate all products exist and are active
        const productIds = dto.items.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds }, isActive: true },
        });

        if (products.length !== dto.items.length) {
            throw new BadRequestException('Um ou mais produtos não encontrados ou inativos');
        }

        // Check stock in advance
        for (const item of dto.items) {
            const product = products.find((p) => p.id === item.productId)!;
            if (
                product.stockMode === StockMode.CONTROLLED &&
                product.stockQty < item.qty
            ) {
                throw new BadRequestException(
                    `Estoque insuficiente para "${product.name}" (disponível: ${product.stockQty})`,
                );
            }
        }

        // Execute in a transaction
        const order = await this.prisma.$transaction(async (tx) => {
            // Lock and re-check stock
            for (const item of dto.items) {
                const product = products.find((p) => p.id === item.productId)!;
                if (product.stockMode === StockMode.CONTROLLED) {
                    const current = await tx.product.findUnique({ where: { id: item.productId } });
                    if (!current || current.stockQty < item.qty) {
                        throw new BadRequestException(
                            `Estoque insuficiente para "${product.name}"`,
                        );
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stockQty: { decrement: item.qty } },
                    });
                }
            }

            // Calculate total
            const totalCents = dto.items.reduce((sum, item) => {
                const product = products.find((p) => p.id === item.productId)!;
                return sum + product.priceCents * item.qty;
            }, 0);

            // Create order
            const newOrder = await tx.order.create({
                data: {
                    userId,
                    channel: 'ONLINE',
                    status: dto.paymentMethod === 'PIX' ? OrderStatus.CREATED : OrderStatus.CONFIRMED,
                    totalCents,
                    paymentMethod: dto.paymentMethod,
                    items: {
                        create: dto.items.map((item) => {
                            const product = products.find((p) => p.id === item.productId)!;
                            return {
                                productId: item.productId,
                                qty: item.qty,
                                unitPriceCents: product.priceCents,
                                subtotalCents: product.priceCents * item.qty,
                            };
                        }),
                    },
                },
                include: { items: { include: { product: true } } },
            });

            return newOrder;
        });

        // Generate ticket (outside transaction so ticket gets order.id)
        const ticket = await this.ticketsService.generateTicket(order.id);

        await this.audit.log(userId, 'ORDER_CREATED', 'Order', order.id, {
            totalCents: order.totalCents,
            itemCount: dto.items.length,
            guestCheckout: !userId,
        });

        // Generate fake PIX Code just for frontend rendering if method is PIX
        const pixCode = dto.paymentMethod === 'PIX'
            ? `0002012636br.gov.bcb.pix0114+55119999999995204000053039865405${(order.totalCents / 100).toFixed(2)}5802BR5915CANTINA NEURELIX6009SAO PAULO62070503***6304${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            : null;

        return { ...order, ticket, pixCode };
    }

    async getPublicOrderById(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: { include: { product: true } },
                ticket: {
                    select: {
                        id: true,
                        codeShort: true,
                        expiresAt: true,
                        consumedAt: true,
                        createdAt: true,
                        // tokenHash is intentionally excluded — it is a server-side secret
                        // used to validate QR scans and must never be sent to the client
                    },
                },
            },
        });

        if (!order) throw new NotFoundException('Pedido não encontrado');

        return order;
    }

    async reportPublicOrderPaid(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) throw new NotFoundException('Pedido não encontrado');

        if (order.status !== OrderStatus.CREATED) {
            throw new BadRequestException('Este pedido não está aguardando pagamento ou já foi confirmado.');
        }

        // We mark it as CONFIRMED. The cashier still has to MARK PAID to set paidAt before they can consume.
        const updatedOrder = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CONFIRMED },
            include: {
                items: { include: { product: true } },
                ticket: true,
            },
        });

        await this.audit.log(null, 'ORDER_PAYMENT_REPORTED', 'Order', order.id, {
            previousStatus: order.status,
            newStatus: updatedOrder.status
        });

        return updatedOrder;
    }

    async getMyOrders(userId: string) {
        return this.prisma.order.findMany({
            where: { userId, channel: 'ONLINE' },
            include: {
                items: { include: { product: true } },
                ticket: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getMyOrdersSummary(userId: string) {
        const orders = await this.prisma.order.findMany({
            where: { userId },
            select: { totalCents: true, status: true, paymentMethod: true, paidAt: true },
        });

        const openCreditNotes = await this.prisma.creditNote.aggregate({
            _sum: { totalCents: true },
            where: {
                customerUserId: userId,
                status: 'OPEN',
            },
        });

        const totalSpentCents = orders
            .filter(o => !!o.paidAt)
            .reduce((sum, o) => sum + o.totalCents, 0);

        const pendingPickupCount = orders
            .filter(o => ['PAID', 'CONFIRMED'].includes(o.status)).length;

        // "Notinha" = ON_PICKUP orders still CONFIRMED (not yet paid at counter)
        const legacyPickupDebtCents = orders
            .filter(o => o.paymentMethod === 'ON_PICKUP' && o.status === 'CONFIRMED')
            .reduce((sum, o) => sum + o.totalCents, 0);

        return {
            totalOrders: orders.length,
            totalSpentCents,
            pendingPickupCount,
            creditDebtCents: (openCreditNotes._sum.totalCents ?? 0) + legacyPickupDebtCents,
        };
    }

    async getOrderById(orderId: string, userId: string, role: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: { include: { product: true } },
                ticket: true,
                user: { select: { id: true, name: true, email: true } },
            },
        });

        if (!order) throw new NotFoundException('Pedido não encontrado');

        // CLIENT can only see own orders
        if (role === 'CLIENT' && order.userId !== userId) {
            throw new ForbiddenException('Acesso negado');
        }

        return order;
    }

    async getTicketByOrderId(orderId: string, userId: string, role: string) {
        const order = await this.getOrderById(orderId, userId, role);
        if (!order.ticket) throw new NotFoundException('Ticket não encontrado para este pedido');
        return order.ticket;
    }

    async getReadyOrders() {
        return this.prisma.order.findMany({
            where: { status: OrderStatus.READY },
            include: { ticket: true },
            orderBy: { updatedAt: 'asc' },
        });
    }
}
