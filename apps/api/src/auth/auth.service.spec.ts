import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Role } from '../common/enums';
import * as bcrypt from 'bcrypt';

const mockUser = {
    id: 'user-id-1',
    name: 'Admin',
    email: 'admin@cantina.local',
    passwordHash: '',
    role: Role.ADMIN,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('AuthService', () => {
    let service: AuthService;
    let prisma: jest.Mocked<PrismaService>;
    let jwtService: jest.Mocked<JwtService>;

    beforeEach(async () => {
        mockUser.passwordHash = await bcrypt.hash('admin123', 10);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: PrismaService,
                    useValue: {
                        user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
                    },
                },
                {
                    provide: JwtService,
                    useValue: { sign: jest.fn().mockReturnValue('mock.jwt.token') },
                },
            ],
        }).compile();

        service = module.get(AuthService);
        prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
        jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    });

    it('deve retornar access_token com credenciais válidas', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const result = await service.login('admin@cantina.local', 'admin123');

        expect(result.access_token).toBe('mock.jwt.token');
        expect(result.user.email).toBe('admin@cantina.local');
        expect((result.user as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('deve lançar UnauthorizedException com usuário inexistente', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(service.login('nao@existe.com', 'qualquer')).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('deve lançar UnauthorizedException com senha errada', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        await expect(service.login('admin@cantina.local', 'senhaerrada')).rejects.toThrow(
            UnauthorizedException,
        );
    });

    it('deve lançar ForbiddenException se usuário inativo', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            ...mockUser,
            isActive: false,
        });

        await expect(service.login('admin@cantina.local', 'admin123')).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('getMe deve retornar usuário sem passwordHash', async () => {
        (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(mockUser);

        const result = await service.getMe(mockUser.id);
        expect(result.id).toBe(mockUser.id);
        expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
});
