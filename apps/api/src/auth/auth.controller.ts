import {
    Controller,
    Post,
    Body,
    Get,
    Patch,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
    CSRF_COOKIE_NAME,
    buildAuthCookieOptions,
    buildClearCsrfCookieOptions,
    buildClearAuthCookieOptions,
    buildCsrfCookieOptions,
    extractCsrfTokenFromCookie,
    generateCsrfToken,
} from './auth-cookie.util';
import { CsrfGuard } from '../common/guards/csrf.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(dto.email, dto.password);
        const csrfToken = generateCsrfToken();

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());
        res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions());

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
        const csrfToken = generateCsrfToken();

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());
        res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions());

        return { user: result.user };
    }

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.registerClient(dto.name, dto.email, dto.password);
        const csrfToken = generateCsrfToken();

        res.cookie(AUTH_COOKIE_NAME, result.access_token, buildAuthCookieOptions());
        res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions());

        return { user: result.user };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard, CsrfGuard)
    logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie(AUTH_COOKIE_NAME, buildClearAuthCookieOptions());
        res.clearCookie(CSRF_COOKIE_NAME, buildClearCsrfCookieOptions());
        return { success: true };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async me(@CurrentUser() user: User, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const csrfToken = extractCsrfTokenFromCookie(req) ?? generateCsrfToken();
        res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCsrfCookieOptions());
        return this.authService.getMe(user.id);
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard, CsrfGuard)
    async updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
        return this.authService.updateProfile(user.id, dto);
    }
}
