import { useState, useEffect, useMemo } from 'react';
import { ProxyImage } from '../../components/ProxyImage';
import { useApi } from '../../hooks/useApi';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
    RefreshCw, ClipboardList, Package,
    CreditCard, CheckCheck, Ban, ChevronRight, Clock,
} from 'lucide-react';
import styles from './OrdersPage.module.css';

type OrderStatus =
    | 'CREATED' | 'CONFIRMED' | 'PAID' | 'IN_PREP'
    | 'READY' | 'PICKED_UP' | 'CANCELLED' | 'EXPIRED';

type PaymentMethod = 'ON_PICKUP' | 'PIX' | 'CASH' | 'CARD' | 'INTERNAL_CREDIT';

interface OrderItem {
    id: string; qty: number; unitPriceCents: number; subtotalCents: number;
    product: { id: string; name: string; imageUrl: string | null };
}

interface Order {
    id: string;
    status: OrderStatus;
    channel: 'ONLINE' | 'COUNTER';
    totalCents: number;
    paymentMethod: PaymentMethod;
    createdAt: string;
    user: { id: string; name: string; email: string } | null;
    items: OrderItem[];
    ticket: { id: string; codeShort: string; consumedAt: string | null; expiresAt: string } | null;
}

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABEL: Record<OrderStatus, string> = {
    CREATED: 'Criado', CONFIRMED: 'Confirmado', PAID: 'Pago',
    IN_PREP: 'Em preparo', READY: 'Pronto', PICKED_UP: 'Retirado',
    CANCELLED: 'Cancelado', EXPIRED: 'Expirado',
};

const PAY_LABEL: Record<PaymentMethod, string> = {
    ON_PICKUP: 'Na retirada', PIX: 'PIX', CASH: 'Dinheiro', CARD: 'Cartão', INTERNAL_CREDIT: 'Notinha',
};

const ALL_STATUSES: OrderStatus[] = [
    'CREATED', 'CONFIRMED', 'PAID', 'IN_PREP', 'READY', 'PICKED_UP', 'CANCELLED', 'EXPIRED',
];

const NEXT_ACTIONS: Partial<Record<OrderStatus, { label: string; status: OrderStatus; cls: string }[]>> = {
    CREATED:   [{ label: 'Confirmar',  status: 'CONFIRMED', cls: styles.btnConfirm },
                { label: 'Cancelar',   status: 'CANCELLED', cls: styles.btnCancel }],
    CONFIRMED: [{ label: 'Em preparo', status: 'IN_PREP',   cls: styles.btnPrep },
                { label: 'Cancelar',   status: 'CANCELLED', cls: styles.btnCancel }],
    PAID:      [{ label: 'Em preparo', status: 'IN_PREP',   cls: styles.btnPrep }],
    IN_PREP:   [{ label: 'Pronto',     status: 'READY',     cls: styles.btnReady }],
};

export default function OrdersPage() {
    const api = useApi();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL');
    const [updating, setUpdating] = useState<string | null>(null);

    const fetchOrders = async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const data = await api.get<Order[]>('/admin/orders');
            setOrders(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchOrders(); }, []);

    useEffect(() => {
        const iv = setInterval(() => fetchOrders(true), 30_000);
        return () => clearInterval(iv);
    }, []);

    const counts = useMemo(() => {
        const map: Partial<Record<OrderStatus, number>> = {};
        for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1;
        return map;
    }, [orders]);

    const visible = useMemo(() =>
        activeTab === 'ALL' ? orders : orders.filter(o => o.status === activeTab),
        [orders, activeTab]
    );

    const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
        setUpdating(orderId);
        try {
            await api.patch(`/admin/orders/${orderId}/status`, { status });
            await fetchOrders(true);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setUpdating(null);
        }
    };

    return (
        <AdminLayout title="Pedidos" subtitle="Acompanhe e gerencie os pedidos em tempo real">
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('ALL')}
                    >
                        Todos <span className={styles.tabCount}>{orders.length}</span>
                    </button>
                    {ALL_STATUSES.filter(s => counts[s]).map(s => (
                        <button
                            key={s}
                            className={`${styles.tab} ${activeTab === s ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(s)}
                        >
                            {STATUS_LABEL[s]} <span className={styles.tabCount}>{counts[s]}</span>
                        </button>
                    ))}
                </div>

                <button
                    className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                    onClick={() => fetchOrders(true)}
                    disabled={refreshing}
                >
                    <RefreshCw size={15} /> Atualizar
                </button>
            </div>

            <p className={styles.statsBar}>
                {loading ? 'Carregando...' : `${visible.length} pedido${visible.length !== 1 ? 's' : ''}`}
            </p>

            {/* Lista */}
            {loading ? (
                <div className={styles.loading}>Carregando pedidos...</div>
            ) : visible.length === 0 ? (
                <div className={styles.empty}>
                    <ClipboardList size={48} strokeWidth={1.2} className={styles.emptyIcon} />
                    <p className={styles.emptyText}>Nenhum pedido encontrado</p>
                </div>
            ) : (
                <div className={styles.list}>
                    {visible.map(order => {
                        const actions = NEXT_ACTIONS[order.status] ?? [];
                        const isUpdating = updating === order.id;
                        return (
                            <div key={order.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardHeaderLeft}>
                                        <span className={styles.orderCode}>#{order.id.slice(-6).toUpperCase()}</span>
                                        <div>
                                            <p className={styles.userName}>{order.user?.name ?? 'Balcão'}</p>
                                            <p className={styles.userEmail}>{order.user?.email ?? '—'}</p>
                                        </div>
                                    </div>
                                    <div className={styles.cardHeaderRight}>
                                        <span className={styles.channelBadge}>
                                            {order.channel === 'ONLINE' ? 'Online' : 'Balcão'}
                                        </span>
                                        <span className={`${styles.statusBadge} ${styles[`status${order.status}`]}`}>
                                            {STATUS_LABEL[order.status]}
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.cardItems}>
                                    {order.items.map(item => (
                                        <div key={item.id} className={styles.item}>
                                            {item.product?.imageUrl
                                                ? <ProxyImage src={item.product.imageUrl} alt={item.product.name} className={styles.itemThumb} />
                                                : <div className={styles.itemThumbPlaceholder}><Package size={14} /></div>
                                            }
                                            <span className={styles.itemName}>{item.product?.name ?? 'Produto removido'}</span>
                                            <span className={styles.itemQty}>x{item.qty}</span>
                                            <span className={styles.itemPrice}>{formatCurrency(item.subtotalCents)}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.cardFooter}>
                                    <div className={styles.footerMeta}>
                                        <span className={styles.total}>{formatCurrency(order.totalCents)}</span>
                                        <span className={styles.payMethod}>
                                            <CreditCard size={12} /> {PAY_LABEL[order.paymentMethod]}
                                        </span>
                                        <span className={styles.time}>
                                            <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                                            {formatTime(order.createdAt)}
                                        </span>
                                        {order.ticket && (
                                            <span className={styles.ticketCode}>{order.ticket.codeShort}</span>
                                        )}
                                    </div>

                                    {actions.length > 0 && (
                                        <div className={styles.actions}>
                                            {actions.map(action => (
                                                <button
                                                    key={action.status}
                                                    className={`${styles.actionBtn} ${action.cls}`}
                                                    disabled={isUpdating}
                                                    onClick={() => handleUpdateStatus(order.id, action.status)}
                                                >
                                                    {action.status === 'READY'     && <CheckCheck size={13} />}
                                                    {action.status === 'CANCELLED' && <Ban size={13} />}
                                                    {(action.status === 'IN_PREP' || action.status === 'CONFIRMED') && <ChevronRight size={13} />}
                                                    {isUpdating ? '...' : action.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </AdminLayout>
    );
}
