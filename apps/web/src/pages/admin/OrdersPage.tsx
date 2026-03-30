import { useState, useEffect, useMemo } from 'react';
import { ProxyImage } from '../../components/ProxyImage';
import { useApi } from '../../hooks/useApi';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
    CalendarRange,
    CheckCheck,
    ChevronRight,
    ClipboardList,
    CreditCard,
    Ban,
    Clock,
    Package,
    RefreshCw,
    ShoppingBag,
    UserRound,
} from 'lucide-react';
import styles from './OrdersPage.module.css';

type OrderStatus =
    | 'CREATED' | 'CONFIRMED' | 'PAID' | 'IN_PREP'
    | 'READY' | 'PICKED_UP' | 'CANCELLED' | 'EXPIRED';

type PaymentMethod = 'ONLINE' | 'ON_PICKUP' | 'PIX' | 'CASH' | 'CARD' | 'INTERNAL_CREDIT';

interface OrderItem {
    id: string;
    productId: string;
    qty: number;
    unitPriceCents: number;
    subtotalCents: number;
    productName: string;
    product: { id: string; name: string; imageUrl: string | null } | null;
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

type SeparationGroup = {
    userId: string;
    name: string;
    email: string;
    orders: Order[];
    totalCents: number;
    itemCount: number;
    itemsSummary: Array<{ key: string; label: string; qty: number }>;
};

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toInputDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function shiftDate(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toInputDate(date);
}

const STATUS_LABEL: Record<OrderStatus, string> = {
    CREATED: 'Criado',
    CONFIRMED: 'Confirmado',
    PAID: 'Pago',
    IN_PREP: 'Em preparo',
    READY: 'Pronto',
    PICKED_UP: 'Retirado',
    CANCELLED: 'Cancelado',
    EXPIRED: 'Expirado',
};

const PAY_LABEL: Record<PaymentMethod, string> = {
    ONLINE: 'Pagamento online',
    ON_PICKUP: 'Na retirada',
    PIX: 'PIX',
    CASH: 'Dinheiro',
    CARD: 'Cartão',
    INTERNAL_CREDIT: 'Notinha',
};

const ALL_STATUSES: OrderStatus[] = [
    'CREATED', 'CONFIRMED', 'PAID', 'IN_PREP', 'READY', 'PICKED_UP', 'CANCELLED', 'EXPIRED',
];

const PICKUP_SEPARATION_STATUSES: OrderStatus[] = ['PAID', 'IN_PREP', 'READY'];

const NEXT_ACTIONS: Partial<Record<OrderStatus, { label: string; status: OrderStatus; cls: string }[]>> = {
    CREATED: [{ label: 'Confirmar', status: 'CONFIRMED', cls: styles.btnConfirm },
        { label: 'Cancelar', status: 'CANCELLED', cls: styles.btnCancel }],
    CONFIRMED: [{ label: 'Em preparo', status: 'IN_PREP', cls: styles.btnPrep },
        { label: 'Cancelar', status: 'CANCELLED', cls: styles.btnCancel }],
    PAID: [{ label: 'Em preparo', status: 'IN_PREP', cls: styles.btnPrep }],
    IN_PREP: [{ label: 'Pronto', status: 'READY', cls: styles.btnReady }],
};

export default function OrdersPage() {
    const api = useApi();
    const today = toInputDate(new Date());
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL');
    const [updating, setUpdating] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);

    const fetchOrders = async (silent = false, range?: { dateFrom: string; dateTo: string }) => {
        const filters = range ?? { dateFrom, dateTo };
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const qs = new URLSearchParams();
            if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
            if (filters.dateTo) qs.set('dateTo', filters.dateTo);
            const data = await api.get<Order[]>(`/admin/orders${qs.toString() ? `?${qs}` : ''}`);
            setOrders(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        void fetchOrders(false, { dateFrom: today, dateTo: today });
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            void fetchOrders(true);
        }, 30_000);
        return () => clearInterval(interval);
    }, [dateFrom, dateTo]);

    const counts = useMemo(() => {
        const map: Partial<Record<OrderStatus, number>> = {};
        for (const order of orders) map[order.status] = (map[order.status] ?? 0) + 1;
        return map;
    }, [orders]);

    const visible = useMemo(() =>
        activeTab === 'ALL' ? orders : orders.filter((order) => order.status === activeTab),
    [orders, activeTab]);

    const separationGroups = useMemo<SeparationGroup[]>(() => {
        const byUser = new Map<string, SeparationGroup>();

        for (const order of orders) {
            if (!order.user || !PICKUP_SEPARATION_STATUSES.includes(order.status)) continue;

            const current = byUser.get(order.user.id) ?? {
                userId: order.user.id,
                name: order.user.name,
                email: order.user.email,
                orders: [],
                totalCents: 0,
                itemCount: 0,
                itemsSummary: [],
            };

            current.orders.push(order);
            current.totalCents += order.totalCents;
            current.itemCount += order.items.reduce((sum, item) => sum + item.qty, 0);

            const itemsMap = new Map(current.itemsSummary.map((entry) => [entry.key, entry]));
            for (const item of order.items) {
                const label = item.product?.name ?? item.productName ?? 'Produto removido';
                const key = item.productId || label;
                const existing = itemsMap.get(key);
                if (existing) existing.qty += item.qty;
                else itemsMap.set(key, { key, label, qty: item.qty });
            }
            current.itemsSummary = Array.from(itemsMap.values()).sort((left, right) => left.label.localeCompare(right.label));
            byUser.set(order.user.id, current);
        }

        return Array.from(byUser.values())
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [orders]);

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

    const applyQuickRange = (nextFrom: string, nextTo: string) => {
        setDateFrom(nextFrom);
        setDateTo(nextTo);
        void fetchOrders(false, { dateFrom: nextFrom, dateTo: nextTo });
    };

    const applyCurrentFilter = () => {
        void fetchOrders(false);
    };

    return (
        <AdminLayout title="Pedidos" subtitle="Filtre por período e organize os pedidos pagos antes da retirada">
            <div className={styles.toolbar}>
                <div className={styles.filterBlock}>
                    <div className={styles.filterHeader}>
                        <CalendarRange size={16} />
                        <span>Período padrão</span>
                    </div>
                    <div className={styles.filterRow}>
                        <label className={styles.filterField}>
                            <span>De</span>
                            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                        </label>
                        <label className={styles.filterField}>
                            <span>Até</span>
                            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                        </label>
                        <button className={styles.applyBtn} onClick={applyCurrentFilter}>
                            Aplicar
                        </button>
                    </div>
                    <div className={styles.quickFilters}>
                        <button className={styles.quickBtn} onClick={() => applyQuickRange(today, today)}>Hoje</button>
                        <button className={styles.quickBtn} onClick={() => applyQuickRange(shiftDate(-6), today)}>7 dias</button>
                        <button className={styles.quickBtn} onClick={() => applyQuickRange(shiftDate(-29), today)}>30 dias</button>
                    </div>
                </div>

                <button
                    className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                    onClick={() => fetchOrders(true)}
                    disabled={refreshing}
                >
                    <RefreshCw size={15} /> Atualizar
                </button>
            </div>

            <section className={styles.separationSection}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h3 className={styles.sectionTitle}>Separação por cliente</h3>
                        <p className={styles.sectionDesc}>
                            Apenas clientes cadastrados com pedidos pagos e ainda não retirados.
                        </p>
                    </div>
                    <span className={styles.sectionBadge}>
                        {separationGroups.length} cliente{separationGroups.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {separationGroups.length === 0 ? (
                    <div className={styles.separationEmpty}>
                        <UserRound size={18} />
                        Nenhum pedido pago de cliente cadastrado no período atual.
                    </div>
                ) : (
                    <div className={styles.separationGrid}>
                        {separationGroups.map((group) => (
                            <article key={group.userId} className={styles.separationCard}>
                                <div className={styles.separationTop}>
                                    <div>
                                        <h4 className={styles.separationName}>{group.name}</h4>
                                        <p className={styles.separationEmail}>{group.email}</p>
                                    </div>
                                    <span className={styles.registeredBadge}>Cliente cadastrado</span>
                                </div>

                                <div className={styles.separationMeta}>
                                    <span><ShoppingBag size={14} /> {group.orders.length} pedido{group.orders.length !== 1 ? 's' : ''}</span>
                                    <span><Package size={14} /> {group.itemCount} item(ns)</span>
                                    <strong>{formatCurrency(group.totalCents)}</strong>
                                </div>

                                <div className={styles.orderChips}>
                                    {group.orders.map((order) => (
                                        <span key={order.id} className={styles.orderChip}>
                                            #{order.id.slice(-6).toUpperCase()} · {STATUS_LABEL[order.status]}
                                        </span>
                                    ))}
                                </div>

                                <div className={styles.itemsStack}>
                                    {group.itemsSummary.map((item) => (
                                        <div key={item.key} className={styles.stackRow}>
                                            <span>{item.label}</span>
                                            <strong>{item.qty}x</strong>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('ALL')}
                >
                    Todos <span className={styles.tabCount}>{orders.length}</span>
                </button>
                {ALL_STATUSES.filter((status) => counts[status]).map((status) => (
                    <button
                        key={status}
                        className={`${styles.tab} ${activeTab === status ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab(status)}
                    >
                        {STATUS_LABEL[status]} <span className={styles.tabCount}>{counts[status]}</span>
                    </button>
                ))}
            </div>

            <p className={styles.statsBar}>
                {loading
                    ? 'Carregando...'
                    : `${visible.length} pedido${visible.length !== 1 ? 's' : ''} entre ${dateFrom || '—'} e ${dateTo || '—'}`}
            </p>

            {loading ? (
                <div className={styles.loading}>Carregando pedidos...</div>
            ) : visible.length === 0 ? (
                <div className={styles.empty}>
                    <ClipboardList size={48} strokeWidth={1.2} className={styles.emptyIcon} />
                    <p className={styles.emptyText}>Nenhum pedido encontrado</p>
                </div>
            ) : (
                <div className={styles.list}>
                    {visible.map((order) => {
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
                                        {order.user && <span className={styles.clientFlag}>Cliente cadastrado</span>}
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
                                    {order.items.map((item) => {
                                        const itemName = item.product?.name ?? item.productName ?? 'Produto removido';
                                        return (
                                            <div key={item.id} className={styles.item}>
                                                {item.product?.imageUrl
                                                    ? <ProxyImage src={item.product.imageUrl} alt={itemName} className={styles.itemThumb} />
                                                    : <div className={styles.itemThumbPlaceholder}><Package size={14} /></div>
                                                }
                                                <span className={styles.itemName}>{itemName}</span>
                                                <span className={styles.itemQty}>x{item.qty}</span>
                                                <span className={styles.itemPrice}>{formatCurrency(item.subtotalCents)}</span>
                                            </div>
                                        );
                                    })}
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
                                            {actions.map((action) => (
                                                <button
                                                    key={action.status}
                                                    className={`${styles.actionBtn} ${action.cls}`}
                                                    disabled={isUpdating}
                                                    onClick={() => handleUpdateStatus(order.id, action.status)}
                                                >
                                                    {action.status === 'READY' && <CheckCheck size={13} />}
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
