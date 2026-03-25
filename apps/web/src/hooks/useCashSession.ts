import { useEffect, useState } from 'react';
import { useApi } from './useApi';

interface CashSession {
    id: string;
    openedAt: string;
    openingCashCents: number;
    closedAt: string | null;
}

export function useCashSession() {
    const api = useApi();
    const [session, setSession] = useState<CashSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    async function refresh() {
        setIsLoading(true);
        try {
            const data = await api.get<CashSession | null>('/cash/today');
            setSession(data);
        } catch {
            setSession(null);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
    }, []);

    return {
        session,
        isLoading,
        hasOpenSession: !!session,
        refresh,
    };
}
