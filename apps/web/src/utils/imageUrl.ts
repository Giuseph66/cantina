/**
 * Normalizes image URLs so they always go through the local proxy,
 * regardless of which domain/origin was stored in the database.
 *
 * Any absolute URL that contains /uploads/ is reduced to its path so that
 * the Vite dev proxy (localhost) and the Vercel edge proxy (production)
 * can serve it without browser-to-origin CORS or ngrok warning issues.
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        const idx = parsed.pathname.indexOf('/uploads/');
        if (idx !== -1) {
            const path = parsed.pathname.slice(idx) + parsed.search;
            return window.location.origin + path;
        }
    } catch {
        // already a relative URL – make it absolute
        if (url.startsWith('/uploads/')) {
            return window.location.origin + url;
        }
    }
    return url;
}
