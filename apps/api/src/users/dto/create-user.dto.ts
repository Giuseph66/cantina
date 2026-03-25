import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsEmail({}, { message: 'Email inválido' })
    @MaxLength(254)
    email: string;

    @IsString()
    @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
    @MaxLength(128)
    password: string;

    @IsEnum(['CLIENT', 'CASHIER', 'KITCHEN', 'ADMIN'], {
        message: 'Role inválida. Valores aceitos: CLIENT, CASHIER, KITCHEN, ADMIN',
    })
    role: 'CLIENT' | 'CASHIER' | 'KITCHEN' | 'ADMIN';
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsEmail({}, { message: 'Email inválido' })
    @MaxLength(254)
    email?: string;

    @IsOptional()
    @IsEnum(['CLIENT', 'CASHIER', 'KITCHEN', 'ADMIN'], {
        message: 'Role inválida. Valores aceitos: CLIENT, CASHIER, KITCHEN, ADMIN',
    })
    role?: string;

    @IsOptional()
    @IsString()
    @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
    @MaxLength(128)
    password?: string;
}
