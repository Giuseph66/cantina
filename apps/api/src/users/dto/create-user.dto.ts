import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const CPF_PATTERN = /^[0-9.\-]{11,14}$/;
const PHONE_PATTERN = /^[0-9()\-\s+]{10,20}$/;

export class CreateUserDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsEmail({}, { message: 'Email inválido' })
    @MaxLength(254)
    email: string;

    @IsOptional()
    @IsString()
    @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
    @MaxLength(128)
    password?: string;

    @IsOptional()
    @IsString()
    @Matches(CPF_PATTERN, { message: 'CPF inválido' })
    cpf?: string;

    @IsOptional()
    @IsString()
    @Matches(PHONE_PATTERN, { message: 'Celular inválido' })
    phone?: string;

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

    @IsOptional()
    @IsString()
    @Matches(CPF_PATTERN, { message: 'CPF inválido' })
    cpf?: string;

    @IsOptional()
    @IsString()
    @Matches(PHONE_PATTERN, { message: 'Celular inválido' })
    phone?: string;
}
