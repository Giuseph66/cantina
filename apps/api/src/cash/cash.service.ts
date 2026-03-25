import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { OpenCashDto, CloseCashDto } from './dto/cash.dto';
import { CashMovementType, PaymentMethod } from '../common/enums';

@Injectable()
export class CashService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
    ) { }

    async open(userId: string, dto: OpenCashDto) {
        const openSession = await this.prisma.cashSession.findFirst({
            where: {
                openedById: userId,
                closedAt: null,
            },
        });
        if (openSession) {
            throw new BadRequestException('Você já possui um caixa aberto. Feche-o antes de abrir um novo.');
        }

        const session = await this.prisma.cashSession.create({
            data: {
                openedById: userId,
                openingCashCents: dto.openingCashCents,
            },
        });

        await this.audit.log(userId, 'CASH_OPENED', 'CashSession', session.id, {
            openingCashCents: dto.openingCashCents,
        });

        return session;
    }

    private buildSessionSummary(
        movements: Array<{ amountCents: number; method: string; type: string }>,
        openingCashCents: number,
    ) {
        const totalsByMethod: Record<string, number> = {};
        let expectedCashCents = openingCashCents;

        for (const movement of movements) {
            totalsByMethod[movement.method] = (totalsByMethod[movement.method] ?? 0) + movement.amountCents;

            if (movement.method !== PaymentMethod.CASH) continue;

            if (movement.type === CashMovementType.SALE || movement.type === CashMovementType.AJUSTE) {
                expectedCashCents += movement.amountCents;
            } else if (movement.type === CashMovementType.SANGRIA) {
                expectedCashCents -= movement.amountCents;
            }
        }

        return {
            totalsByMethod,
            expectedCashCents,
            movementCount: movements.length,
        };
    }

    async close(userId: string, dto: CloseCashDto) {
        const session = await this.prisma.cashSession.findFirst({
            where: {
                openedById: userId,
                closedAt: null,
            },
            include: { movements: true },
        });

        if (!session) {
            throw new BadRequestException('Nenhum caixa aberto foi encontrado para este funcionário.');
        }

        const summary = this.buildSessionSummary(session.movements, session.openingCashCents);
        const cashDifferenceCents = dto.countedCashCents - summary.expectedCashCents;

        const closed = await this.prisma.cashSession.update({
            where: { id: session.id },
            data: {
                closedById: userId,
                closedAt: new Date(),
                closingCashCents: summary.expectedCashCents,
                countedCashCents: dto.countedCashCents,
                cashDifferenceCents,
                notes: dto.notes,
            },
        });

        await this.audit.log(userId, 'CASH_CLOSED', 'CashSession', session.id, {
            ...summary,
            countedCashCents: dto.countedCashCents,
            cashDifferenceCents,
        });

        return {
            session: closed,
            summary: {
                ...summary,
                countedCashCents: dto.countedCashCents,
                cashDifferenceCents,
            },
        };
    }

    async getToday(userId: string) {
        const session = await this.prisma.cashSession.findFirst({
            where: {
                openedById: userId,
                closedAt: null,
            },
            include: {
                movements: { include: { referenceOrder: true } },
                openedBy: { select: { name: true } },
            },
        });

        if (!session) {
            return null;
        }

        return {
            ...session,
            summary: this.buildSessionSummary(session.movements, session.openingCashCents),
        };
    }

    async getDailyReport(range: { start: Date; end: Date; normalizedDate: string }) {
        const [sessions, orders] = await Promise.all([
            this.prisma.cashSession.findMany({
                where: { openedAt: { gte: range.start, lte: range.end } },
                include: {
                    movements: true,
                    openedBy: { select: { id: true, name: true } },
                },
            }),
            this.prisma.order.findMany({
                where: { paidAt: { gte: range.start, lte: range.end } },
                include: { items: { include: { product: true } } },
            }),
        ]);

        const totalSales = orders
            .filter((o) => !!o.paidAt)
            .reduce((sum, o) => sum + o.totalCents, 0);

        const onlineOrders = orders.filter((o) => o.channel === 'ONLINE').length;
        const counterOrders = orders.filter((o) => o.channel === 'COUNTER').length;
        const expiredOrders = await this.prisma.order.count({
            where: {
                createdAt: { gte: range.start, lte: range.end },
                status: 'EXPIRED',
            },
        });

        return {
            date: range.normalizedDate,
            totalSalesCents: totalSales,
            onlineOrders,
            counterOrders,
            expiredOrders,
            salesByMethod: orders.reduce<Record<string, number>>((acc, order) => {
                acc[order.paymentMethod] = (acc[order.paymentMethod] ?? 0) + order.totalCents;
                return acc;
            }, {}),
            sessions: sessions.map((session) => ({
                id: session.id,
                openedAt: session.openedAt,
                closedAt: session.closedAt,
                openedBy: session.openedBy,
                openingCashCents: session.openingCashCents,
                closingCashCents: session.closingCashCents,
                countedCashCents: session.countedCashCents,
                cashDifferenceCents: session.cashDifferenceCents,
                ...this.buildSessionSummary(session.movements, session.openingCashCents),
            })),
        };
    }
}
