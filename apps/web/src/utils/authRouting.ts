export type AppRole = 'ADMIN' | 'CASHIER' | 'CLIENT' | string;

export function getDefaultRouteForRole(role?: AppRole | null) {
    if (role === 'ADMIN') return '/admin';
    if (role === 'CASHIER') return '/cashier/scan';
    if (role === 'CLIENT') return '/minha-conta';
    return '/menu';
}

export function normalizeNextRoute(next?: string | null) {
    if (!next || !next.startsWith('/')) return null;

    // Never carry over a specific order resume token across accounts.
    if (next.startsWith('/pedido?orderId=')) {
        return '/pedido';
    }

    if (next.startsWith('/checkout?orderId=')) {
        return '/pedido';
    }

    return next;
}
