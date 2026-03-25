/**
 * Shared application enums.
 * Prisma uses these as plain strings in SQLite — these constants mirror the DB values.
 */

export const Role = {
    CLIENT: 'CLIENT',
    CASHIER: 'CASHIER',
    KITCHEN: 'KITCHEN',
    ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OrderStatus = {
    CREATED: 'CREATED',
    CONFIRMED: 'CONFIRMED',
    PAID: 'PAID',
    IN_PREP: 'IN_PREP',
    READY: 'READY',
    PICKED_UP: 'PICKED_UP',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderChannel = {
    ONLINE: 'ONLINE',
    COUNTER: 'COUNTER',
} as const;
export type OrderChannel = (typeof OrderChannel)[keyof typeof OrderChannel];

export const PaymentMethod = {
    ON_PICKUP: 'ON_PICKUP',
    PIX: 'PIX',
    CASH: 'CASH',
    CARD: 'CARD',
    INTERNAL_CREDIT: 'INTERNAL_CREDIT',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const CreditNoteStatus = {
    OPEN: 'OPEN',
    PAID: 'PAID',
    CANCELLED: 'CANCELLED',
} as const;
export type CreditNoteStatus = (typeof CreditNoteStatus)[keyof typeof CreditNoteStatus];

export const StockMode = {
    UNLIMITED: 'UNLIMITED',
    CONTROLLED: 'CONTROLLED',
} as const;
export type StockMode = (typeof StockMode)[keyof typeof StockMode];

export const CashMovementType = {
    SALE: 'SALE',
    SANGRIA: 'SANGRIA',
    AJUSTE: 'AJUSTE',
} as const;
export type CashMovementType = (typeof CashMovementType)[keyof typeof CashMovementType];
