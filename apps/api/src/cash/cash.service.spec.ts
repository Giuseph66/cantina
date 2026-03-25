import { Test, TestingModule } from '@nestjs/testing';
import { CashService } from './cash.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { BadRequestException } from '@nestjs/common';

describe('CashService', () => {
    let service: CashService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CashService,
                {
                    provide: PrismaService,
                    useValue: {
                        cashSession: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
                        order: { findMany: jest.fn() },
                    },
                },
                { provide: AuditService, useValue: { log: jest.fn() } },
            ],
        }).compile();

        service = module.get<CashService>(CashService);
        prisma = module.get<PrismaService>(PrismaService);
    });

    it('não deve fechar caixa se não tiver um aberto', async () => {
        jest.spyOn(prisma.cashSession, 'findFirst').mockResolvedValue(null);

        await expect(service.close('user-1', { countedCashCents: 0, notes: '' })).rejects.toThrow(BadRequestException);
    });

    it('não deve abrir caixa se já houver um aberto', async () => {
        jest.spyOn(prisma.cashSession, 'findFirst').mockResolvedValue({ id: 'sess1' } as any);

        await expect(service.open('user-1', { openingCashCents: 5000 })).rejects.toThrow(BadRequestException);
    });

    it('deve permitir abrir caixa quando o aberto é de outro funcionário', async () => {
        jest.spyOn(prisma.cashSession, 'findFirst').mockResolvedValue(null);
        jest.spyOn(prisma.cashSession, 'create').mockResolvedValue({ id: 'sess2' } as any);

        await expect(service.open('user-2', { openingCashCents: 5000 })).resolves.toEqual({ id: 'sess2' });
    });

    it('deve fechar caixa com valor contado e calcular diferença', async () => {
        jest.spyOn(prisma.cashSession, 'findFirst').mockResolvedValue({
            id: 'sess3',
            openingCashCents: 2000,
            movements: [
                { type: 'SALE', method: 'CASH', amountCents: 1500 },
                { type: 'SALE', method: 'PIX', amountCents: 900 },
            ],
        } as any);
        jest.spyOn(prisma.cashSession, 'update').mockResolvedValue({
            id: 'sess3',
            closingCashCents: 3500,
            countedCashCents: 3400,
            cashDifferenceCents: -100,
        } as any);

        const result = await service.close('user-1', { countedCashCents: 3400, notes: 'teste' });

        expect(result.summary.expectedCashCents).toBe(3500);
        expect(result.summary.cashDifferenceCents).toBe(-100);
    });
});
