import { useState, useEffect } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../services/socket';
import { CheckCircle2, Copy, ShoppingBag, ArrowLeft, Trash2, CreditCard, Clock, Wallet, QrCode, Minus, Plus, AlertCircle, ShieldCheck } from 'lucide-react';
import { GuestOrderStorage } from '../../services/GuestOrderStorage';
import styles from './CheckoutPage.module.css';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function CheckoutPage() {
    const { items, totalCents, remove, setQty, clear } = useCart();
    const api = useApi();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [paymentMethod, setPaymentMethod] = useState<'ON_PICKUP' | 'PIX' | 'CASH' | 'CARD'>('PIX');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [pixData, setPixData] = useState<{ orderId: string, pixCode: string } | null>(null);

    useEffect(() => {
        if (!pixData) return;

        const handleStatusUpdate = (data: any) => {
            if (data.orderId === pixData.orderId && data.status === 'PAID') {
                navigate(`/order/${pixData.orderId}`);
            }
        };

        socket.on('order_status_update', handleStatusUpdate);
        return () => {
            socket.off('order_status_update', handleStatusUpdate);
        };
    }, [pixData, navigate]);

    if (items.length === 0 && !pixData) {
        return (
            <div className={styles.page}>
                <div className={styles.emptyState}>
                    <ShoppingBag size={80} strokeWidth={1} color="var(--primary)" opacity={0.2} />
                    <h2>Seu pedido está vazio</h2>
                    <p>Que tal escolher algo gostoso?</p>
                    <button className={styles.backBtn} onClick={() => navigate('/menu')}>
                        Ver Cardápio
                    </button>
                </div>
            </div>
        );
    }

    async function handleSubmit() {
        setError('');
        setLoading(true);
        try {
            const payload = {
                items: items.map(i => ({ productId: i.productId, qty: i.qty })),
                paymentMethod
            };

            const order = await api.post<{ id: string, pixCode?: string }>('/orders', payload);

            if (!user) {
                await GuestOrderStorage.addOrderId(order.id);
            }

            if (paymentMethod === 'PIX' && order.pixCode) {
                setPixData({ orderId: order.id, pixCode: order.pixCode });
                clear();
            } else {
                clear();
                navigate(`/order/${order.id}`);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao processar pedido');
        } finally {
            setLoading(false);
        }
    }

    if (pixData) {
        return (
            <div className={styles.page}>
                <header className={styles.header}>
                    <h1 className={styles.title}>Pagamento Pix</h1>
                </header>

                <main className={styles.content}>
                    <div className={styles.paymentSection} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ background: 'var(--bg-main)', padding: '2rem', borderRadius: '1.5rem', border: '1px solid var(--glass-border)' }}>
                            <QrCode size={64} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                            <h2 style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '1.25rem', marginBottom: '1rem' }}>
                                Escaneie ou copie o código
                            </h2>
                            <div style={{
                                background: 'white',
                                padding: '1.5rem',
                                borderRadius: '12px',
                                wordBreak: 'break-all',
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                marginBottom: '1.5rem',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-main)',
                                fontWeight: 600
                            }}>
                                {pixData.pixCode}
                            </div>
                            <button
                                className={styles.confirmBtn}
                                style={{ width: '100%', marginTop: 0 }}
                                onClick={() => {
                                    navigator.clipboard.writeText(pixData.pixCode);
                                    // Custom toast would be better, but keeping it simple
                                }}
                            >
                                <Copy size={20} strokeWidth={2.5} />
                                Copiar Código Pix
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                            <div className={styles.statusBadge} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                color: 'var(--secondary)',
                                fontWeight: 800,
                                background: 'rgba(212, 163, 115, 0.1)',
                                padding: '1rem 1.5rem',
                                borderRadius: 'var(--radius-full)'
                            }}>
                                <Clock size={20} strokeWidth={3} className={styles.pulse} />
                                Aguardando Aprovação...
                            </div>
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', fontWeight: 600, maxWidth: '300px' }}>
                                Assim que o pagamento for confirmado, seu pedido será processado automaticamente.
                            </p>
                        </div>

                        {/* Report Paid Action */}
                        <div style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid var(--glass-border)', background: 'white', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                            <p style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 600, textAlign: 'center', margin: 0 }}>
                                Já realizou o pagamento via Pix?
                            </p>
                            <button
                                style={{
                                    padding: '1rem 1.5rem',
                                    background: '#059669',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    width: '100%',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.75rem',
                                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)'
                                }}
                                disabled={actionLoading}
                                onClick={async () => {
                                    setActionLoading(true);
                                    try {
                                        await api.post(`/orders/public/${pixData.orderId}/report-paid`, {});
                                        alert('Pagamento informado! Você será redirecionado para o seu ticket.');
                                        navigate(`/order/${pixData.orderId}`);
                                    } catch (err: any) {
                                        alert(err.message || 'Erro ao informar pagamento');
                                    } finally {
                                        setActionLoading(false);
                                    }
                                }}
                            >
                                <CheckCircle2 size={20} strokeWidth={2.5} />
                                {actionLoading ? 'Enviando...' : 'Já Paguei!'}
                            </button>
                        </div>
                    </div>
                </main >
            </div >
        );
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button className={styles.iconBtn} onClick={() => navigate('/menu')}>
                    <ArrowLeft size={22} strokeWidth={2.5} />
                </button>
                <div className={styles.titleBlock}>
                    <h1 className={styles.title}>Pedido</h1>
                    <p className={styles.subtitle}>Revise seus itens antes de finalizar.</p>
                </div>
                <div style={{ width: 44 }}></div>
            </header>

            <main className={styles.content}>
                <section>
                    <h2 className={styles.sectionTitle}>
                        <ShoppingBag size={20} strokeWidth={2.5} /> Resumo do Pedido
                    </h2>
                    <div className={styles.cartSection}>
                        <ul className={styles.itemList}>
                            {items.map(item => (
                                <li key={item.productId} className={styles.item}>
                                    <div className={styles.itemInfo}>
                                        <div className={styles.itemName}>{item.name}</div>
                                        <div className={styles.itemPrice}>{formatCurrency(item.priceCents)}</div>
                                    </div>
                                    <div className={styles.qtyControls}>
                                        <button onClick={() => setQty(item.productId, item.qty - 1)} disabled={item.qty <= 1}>
                                            <Minus size={16} strokeWidth={3} />
                                        </button>
                                        <span className={styles.qtyValue}>{item.qty}</span>
                                        <button onClick={() => setQty(item.productId, item.qty + 1)}>
                                            <Plus size={16} strokeWidth={3} />
                                        </button>
                                        <button className={styles.removeBtn} onClick={() => remove(item.productId)}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className={styles.totalRow}>
                            <span>Total</span>
                            <span className={styles.totalPrice}>{formatCurrency(totalCents)}</span>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 className={styles.sectionTitle}>
                        <CreditCard size={20} strokeWidth={2.5} /> Forma de Pagamento
                    </h2>
                    <div className={styles.paymentSection}>
                        {!user && (
                            <div className={styles.infoBox}>
                                <div className={styles.infoBoxTitle}>
                                    <ShieldCheck size={18} strokeWidth={2.5} />
                                    Sua conta e opcional
                                </div>
                                <p className={styles.infoBoxText}>
                                    Sem login voce pode pedir normalmente. Se criar uma conta, seus pedidos ficam vinculados ao seu perfil e mais faceis de acompanhar.
                                </p>
                                <div className={styles.infoBoxActions}>
                                    <button
                                        type="button"
                                        className={styles.secondaryAction}
                                        onClick={() => navigate('/register')}
                                    >
                                        Criar conta
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.ghostAction}
                                        onClick={() => navigate('/login')}
                                    >
                                        Ja tenho conta
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className={styles.paymentOptions}>
                            <div
                                className={`${styles.option} ${paymentMethod === 'PIX' ? styles.activeOption : ''}`}
                                onClick={() => setPaymentMethod('PIX')}
                            >
                                <QrCode size={24} color={paymentMethod === 'PIX' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                <span className={styles.paymentLabel}>PIX (Aprovação Instantânea)</span>
                                <input type="radio" checked={paymentMethod === 'PIX'} readOnly />
                            </div>
                            <div
                                className={`${styles.option} ${paymentMethod === 'ON_PICKUP' ? styles.activeOption : ''}`}
                                onClick={() => setPaymentMethod('ON_PICKUP')}
                            >
                                <Wallet size={24} color={paymentMethod === 'ON_PICKUP' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                <span className={styles.paymentLabel}>Pagar na Retirada (Balcão)</span>
                                <input type="radio" checked={paymentMethod === 'ON_PICKUP'} readOnly />
                            </div>
                        </div>

                        {error && (
                            <div className={styles.error}>
                                <AlertCircle size={18} /> {error}
                            </div>
                        )}

                        <button className={styles.confirmBtn} disabled={loading} onClick={handleSubmit}>
                            {loading ? 'Processando...' : (
                                <><CheckCircle2 size={24} strokeWidth={2.5} /> Finalizar Pedido</>
                            )}
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
}
