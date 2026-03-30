import {
    Controller,
    Post,
    Body,
    Get,
    Patch,
    UseGuards,
    HttpCode,
    HttpStatus,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import {
    AUTH_COOKIE_NAME,
    buildAuthCookieOptions,
    buildClearAuthCookieOptions,
} from './auth-cookie.util';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(dto.email, dto.password);

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());

        return { user: result.user };
    }

    @Get('public-config')
    getPublicConfig() {
        return this.authService.getPublicConfig();
    }

    @Post('google')
    @HttpCode(HttpStatus.OK)
    async loginWithGoogle(@Body() dto: GoogleAuthDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.loginWithGoogle(dto.credential);

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());

        return { user: result.user };
    }

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.registerClient(dto.name, dto.email, dto.password);

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());

        return { user: result.user };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie(AUTH_COOKIE_NAME, buildClearAuthCookieOptions());
        return { success: true };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async me(@CurrentUser() user: User) {
        return this.authService.getMe(user.id);
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
        return this.authService.updateProfile(user.id, dto);
    }
}
