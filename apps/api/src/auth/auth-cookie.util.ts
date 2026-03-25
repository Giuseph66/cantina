import type { CookieOptions, Request } from 'express';

export const AUTH_COOKIE_NAME = 'cantina_auth';

const DURATION_TO_MS: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
};

function parseDurationToMs(value: string): number | undefined {
    const normalized = value.trim().toLowerCase();

    if (/^\d+$/.test(normalized)) {
        return Number(normalized) * 1000;
    }

    const match = normalized.match(/^(\d+)([smhd])$/);
    if (!match) return undefined;

    const [, amount, unit] = match;
    return Number(amount) * DURATION_TO_MS[unit];
}

function buildAuthCookieBaseOptions(): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    };
}

export function buildAuthCookieOptions(): CookieOptions {
    const maxAge = parseDurationToMs(process.env.JWT_EXPIRES_IN ?? '8h');

    return maxAge
        ? { ...buildAuthCookieBaseOptions(), maxAge }
        : buildAuthCookieBaseOptions();
}

export function buildClearAuthCookieOptions(): CookieOptions {
    return buildAuthCookieBaseOptions();
}

export function extractAuthTokenFromCookie(request?: Request): string | null {
    const cookieHeader = request?.headers?.cookie;
    if (!cookieHeader) return null;

    const prefix = `${AUTH_COOKIE_NAME}=`;
    const authCookie = cookieHeader
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(prefix));

    if (!authCookie) return null;

    return decodeURIComponent(authCookie.slice(prefix.length));
}
