import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET', 'dev_secret'),
                signOptions: {
                    expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h'),
                },
            }),
        }),
    ],
    providers: [AuthService, JwtStrategy, RolesGuard, OptionalJwtAuthGuard],
    controllers: [AuthController],
    exports: [AuthService, JwtModule, RolesGuard, OptionalJwtAuthGuard],
})
export class AuthModule { }
