import * as crypto from 'node:crypto';
import type { CookieOptions, Request } from 'express';

export const AUTH_COOKIE_NAME = 'cantina_auth';
export const CSRF_COOKIE_NAME = 'cantina_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

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

function buildCookieBaseOptions(): CookieOptions {
    return {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    };
}

export function buildAuthCookieOptions(): CookieOptions {
    const maxAge = parseDurationToMs(process.env.JWT_EXPIRES_IN ?? '8h');

    return maxAge
        ? { ...buildCookieBaseOptions(), httpOnly: true, maxAge }
        : { ...buildCookieBaseOptions(), httpOnly: true };
}

export function buildClearAuthCookieOptions(): CookieOptions {
    return { ...buildCookieBaseOptions(), httpOnly: true };
}

export function buildCsrfCookieOptions(): CookieOptions {
    return {
        ...buildCookieBaseOptions(),
        httpOnly: false,
    };
}

export function buildClearCsrfCookieOptions(): CookieOptions {
    return {
        ...buildCookieBaseOptions(),
        httpOnly: false,
    };
}

export function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function extractCookieValue(request: Request | undefined, cookieName: string): string | null {
    const cookieHeader = request?.headers?.cookie;
    if (!cookieHeader) return null;

    const prefix = `${cookieName}=`;
    const cookie = cookieHeader
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix));

    if (!cookie) return null;

    return decodeURIComponent(cookie.slice(prefix.length));
}

export function extractCsrfTokenFromCookie(request?: Request) {
    return extractCookieValue(request, CSRF_COOKIE_NAME);
}

export function extractAuthTokenFromCookie(request?: Request): string | null {
    return extractCookieValue(request, AUTH_COOKIE_NAME);
}
