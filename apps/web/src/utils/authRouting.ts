export type AppRole = 'ADMIN' | 'CASHIER' | 'CLIENT' | string;

export function getDefaultRouteForRole(role?: AppRole | null) {
    if (role === 'ADMIN') return '/admin';
    if (role === 'CASHIER') return '/cashier/scan';
    if (role === 'CLIENT') return '/minha-conta';
    return '/menu';
}
