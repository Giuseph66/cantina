import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { socket } from '../../services/socket';
import { Bell } from 'lucide-react';
import styles from './TotemPage.module.css';

export default function TotemPage() {
    const api = useApi();
    const [readyOrders, setReadyOrders] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchReadyOrders = async () => {
        try {
            const data = await api.get<any[]>('/orders/ready');
            setReadyOrders(data);
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar painel');
        }
    };

    useEffect(() => {
        fetchReadyOrders();

        // Clock timer
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        const handleStatusUpdate = (data: any) => {
            if (data.status === 'READY') {
                try {
                    const audio = new Audio('/bell.mp3');
                    audio.play().catch(() => { });
                } catch (e) { }
                fetchReadyOrders();
            } else if (data.status === 'PICKED_UP') {
                setReadyOrders(prev => prev.filter(o => o.id !== data.orderId));
            }
        };

        socket.on('order_status_update', handleStatusUpdate);

        return () => {
            socket.off('order_status_update', handleStatusUpdate);
            clearInterval(timer);
        };
    }, []);

    if (error) {
        return <div className={styles.errorState}>{error}</div>;
    }

    return (
        <div className={styles.totemPage}>
            <header className={styles.header}>
                <div className={styles.logoGroup}>
                    <img src="/logo.svg" alt="Logo" className={styles.logo} />
                    <h1>Retirada de Pedidos</h1>
                </div>
                <div className={styles.clock}>
                    {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
            </header>

            <main className={styles.main}>
                <div className={styles.board}>
                    <h2 className={styles.boardTitle}>
                        PRONTOS PARA RETIRAR
                        <Bell size={48} strokeWidth={3} className={styles.bellIcon} />
                    </h2>
                    <div className={styles.grid}>
                        {readyOrders.length === 0 ? (
                            <div className={styles.empty}>
                                <p>Aguardando novos pedidos ficarem prontos...</p>
                                <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.6 }}>Atualizado em tempo real</span>
                            </div>
                        ) : (
                            readyOrders.map(order => (
                                <div key={order.id} className={`${styles.ticketCard} ${styles.fadeIn}`}>
                                    <span className={styles.ticketCode}>{order.ticket?.codeShort || '---'}</span>
                                    <span className={styles.ticketSubtitle}>Senha</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <p style={{ marginTop: 'auto', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.5 }}>
                    Por favor, dirija-se ao balcão ao ver seu número
                </p>
            </main>
        </div>
    );
}
