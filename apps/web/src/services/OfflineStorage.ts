import { get, set } from 'idb-keyval';

export interface OfflineTicket {
    id: string;
    codeShort: string;
    tokenHash: string | null;
    expiresAt: string;
    consumedAt: string | null;
    order: {
        id: string;
        user: { name: string; id: string };
        items: { qty: number; product: { name: string } }[];
    }
}

export interface SyncConsumption {
    ticketId: string;
    consumedAtOffline: string;
    deviceId: string;
}

const CACHE_KEY = 'cantina_offline_tickets';
const QUEUE_KEY = 'cantina_sync_queue';
const DEVICE_ID_KEY = 'cantina_device_id';

function createDeviceId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `web-cashier-${Date.now()}`;
}

export const OfflineStorage = {
    // --- TICKET CACHE ---
    async saveTicketsCache(tickets: OfflineTicket[]): Promise<void> {
        await set(CACHE_KEY, tickets);
    },

    async getTicketsCache(): Promise<OfflineTicket[]> {
        const data = await get<OfflineTicket[]>(CACHE_KEY);
        return data || [];
    },

    async findTicket(codeOrToken: string): Promise<OfflineTicket | null> {
        const tickets = await this.getTicketsCache();
        // Busca por codeShort exato ou hash de token
        return tickets.find(t => t.codeShort === codeOrToken || t.tokenHash === codeOrToken) || null;
    },

    async markTicketConsumedLocally(ticketId: string): Promise<void> {
        const tickets = await this.getTicketsCache();
        const updated = tickets.map(t => t.id === ticketId ? { ...t, consumedAt: new Date().toISOString() } : t);
        await set(CACHE_KEY, updated);
    },

    // --- SYNC QUEUE ---
    async getSyncQueue(): Promise<SyncConsumption[]> {
        const queue = await get<SyncConsumption[]>(QUEUE_KEY);
        return queue || [];
    },

    async getDeviceId(): Promise<string> {
        const existingId = await get<string>(DEVICE_ID_KEY);
        if (existingId) return existingId;

        const deviceId = createDeviceId();
        await set(DEVICE_ID_KEY, deviceId);
        return deviceId;
    },

    async enqueueConsumption(ticketId: string): Promise<void> {
        const queue = await this.getSyncQueue();
        // Evita duplicatas locais na fila
        if (!queue.find(q => q.ticketId === ticketId)) {
            const deviceId = await this.getDeviceId();
            queue.push({
                ticketId,
                consumedAtOffline: new Date().toISOString(),
                deviceId
            });
            await set(QUEUE_KEY, queue);
        }
    },

    async clearSyncQueue(syncedTicketIds: string[]): Promise<void> {
        const queue = await this.getSyncQueue();
        const newQueue = queue.filter(q => !syncedTicketIds.includes(q.ticketId));
        await set(QUEUE_KEY, newQueue);
    }
};
