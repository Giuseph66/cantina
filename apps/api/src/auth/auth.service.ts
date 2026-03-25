import {
    Injectable,
    UnauthorizedException,
    ForbiddenException,
    ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { Role } from '../common/enums';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async registerClient(
        name: string,
        email: string,
        password: string,
    ): Promise<{ access_token: string; user: Omit<User, 'passwordHash'> }> {
        const existing = await this.prisma.user.findUnique({ where: { email } });

        if (existing) {
            throw new ConflictException('Email já cadastrado');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await this.prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                role: Role.CLIENT,
            },
        });

        const payload = { sub: user.id, email: user.email, role: user.role };
        const access_token = this.jwtService.sign(payload);

        const { passwordHash: _omit, ...safeUser } = user;

        return { access_token, user: safeUser };
    }

    async login(email: string, password: string): Promise<{ access_token: string; user: Omit<User, 'passwordHash'> }> {
        const user = await this.prisma.user.findUnique({ where: { email } });

        if (!user) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        if (!user.isActive) {
            throw new ForbiddenException('Usuário desativado. Entre em contato com o administrador.');
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const payload = { sub: user.id, email: user.email, role: user.role };
        const access_token = this.jwtService.sign(payload);

        const { passwordHash: _omit, ...safeUser } = user;

        return { access_token, user: safeUser };
    }

    async getMe(userId: string): Promise<Omit<User, 'passwordHash'>> {
        const user = await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
        });
        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
    }
}
