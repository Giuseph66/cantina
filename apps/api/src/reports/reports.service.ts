import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ReportFilters = {
    paymentMethod?: string;
    channel?: string;
};

type DateRange = {
    start: Date;
    end: Date;
    normalizedDate: string;
};

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    private buildSettledOrderWhere(range: DateRange, filters?: ReportFilters) {
        return {
            paidAt: { gte: range.start, lte: range.end },
            ...(filters?.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
            ...(filters?.channel ? { channel: filters.channel } : {}),
        };
    }

    async getDailyKpis(range: DateRange, filters?: ReportFilters) {
        const settledOrders = await this.prisma.order.findMany({
            where: this.buildSettledOrderWhere(range, filters),
        });

        const totalRevenueCents = settledOrders.reduce((acc, order) => acc + order.totalCents, 0);
        const orderCount = settledOrders.length;
        const ticketMedioCents = orderCount > 0 ? totalRevenueCents / orderCount : 0;

        const failedOrdersCount = await this.prisma.order.count({
            where: {
                createdAt: { gte: range.start, lte: range.end },
                status: { in: ['EXPIRED', 'CANCELLED'] },
            },
        });

        return {
            date: range.normalizedDate,
            revenueCents: totalRevenueCents,
            orderCount,
            ticketMedioCents: Math.round(ticketMedioCents),
            failedOrdersCount,
        };
    }

    async getDailySummary(range: DateRange, filters?: ReportFilters) {
        const settledOrders = await this.prisma.order.findMany({
            where: this.buildSettledOrderWhere(range, filters),
        });

        const totalSalesCents = settledOrders.reduce((acc, order) => acc + order.totalCents, 0);
        const onlineOrders = settledOrders.filter((order) => order.channel === 'ONLINE').length;
        const counterOrders = settledOrders.filter((order) => order.channel === 'COUNTER').length;

        const expiredOrders = await this.prisma.order.count({
            where: {
                createdAt: { gte: range.start, lte: range.end },
                status: 'EXPIRED',
            },
        });

        const sessions = await this.prisma.cashSession.findMany({
            where: {
                openedAt: { gte: range.start, lte: range.end },
            },
            include: {
                movements: true,
                openedBy: { select: { id: true, name: true } },
            },
            orderBy: {
                openedAt: 'asc',
            },
        });

        return {
            date: range.normalizedDate,
            totalSalesCents,
            onlineOrders,
            counterOrders,
            expiredOrders,
            salesByMethod: settledOrders.reduce<Record<string, number>>((acc, order) => {
                acc[order.paymentMethod] = (acc[order.paymentMethod] ?? 0) + order.totalCents;
                return acc;
            }, {}),
            sessions: sessions.map((session) => ({
                id: session.id,
                openedBy: session.openedBy,
                openedAt: session.openedAt,
                closedAt: session.closedAt,
                openingCashCents: session.openingCashCents,
                closingCashCents: session.closingCashCents,
                countedCashCents: session.countedCashCents,
                cashDifferenceCents: session.cashDifferenceCents,
                totalsByMethod: session.movements.reduce<Record<string, number>>((acc, movement) => {
                    acc[movement.method] = (acc[movement.method] ?? 0) + movement.amountCents;
                    return acc;
                }, {}),
            })),
        };
    }

    async getTopItems(range: DateRange, filters?: ReportFilters) {
        const items = await this.prisma.orderItem.groupBy({
            by: ['productId'],
            _sum: {
                qty: true,
                subtotalCents: true,
            },
            where: {
                order: this.buildSettledOrderWhere(range, filters),
            },
            orderBy: {
                _sum: { qty: 'desc' },
            },
            take: 5,
        });

        return Promise.all(
            items.map(async (item) => {
                const product = await this.prisma.product.findUnique({
                    where: { id: item.productId },
                });

                return {
                    productId: item.productId,
                    name: product?.name || 'Produto Desconhecido',
                    qtySold: item._sum?.qty || 0,
                    revenueCents: item._sum?.subtotalCents || 0,
                };
            }),
        );
    }
}
