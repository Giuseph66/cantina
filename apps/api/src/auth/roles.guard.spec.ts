import { RolesGuard } from './guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../common/enums';

const mockExecutionContext = (user: { role: Role } | null, roles: Role[]) => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
        getRequest: () => ({ user }),
    }),
});

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: jest.Mocked<Reflector>;

    beforeEach(() => {
        reflector = {
            getAllAndOverride: jest.fn(),
        } as unknown as jest.Mocked<Reflector>;

        guard = new RolesGuard(reflector);
    });

    it('deve permitir acesso sem roles definidas', () => {
        (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
        const ctx = mockExecutionContext({ role: Role.CLIENT }, []);
        expect(guard.canActivate(ctx as never)).toBe(true);
    });

    it('deve permitir acesso com role correta', () => {
        (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
        const ctx = mockExecutionContext({ role: Role.ADMIN }, [Role.ADMIN]);
        expect(guard.canActivate(ctx as never)).toBe(true);
    });

    it('deve lançar ForbiddenException com role incorreta', () => {
        (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
        const ctx = mockExecutionContext({ role: Role.CLIENT }, [Role.ADMIN]);
        expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException sem usuário autenticado', () => {
        (reflector.getAllAndOverride as jest.Mock).mockReturnValue([Role.ADMIN]);
        const ctx = mockExecutionContext(null, [Role.ADMIN]);
        expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
    });
});
