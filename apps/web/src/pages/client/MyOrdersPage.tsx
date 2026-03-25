import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    QrCode, Clock, CheckCircle2, AlertCircle, ArrowLeft,
    ShoppingBag, XCircle, ChefHat, Hourglass, Banknote, PackageCheck,
} from 'lucide-react';
import { GuestOrderStorage } from '../../services/GuestOrderStorage';
import styles from './MyOrdersPage.module.css';

interface OrderItem { productId: string; product: { name: string }; qty: number; subtotalCents: number; }
interface Order {
    id: string; totalCents: number; status: string; paymentMethod: string;
    createdAt: string; items: OrderItem[];
    ticket: { codeShort: string; expiresAt: string; consumedAt: string | null } | null;
}

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    if (isToday(d)) return `Hoje, ${format(d, 'HH:mm')}`;
    if (isYesterday(d)) return `Ontem, ${format(d, 'HH:mm')}`;
    return format(d, "dd 'de' MMM, HH:mm", { locale: ptBR });
}

type StatusConfig = { label: string; sublabel: string; color: string; bg: string; icon: any; isActive: boolean };

const STATUS_MAP: Record<string, StatusConfig> = {
    CREATED: { label: 'Aguardando pagamento', sublabel: 'Conclua o pagamento para confirmar seu pedido', color: '#b45309', bg: '#fef3c7', icon: Hourglass, isActive: true },
    CONFIRMED: { label: 'Aguardando retirada', sublabel: 'Seu pedido foi confirmado. Retire no balcão', color: '#0369a1', bg: '#e0f2fe', icon: Clock, isActive: true },
    PAID: { label: 'Pronto para retirada', sublabel: 'Apresente o QR Code no balcão para retirar', color: '#059669', bg: '#d1fae5', icon: QrCode, isActive: true },
    IN_PREP: { label: 'Em preparo', sublabel: 'A cozinha está preparando seu pedido', color: '#7c3aed', bg: '#ede9fe', icon: ChefHat, isActive: true },
    READY: { label: 'Pronto! Retire agora', sublabel: 'Seu pedido está pronto no balcão', color: '#059669', bg: '#d1fae5', icon: PackageCheck, isActive: true },
    PICKED_UP: { label: 'Entregue', sublabel: 'Pedido retirado com sucesso', color: '#64748b', bg: '#f1f5f9', icon: CheckCircle2, isActive: false },
    EXPIRED: { label: 'Expirado', sublabel: 'O prazo de retirada deste pedido expirou', color: '#94a3b8', bg: '#f8fafc', icon: AlertCircle, isActive: false },
    CANCELLED: { label: 'Cancelado', sublabel: 'Este pedido foi cancelado', color: '#e11d48', bg: '#fff1f2', icon: XCircle, isActive: false },
};

const PAYMENT_LABELS: Record<string, string> = {
    PIX: 'Pix', ON_PICKUP: 'Pagar no balcão', CASH: 'Dinheiro', CARD: 'Cartão', INTERNAL_CREDIT: 'Notinha',
};

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
    const s = STATUS_MAP[order.status] ?? {
        label: order.status, sublabel: '', color: 'var(--text-dim)', bg: 'var(--bg-main)', icon: Clock, isActive: false,
    };
    const Icon = s.icon;
    const showQrBtn = ['CONFIRMED', 'PAID', 'READY'].includes(order.status) && order.ticket;

    return (
        <div
            className={`${styles.card} ${s.isActive ? styles.cardActive : ''}`}
            style={s.isActive ? { '--accent': s.color, '--accent-bg': s.bg } as any : undefined}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onClick()}
        >
            {/* Status accent bar */}
            {s.isActive && <div className={styles.accentBar} style={{ background: s.color }} />}

            <div className={styles.cardInner}>
                {/* Top row */}
                <div className={styles.cardTop}>
                    <span className={styles.cardDate}>{formatDate(order.createdAt)}</span>
                    <span className={styles.cardTotal}>{formatCurrency(order.totalCents)}</span>
                </div>

                {/* Items */}
                <div className={styles.itemsBlock}>
                    {order.items.map(i => (
                        <div key={i.productId} className={styles.itemRow}>
                            <span className={styles.qty}>{i.qty}×</span>
                            <span className={styles.itemName}>{i.product.name}</span>
                        </div>
                    ))}
                </div>

                {/* Status row */}
                <div className={styles.statusRow}>
                    <div className={styles.statusBadge} style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}>
                        <Icon size={14} strokeWidth={2.5} />
                        <span>{s.label}</span>
                    </div>

                    {order.paymentMethod && (
                        <span className={styles.paymentChip}>
                            <Banknote size={12} />
                            {PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
                        </span>
                    )}
                </div>

                {/* Sub-label for active orders */}
                {s.isActive && (
                    <p className={styles.statusSublabel} style={{ color: s.color }}>{s.sublabel}</p>
                )}

                {/* QR CTA */}
                {showQrBtn && (
                    <div className={styles.qrCta} style={{ background: `${s.color}12`, borderColor: `${s.color}30`, color: s.color }}>
                        <QrCode size={16} />
                        <span>Toque para ver o QR Code de retirada</span>
                    </div>
                )}

                {/* Ticket code if active */}
                {order.ticket && s.isActive && (
                    <div className={styles.ticketCode}>
                        <span className={styles.ticketCodeLabel}>Ticket</span>
                        <span className={styles.ticketCodeValue}>#{order.ticket.codeShort}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MyOrdersPage() {
    const api = useApi();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadOrders() {
            try {
                if (user) {
                    const data = await api.get<Order[]>('/orders/my');
                    setOrders(data);
                    return;
                }
                const orderIds = await GuestOrderStorage.getOrderIds();
                if (orderIds.length === 0) { setOrders([]); return; }
                const guestOrders = await Promise.all(
                    orderIds.map(id => api.get<Order>(`/orders/public/${id}`).catch(() => null)),
                );
                setOrders(guestOrders.filter((o): o is Order => o !== null));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadOrders();
    }, [user]);

    const activeOrders = orders.filter(o => STATUS_MAP[o.status]?.isActive);
    const historyOrders = orders.filter(o => !STATUS_MAP[o.status]?.isActive);

    if (loading) return (
        <div className={styles.page}>
            <div className={styles.loading}>
                <div className={styles.spinner} />
                Carregando seus pedidos...
            </div>
        </div>
    );

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button className={styles.iconBtn} onClick={() => navigate('/menu')}>
                    <ArrowLeft size={20} strokeWidth={2.5} />
                </button>
                <div className={styles.titleBlock}>
                    <h1 className={styles.title}>Meus Pedidos</h1>
                    <p className={styles.subtitle}>Acompanhe seus pedidos em tempo real</p>
                </div>
                <div style={{ width: 40 }} />
            </header>

            {orders.length === 0 ? (
                <div className={styles.emptyState}>
                    <ShoppingBag size={72} strokeWidth={1} color="var(--primary)" opacity={0.18} />
                    <h2>Nenhum pedido ainda</h2>
                    <p>{user ? 'Sua fome ainda não deixou rastros por aqui!' : 'Você pode pedir sem login. Crie uma conta para manter tudo salvo.'}</p>
                    <div className={styles.emptyActions}>
                        <button className={styles.primaryBtn} onClick={() => navigate('/menu')}>
                            Ver cardápio
                        </button>
                        {!user && (
                            <button className={styles.secondaryBtn} onClick={() => navigate('/register')}>
                                Criar conta
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className={styles.feed}>
                    {!user && (
                        <div className={styles.guestBanner}>
                            Pedidos encontrados neste dispositivo. Crie uma conta para manter tudo salvo no seu perfil.
                        </div>
                    )}

                    {/* Ativos */}
                    {activeOrders.length > 0 && (
                        <section>
                            <h2 className={styles.sectionTitle}>
                                <span className={styles.liveDot} />
                                Em andamento · {activeOrders.length}
                            </h2>
                            <div className={styles.list}>
                                {activeOrders.map(o => (
                                    <OrderCard key={o.id} order={o} onClick={() => navigate(`/order/${o.id}`)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Histórico */}
                    {historyOrders.length > 0 && (
                        <section>
                            <h2 className={styles.sectionTitle}>Histórico</h2>
                            <div className={styles.list}>
                                {historyOrders.map(o => (
                                    <OrderCard key={o.id} order={o} onClick={() => navigate(`/order/${o.id}`)} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
