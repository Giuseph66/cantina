import { useEffect, useState } from 'react';
import { socket } from '../services/socket';
import { useAuth } from '../contexts/AuthContext';

export function useNotifications() {
    const { user } = useAuth();
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        if (!('Notification' in window)) return false;
        if (permission === 'granted') return true;

        const perm = await Notification.requestPermission();
        setPermission(perm);
        return perm === 'granted';
    };

    useEffect(() => {
        if (!user || user.role !== 'CLIENT') return;

        const handleStatus = (data: any) => {
            // Se o status mudou para READY e o pedido pertence a esse usuário logado
            if (data.status === 'READY' && data.userId === user.id) {
                if (Notification.permission === 'granted') {
                    new Notification('Seu pedido está pronto!', {
                        body: `Cantina Neurelix: O ticket ${data.ticketCode} já pode ser retirado no balcão.`,
                        icon: '/vite.svg'
                    });
                }
            }
        };

        socket.on('order_status_update', handleStatus);

        return () => {
            socket.off('order_status_update', handleStatus);
        };
    }, [user]);

    return {
        permission,
        requestPermission
    };
}
