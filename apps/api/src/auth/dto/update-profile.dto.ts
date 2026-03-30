import { IsString, Matches } from 'class-validator';

const CPF_PATTERN = /^\d{11}$/;
const PHONE_PATTERN = /^\d{10,15}$/;

export class UpdateProfileDto {
    @IsString()
    @Matches(CPF_PATTERN, { message: 'Informe um CPF válido com 11 dígitos' })
    cpf: string;

    @IsString()
    @Matches(PHONE_PATTERN, { message: 'Informe um celular válido com DDD' })
    phone: string;
}
