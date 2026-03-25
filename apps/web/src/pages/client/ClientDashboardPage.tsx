import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    ShoppingBag, Clock, CheckCircle2, AlertCircle, XCircle,
    QrCode, Utensils, TrendingUp, Receipt, Wallet, LogOut,
} from 'lucide-react';
import styles from './ClientDashboardPage.module.css';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
    CREATED: { label: 'Aguardando pagamento', color: '#d97706', icon: Clock },
    CONFIRMED: { label: 'Aguardando retirada', color: '#d97706', icon: Clock },
    PAID: { label: 'Pago — Retire no balcão', color: '#059669', icon: QrCode },
    IN_PREP: { label: 'Em preparo', color: '#7c3aed', icon: Clock },
    READY: { label: 'Pronto para retirada', color: '#059669', icon: CheckCircle2 },
    PICKED_UP: { label: 'Entregue', color: '#0284c7', icon: CheckCircle2 },
    EXPIRED: { label: 'Expirado', color: '#94a3b8', icon: AlertCircle },
    CANCELLED: { label: 'Cancelado', color: '#e11d48', icon: XCircle },
};

interface OrderItem { productId: string; product: { name: string }; qty: number; }
interface Order {
    id: string; totalCents: number; status: string; paymentMethod: string;
    createdAt: string; items: OrderItem[];
    ticket: { codeShort: string; expiresAt: string; consumedAt: string | null } | null;
}
interface Summary {
    totalOrders: number;
    totalSpentCents: number;
    pendingPickupCount: number;
    creditDebtCents: number;
}

type Tab = 'historico' | 'pendencias';

export default function ClientDashboardPage() {
    const api = useApi();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [tab, setTab] = useState<Tab>('historico');
    const [orders, setOrders] = useState<Order[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }

        Promise.all([
            api.get<Order[]>('/orders/my'),
            api.get<Summary>('/orders/my/summary'),
        ])
            .then(([ords, sum]) => { setOrders(ords); setSummary(sum); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    const initial = user?.name?.charAt(0).toUpperCase() ?? '?';
    const firstName = user?.name?.split(' ')[0] ?? 'Cliente';

    const activeOrders = orders.filter(o => ['CREATED', 'CONFIRMED', 'PAID', 'IN_PREP', 'READY'].includes(o.status));

    async function handleLogout() {
        await logout();
        navigate('/');
    }

    return (
        <div className={styles.page}>
            {/* ── Header ── */}
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <button className={styles.logoBtn} onClick={() => navigate('/menu')}>
                        <Utensils size={20} />
                        <span>Cantina</span>
                    </button>
                    <div className={styles.headerActions}>
                        <button className={styles.menuBtn} onClick={() => navigate('/menu')}>
                            Ver cardápio
                        </button>
                        <button className={styles.logoutBtn} onClick={handleLogout} title="Sair">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </header>

            <main className={styles.main}>
                <div className={styles.dashboardSidebar}>
                    {/* ── Hero / greeting ── */}
                    <section className={styles.hero}>
                        <div className={styles.avatar}>{initial}</div>
                        <div>
                            <p className={styles.eyebrow}>Olá,</p>
                            <h1 className={styles.greeting}>{firstName}</h1>
                            <p className={styles.email}>{user?.email}</p>
                        </div>
                    </section>

                    {/* ── Stats cards ── */}
                    {loading ? (
                        <div className={styles.statsLoading}>Carregando dados...</div>
                    ) : (
                        <div className={styles.statsGrid}>
                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconGreen}`}>
                                    <TrendingUp size={18} />
                                </div>
                                <span className={styles.statValue}>{formatCurrency(summary?.totalSpentCents ?? 0)}</span>
                                <span className={styles.statLabel}>Total gasto</span>
                            </div>

                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconAmber}`}>
                                    <Clock size={18} />
                                </div>
                                <span className={styles.statValue}>{summary?.pendingPickupCount ?? 0}</span>
                                <span className={styles.statLabel}>A retirar</span>
                            </div>

                            <div className={styles.statCard}>
                                <div className={`${styles.statIcon} ${styles.statIconBlue}`}>
                                    <Receipt size={18} />
                                </div>
                                <span className={styles.statValue}>{summary?.totalOrders ?? 0}</span>
                                <span className={styles.statLabel}>Pedidos</span>
                            </div>

                            <div className={`${styles.statCard} ${(summary?.creditDebtCents ?? 0) > 0 ? styles.statCardDebt : ''}`}>
                                <div className={`${styles.statIcon} ${(summary?.creditDebtCents ?? 0) > 0 ? styles.statIconRed : styles.statIconPrimary}`}>
                                    <Wallet size={18} />
                                </div>
                                <span className={styles.statValue}>{formatCurrency(summary?.creditDebtCents ?? 0)}</span>
                                <span className={styles.statLabel}>Na notinha</span>
                            </div>
                        </div>
                    )}

                    {/* ── Active orders alert ── */}
                    {!loading && activeOrders.length > 0 && (
                        <div className={styles.activeAlert}>
                            <QrCode size={18} />
                            <span>
                                Você tem <strong>{activeOrders.length} pedido{activeOrders.length > 1 ? 's' : ''}</strong> ativo{activeOrders.length > 1 ? 's' : ''} aguardando retirada.
                            </span>
                            <button className={styles.activeAlertBtn} onClick={() => setTab('historico')}>
                                Ver
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.dashboardContent}>
                    {/* ── Tabs ── */}
                    <div className={styles.tabs}>
                        <button
                            className={`${styles.tabBtn} ${tab === 'historico' ? styles.tabBtnActive : ''}`}
                            onClick={() => setTab('historico')}
                        >
                            <ShoppingBag size={15} />
                            Histórico de Pedidos
                        </button>
                        <button
                            className={`${styles.tabBtn} ${tab === 'pendencias' ? styles.tabBtnActive : ''}`}
                            onClick={() => setTab('pendencias')}
                        >
                            <Wallet size={15} />
                            Notinha / Pendências
                            {(summary?.creditDebtCents ?? 0) > 0 && (
                                <span className={styles.debtBadge}>{formatCurrency(summary!.creditDebtCents)}</span>
                            )}
                        </button>
                    </div>

                    {/* ── Tab: Histórico ── */}
                    {tab === 'historico' && (
                        <div className={styles.section}>
                            {loading ? (
                                <div className={styles.listLoading}>Carregando pedidos...</div>
                            ) : orders.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <ShoppingBag size={60} strokeWidth={1} color="var(--primary)" opacity={0.2} />
                                    <h3>Nenhum pedido ainda</h3>
                                    <p>Sua fome ainda não deixou rastros por aqui!</p>
                                    <button className={styles.ctaBtn} onClick={() => navigate('/menu')}>
                                        Fazer meu primeiro pedido
                                    </button>
                                </div>
                            ) : (
                                <ul className={styles.orderList}>
                                    {orders.map(order => {
                                        const s = STATUS_MAP[order.status] ?? { label: order.status, color: 'var(--text-dim)', icon: Clock };
                                        const Icon = s.icon;
                                        return (
                                            <li key={order.id}>
                                                <button className={styles.orderCard} onClick={() => navigate(`/order/${order.id}`)}>
                                                    <div className={styles.orderTop}>
                                                        <span className={styles.orderDate}>
                                                            {format(new Date(order.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                                        </span>
                                                        <span className={styles.orderTotal}>{formatCurrency(order.totalCents)}</span>
                                                    </div>
                                                    <div className={styles.orderItems}>
                                                        {order.items.map(item => (
                                                            <span key={item.productId} className={styles.orderItem}>
                                                                <span className={styles.orderQty}>{item.qty}×</span>
                                                                {item.product.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <div className={styles.orderBottom}>
                                                        <span className={styles.statusBadge} style={{
                                                            background: `${s.color}18`,
                                                            color: s.color,
                                                            border: `1px solid ${s.color}30`,
                                                        }}>
                                                            <Icon size={13} strokeWidth={2.5} /> {s.label}
                                                        </span>
                                                        {['CONFIRMED', 'PAID'].includes(order.status) && order.ticket && (
                                                            <span className={styles.qrHint}>
                                                                <QrCode size={14} /> Ver ticket
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Pendências ── */}
                    {tab === 'pendencias' && (
                        <div className={styles.section}>
                            {(summary?.creditDebtCents ?? 0) === 0 ? (
                                <div className={styles.emptyState}>
                                    <Wallet size={60} strokeWidth={1} color="var(--primary)" opacity={0.2} />
                                    <h3>Tudo em dia!</h3>
                                    <p>Você não tem nenhuma pendência com a cantina no momento.</p>
                                </div>
                            ) : (
                                <>
                                    <div className={styles.debtAlert}>
                                        <div className={styles.debtAlertTop}>
                                            <Wallet size={20} />
                                            <span>Saldo devedor na notinha</span>
                                            <strong className={styles.debtTotal}>{formatCurrency(summary!.creditDebtCents)}</strong>
                                        </div>
                                        <p className={styles.debtAlertDesc}>
                                            Estes pedidos foram realizados com pagamento no balcão e ainda estão aguardando quitação.
                                            Dirija-se ao caixa para regularizar.
                                        </p>
                                    </div>

                                    <ul className={styles.orderList}>
                                        {orders
                                            .filter(o => o.paymentMethod === 'ON_PICKUP' && o.status === 'CONFIRMED')
                                            .map(order => (
                                                <li key={order.id}>
                                                    <button className={`${styles.orderCard} ${styles.orderCardDebt}`} onClick={() => navigate(`/order/${order.id}`)}>
                                                        <div className={styles.orderTop}>
                                                            <span className={styles.orderDate}>
                                                                {format(new Date(order.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                                            </span>
                                                            <span className={styles.debtAmount}>{formatCurrency(order.totalCents)}</span>
                                                        </div>
                                                        <div className={styles.orderItems}>
                                                            {order.items.map(item => (
                                                                <span key={item.productId} className={styles.orderItem}>
                                                                    <span className={styles.orderQty}>{item.qty}×</span>
                                                                    {item.product.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </button>
                                                </li>
                                            ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
