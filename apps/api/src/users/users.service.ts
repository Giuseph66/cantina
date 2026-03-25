import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: CreateUserDto): Promise<Omit<User, 'passwordHash'>> {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

        if (existing) {
            throw new ConflictException('Email já cadastrado');
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);

        const user = await this.prisma.user.create({
            data: {
                name: dto.name,
                email: dto.email,
                passwordHash,
                role: dto.role,
            },
        });

        const { passwordHash: _omit, ...safeUser } = user;
        return safeUser;
    }

    async deactivate(id: string): Promise<Omit<User, 'passwordHash'>> {
        const user = await this.prisma.user.findUnique({ where: { id } });

        if (!user) {
            throw new NotFoundException(`Usuário ${id} não encontrado`);
        }

        const updated = await this.prisma.user.update({
            where: { id },
            data: { isActive: false },
        });

        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
    }

    async update(id: string, dto: { name?: string; email?: string; role?: string; password?: string }): Promise<Omit<User, 'passwordHash'>> {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException(`Usuário ${id} não encontrado`);

        if (dto.email && dto.email !== user.email) {
            const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
            if (existing) throw new ConflictException('Email já cadastrado');
        }

        const data: any = {};
        if (dto.name) data.name = dto.name;
        if (dto.email) data.email = dto.email;
        if (dto.role) data.role = dto.role;
        if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

        const updated = await this.prisma.user.update({ where: { id }, data });
        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
    }

    async activate(id: string): Promise<Omit<User, 'passwordHash'>> {
        const user = await this.prisma.user.findUnique({ where: { id } });

        if (!user) {
            throw new NotFoundException(`Usuário ${id} não encontrado`);
        }

        const updated = await this.prisma.user.update({
            where: { id },
            data: { isActive: true },
        });

        const { passwordHash: _omit, ...safeUser } = updated;
        return safeUser;
    }

    async findAll(): Promise<Omit<User, 'passwordHash'>[]> {
        const users = await this.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return users.map(({ passwordHash: _omit, ...u }) => u);
    }
}
