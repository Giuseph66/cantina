export enum Role {
    CLIENT = 'CLIENT',
    CASHIER = 'CASHIER',
    KITCHEN = 'KITCHEN',
    ADMIN = 'ADMIN',
}

export enum OrderStatus {
    CREATED = 'CREATED',
    CONFIRMED = 'CONFIRMED',
    PAID = 'PAID',
    IN_PREP = 'IN_PREP',
    READY = 'READY',
    PICKED_UP = 'PICKED_UP',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
}

export enum OrderChannel {
    ONLINE = 'ONLINE',
    COUNTER = 'COUNTER',
}

export enum PaymentMethod {
    ONLINE = 'ONLINE',
    ON_PICKUP = 'ON_PICKUP',
    PIX = 'PIX',
    CASH = 'CASH',
    CARD = 'CARD',
    INTERNAL_CREDIT = 'INTERNAL_CREDIT',
}

export enum StockMode {
    UNLIMITED = 'UNLIMITED',
    CONTROLLED = 'CONTROLLED',
}

export enum CashMovementType {
    SALE = 'SALE',
    SANGRIA = 'SANGRIA',
    AJUSTE = 'AJUSTE',
}
