import { IsString, MaxLength } from 'class-validator';

export class GoogleAuthDto {
    @IsString()
    @MaxLength(4096)
    credential: string;
}
