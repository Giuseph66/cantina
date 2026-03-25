import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, AlertCircle, Banknote, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import styles from './OrderConfirmedPage.module.css';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

const PAYMENT_LABELS: Record<string, string> = {
    PIX: 'Pix', ON_PICKUP: 'Pagar no balcão', CASH: 'Dinheiro', CARD: 'Cartão', INTERNAL_CREDIT: 'Notinha',
};

interface OrderTicket {
    id: string;
    codeShort: string;
    expiresAt: string;
    consumedAt: string | null;
}

interface OrderItem { productId: string; product: { name: string }; qty: number; }

interface PublicOrder {
    id: string;
    ticket: OrderTicket | null;
    status: string;
    paymentMethod: string;
    totalCents: number;
    createdAt: string;
    items: OrderItem[];
}

export default function OrderConfirmedPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const api = useApi();
    const [orderInfo, setOrderInfo] = useState<PublicOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        async function fetchTicket() {
            try {
                const data = await api.get<PublicOrder>(`/orders/public/${orderId}`);
                setOrderInfo(data);
            } catch (err) {
                console.error('Erro ao carregar ticket', err);
            } finally {
                setLoading(false);
            }
        }
        fetchTicket();
    }, [orderId]);

    const handleReportPaid = async () => {
        setActionLoading(true);
        try {
            const updated = await api.post<any>(`/orders/public/${orderId}/report-paid`, {});
            setOrderInfo(prev => prev ? { ...prev, status: updated.status, paymentMethod: updated.paymentMethod } : null);
            alert('Pagamento informado com sucesso! Aguarde a conferência no balcão.');
        } catch (err: any) {
            alert(err.message || 'Erro ao informar pagamento');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div className={styles.loading}>
            <Clock size={40} strokeWidth={1} className={styles.pulse} />
            <p>Gerando seu ticket premium...</p>
        </div>
    );

    const ticket = orderInfo?.ticket;

    if (!orderInfo || !ticket) return (
        <div className={styles.errorState}>
            <AlertCircle size={64} strokeWidth={1} color="#ef4444" />
            <h2>Pedido não encontrado</h2>
            <p>Não conseguimos localizar este pedido ou ticket no sistema.</p>
            <button className={styles.btn} style={{ width: 'auto', padding: '0.75rem 2rem' }} onClick={() => navigate('/orders')}>
                Ver Meus Pedidos
            </button>
        </div>
    );

    const isExpired = new Date(ticket.expiresAt) < new Date();
    const isConsumed = !!ticket.consumedAt;
    const isAwaitingPayment = orderInfo.status === 'CREATED';
    const isPaymentReported = orderInfo.status === 'CONFIRMED' && orderInfo.paymentMethod === 'PIX';

    let HeaderIcon = <CheckCircle2 size={42} strokeWidth={2.5} color="var(--secondary)" />;
    let headerTitle = "Pedido Confirmado";
    let statusColor = "var(--secondary)";

    if (isConsumed) {
        HeaderIcon = <CheckCircle2 size={42} strokeWidth={2.5} color="#059669" />;
        headerTitle = "Pedido Entregue";
        statusColor = "#059669";
    } else if (isExpired) {
        HeaderIcon = <AlertCircle size={42} strokeWidth={2.5} color="#94a3b8" />;
        headerTitle = "Ticket Expirado";
        statusColor = "#94a3b8";
    } else if (isAwaitingPayment) {
        HeaderIcon = <Clock size={42} strokeWidth={2.5} color="#d97706" />;
        headerTitle = "Aguardando Pagamento";
        statusColor = "#d97706";
    } else if (isPaymentReported) {
        HeaderIcon = <CheckCircle2 size={42} strokeWidth={2.5} color="#0284c7" />;
        headerTitle = "Pagamento Informado";
        statusColor = "#0284c7";
    }

    return (
        <div className={styles.page}>
            <header className={styles.topNav}>
                <button className={styles.backBtn} onClick={() => navigate('/orders')}>
                    <ArrowLeft size={20} strokeWidth={2.5} />
                    Voltar
                </button>
            </header>

            <div className={styles.dashboardContainer}>

                {/* Left Column: Details */}
                <div className={styles.detailsColumn}>
                    <div className={styles.headerBlock}>
                        {HeaderIcon}
                        <h2 style={{ color: statusColor }}>{headerTitle}</h2>
                        {isAwaitingPayment && (
                            <p className={styles.headerSubtitle}>
                                Conclua o pagamento para liberar seu pedido no balcão.
                            </p>
                        )}
                        {isPaymentReported && (
                            <p className={styles.headerSubtitle}>
                                Aguarde a conferência do pagamento no balcão de retirada.
                            </p>
                        )}
                    </div>

                    <div className={styles.receiptCard}>
                        <h3 className={styles.receiptTitle}>Detalhes do Pedido</h3>

                        <div className={styles.receiptTop}>
                            <div>
                                <p className={styles.receiptLabel}>Realizado em</p>
                                <p className={styles.receiptValue}>{format(new Date(orderInfo.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}</p>
                            </div>
                            {orderInfo.paymentMethod && (
                                <div style={{ textAlign: 'right' }}>
                                    <p className={styles.receiptLabel}>Pagamento</p>
                                    <span className={styles.paymentChip}>
                                        <Banknote size={14} />
                                        {PAYMENT_LABELS[orderInfo.paymentMethod] ?? orderInfo.paymentMethod}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={styles.itemsList}>
                            {orderInfo.items.map(item => (
                                <div key={item.productId} className={styles.itemRow}>
                                    <span className={styles.itemQty}>{item.qty}x</span>
                                    <span className={styles.itemName}>{item.product.name}</span>
                                </div>
                            ))}
                        </div>

                        <div className={styles.receiptTotal}>
                            <span>Total</span>
                            <span className={styles.totalValue}>{formatCurrency(orderInfo.totalCents)}</span>
                        </div>
                    </div>
                </div>

                {/* Right Column: QR Code */}
                <div className={styles.ticketColumn}>
                    <div className={styles.card}>
                        <div className={styles.qrContainer}>
                            <div className={`${styles.qrWrapper} ${(isConsumed || isExpired || isAwaitingPayment) ? styles.disabledQr : ''}`}>
                                <QRCodeSVG
                                    value={ticket.codeShort}
                                    size={220}
                                    level="H"
                                    includeMargin={false}
                                    fgColor="var(--primary)"
                                />
                            </div>
                            {(isConsumed || isExpired || isAwaitingPayment) && (
                                <div className={styles.qrOverlay} style={{ color: statusColor, borderColor: `${statusColor}40` }}>
                                    {isAwaitingPayment ? 'Bloqueado' : isExpired ? 'Expirado' : 'Consumido'}
                                </div>
                            )}
                            <p className={styles.qrHelper}>Apresente este QR no balcão</p>
                        </div>

                        <div className={styles.codeDiv}>
                            <p className={styles.codeHelper}>Código de Retirada</p>
                            <div className={styles.shortCode}>{ticket.codeShort}</div>
                        </div>

                        <div className={styles.infoDiv}>
                            <div className={styles.infoRow}>
                                <Clock size={16} strokeWidth={2.5} />
                                <span>
                                    Válido até: {format(new Date(ticket.expiresAt), "HH:mm 'de' dd/MM", { locale: ptBR })}
                                </span>
                            </div>
                        </div>

                        {isAwaitingPayment && (
                            <button
                                className={styles.btn}
                                style={{ backgroundColor: '#059669', marginBottom: '1rem' }}
                                onClick={handleReportPaid}
                                disabled={actionLoading}
                            >
                                <CheckCircle2 size={20} strokeWidth={2.5} />
                                Já Paguei!
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
