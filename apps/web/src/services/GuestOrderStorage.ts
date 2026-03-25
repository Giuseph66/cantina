import { get, set } from 'idb-keyval';

const GUEST_ORDER_IDS_KEY = 'cantina_guest_order_ids';
const MAX_GUEST_ORDERS = 20;

export const GuestOrderStorage = {
    async getOrderIds(): Promise<string[]> {
        return (await get<string[]>(GUEST_ORDER_IDS_KEY)) ?? [];
    },

    async addOrderId(orderId: string): Promise<void> {
        const current = await this.getOrderIds();
        const next = [orderId, ...current.filter((id) => id !== orderId)].slice(0, MAX_GUEST_ORDERS);
        await set(GUEST_ORDER_IDS_KEY, next);
    },
};
