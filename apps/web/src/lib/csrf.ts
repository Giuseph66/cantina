const CSRF_COOKIE_NAME = 'cantina_csrf';

function readCookie(cookieName: string) {
    if (typeof document === 'undefined') {
        return null;
    }

    const prefix = `${cookieName}=`;
    const cookie = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix));

    if (!cookie) {
        return null;
    }

    return decodeURIComponent(cookie.slice(prefix.length));
}

export function appendCsrfHeader(headers: Headers, method?: string) {
    const normalizedMethod = (method ?? 'GET').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
        return;
    }

    const token = readCookie(CSRF_COOKIE_NAME);
    if (!token) {
        return;
    }

    headers.set('x-csrf-token', token);
}
