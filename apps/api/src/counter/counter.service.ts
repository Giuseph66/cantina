import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CounterSaleDto } from './dto/counter-sale.dto';
import { OrderStatus, StockMode, CashMovementType, PaymentMethod, Role } from '../common/enums';

@Injectable()
export class CounterService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
    ) { }

    async createSale(cashierId: string, dto: CounterSaleDto) {
        const productIds = dto.items.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds }, isActive: true },
        });

        const customer = dto.customerUserId
            ? await this.prisma.user.findFirst({
                where: {
                    id: dto.customerUserId,
                    role: Role.CLIENT,
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            })
            : null;

        if (products.length !== dto.items.length) {
            throw new BadRequestException('Um ou mais produtos não encontrados ou inativos');
        }

        if (dto.customerUserId && !customer) {
            throw new BadRequestException('Cliente selecionado não encontrado ou inativo.');
        }

        if (
            dto.paymentMethod === PaymentMethod.INTERNAL_CREDIT &&
            !customer &&
            !dto.customerName?.trim()
        ) {
            throw new BadRequestException('Informe um cliente cadastrado ou um nome para a notinha avulsa.');
        }

        const openSession = await this.prisma.cashSession.findFirst({
            where: {
                openedById: cashierId,
                closedAt: null,
            },
            orderBy: { openedAt: 'desc' },
        });

        if (!openSession) {
            throw new BadRequestException('Abra o seu caixa antes de registrar uma venda no balcão.');
        }

        const order = await this.prisma.$transaction(async (tx) => {
            // Check + decrement stock
            for (const item of dto.items) {
                const product = products.find((p) => p.id === item.productId)!;
                if (product.stockMode === StockMode.CONTROLLED) {
                    const current = await tx.product.findUnique({ where: { id: item.productId } });
                    if (!current || current.stockQty < item.qty) {
                        throw new BadRequestException(`Estoque insuficiente para "${product.name}"`);
                    }
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stockQty: { decrement: item.qty } },
                    });
                }
            }

            const totalCents = dto.items.reduce((sum, item) => {
                const product = products.find((p) => p.id === item.productId)!;
                return sum + product.priceCents * item.qty;
            }, 0);

            const newOrder = await tx.order.create({
                data: {
                    userId: customer?.id ?? null,
                    channel: 'COUNTER',
                    status: OrderStatus.PICKED_UP,
                    totalCents,
                    paymentMethod: dto.paymentMethod,
                    paidAt: dto.paymentMethod === PaymentMethod.INTERNAL_CREDIT ? null : new Date(),
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
                include: {
                    items: { include: { product: true } },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            });

            if (dto.paymentMethod === PaymentMethod.INTERNAL_CREDIT) {
                await tx.creditNote.create({
                    data: {
                        orderId: newOrder.id,
                        customerUserId: customer?.id ?? null,
                        customerName: customer?.name ?? dto.customerName?.trim() ?? null,
                        customerPhone: dto.customerPhone?.trim() || null,
                        totalCents,
                        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                        notes: dto.notes?.trim() || null,
                        createdById: cashierId,
                    },
                });
            } else {
                await tx.cashMovement.create({
                    data: {
                        cashSessionId: openSession.id,
                        type: CashMovementType.SALE,
                        amountCents: totalCents,
                        method: dto.paymentMethod,
                        referenceOrderId: newOrder.id,
                    },
                });
            }

            return tx.order.findUniqueOrThrow({
                where: { id: newOrder.id },
                include: {
                    items: { include: { product: true } },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    creditNote: true,
                },
            });
        });

        await this.audit.log(
            cashierId,
            dto.paymentMethod === PaymentMethod.INTERNAL_CREDIT ? 'COUNTER_CREDIT_NOTE_CREATED' : 'COUNTER_SALE',
            'Order',
            order.id,
            {
                totalCents: order.totalCents,
                paymentMethod: dto.paymentMethod,
                customerUserId: customer?.id ?? null,
                customerName: customer?.name ?? dto.customerName?.trim() ?? null,
            },
        );

        return order;
    }
}
