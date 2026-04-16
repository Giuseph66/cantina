import { useEffect, useMemo, useRef, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    AlertCircle,
    CheckCircle2,
    Copy,
    CreditCard,
    Loader2,
    Minus,
    Plus,
    QrCode,
    ShieldCheck,
    ShoppingBag,
    Trash2,
    Wallet,
} from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { socket } from '../../services/socket';
import styles from './CheckoutPage.module.css';

type CheckoutMethod = 'ONLINE' | 'ON_PICKUP';
type OnlineMethod = 'PIX' | 'CARD';

type PaymentConfig = {
    allowOnPickupPayment: boolean;
    onlineEnabled: boolean;
    pixEnabled: boolean;
    cardEnabled: boolean;
    mercadoPagoPublicKey: string | null;
};

type PaymentResponse = {
    id: string;
    provider: string;
    paymentMethod: string;
    status: string;
    externalId: string | null;
    expiresAt: string | null;
    paidAt: string | null;
    lastError: string | null;
    qrCode: string | null;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
    brand: string | null;
    lastFourDigits: string | null;
    statusDetail: string | null;
    receiptUrl: string | null;
};

type SavedCard = {
    id: string;
    lastFourDigits: string | null;
    brand: string | null;
    paymentMethodId: string | null;
    issuerId: string | null;
    expirationMonth: number | null;
    expirationYear: number | null;
    thumbnail: string | null;
};

type CheckoutOrder = {
    id: string;
    totalCents: number;
    status: string;
    paymentMethod: string;
    latestPayment: PaymentResponse | null;
};

type ReconciledOrderPayment = {
    orderId: string;
    orderStatus: string;
    paymentMethod: string;
    totalCents: number;
    latestPayment: PaymentResponse | null;
};

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function normalizeTaxId(value: string) {
    return value.replace(/\D/g, '');
}

function normalizePhone(value: string) {
    return value.replace(/\D/g, '');
}

function formatTaxId(value: string) {
    const digits = normalizeTaxId(value);
    if (digits.length <= 11) {
        return digits
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }

    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function getDocumentType(value: string) {
    return normalizeTaxId(value).length > 11 ? 'CNPJ' : 'CPF';
}

function normalizeQrCodeImageSrc(value: string | null) {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.startsWith('data:image')) {
        return normalized;
    }
    return `data:image/png;base64,${normalized}`;
}

export default function CheckoutPage() {
    const { items, totalCents, remove, setQty, clear } = useCart();
    const api = useApi();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, updateProfile } = useAuth();
    const resumeOrderId = searchParams.get('orderId');
    const isResumingOrder = !!resumeOrderId;

    const [config, setConfig] = useState<PaymentConfig>({
        allowOnPickupPayment: true,
        onlineEnabled: true,
        pixEnabled: true,
        cardEnabled: false,
        mercadoPagoPublicKey: null,
    });
    const [checkoutMethod, setCheckoutMethod] = useState<CheckoutMethod>('ONLINE');
    const [onlineMethod, setOnlineMethod] = useState<OnlineMethod>('PIX');
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [loadingExistingOrder, setLoadingExistingOrder] = useState(false);
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [error, setError] = useState('');
    const [onlineOrder, setOnlineOrder] = useState<CheckoutOrder | null>(null);
    const [latestPayment, setLatestPayment] = useState<PaymentResponse | null>(null);
    const [payerName, setPayerName] = useState(user?.name ?? '');
    const [payerEmail, setPayerEmail] = useState(user?.email ?? '');
    const [payerDocument, setPayerDocument] = useState(user?.cpf ?? '');
    const [payerPhone, setPayerPhone] = useState(user?.phone ?? '');
    const [cardReady, setCardReady] = useState(false);
    const [cardFormError, setCardFormError] = useState('');
    const [saveCard, setSaveCard] = useState(true);
    const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
    const [savedCardsResolved, setSavedCardsResolved] = useState(false);
    const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null);

    const cardFormRef = useRef<any>(null);
    const cardSubmitRef = useRef<(() => Promise<void>) | null>(null);
    const mercadoPagoRef = useRef<any>(null);
    const savedCardSecurityFieldRef = useRef<any>(null);
    const onlineMethodRef = useRef<OnlineMethod>('PIX');
    const saveCardRef = useRef(true);

    const paymentSummary = latestPayment ?? onlineOrder?.latestPayment ?? null;
    const activePaymentSummary = paymentSummary && (paymentSummary.paymentMethod === onlineMethod || paymentSummary.status === 'APPROVED')
        ? paymentSummary
        : null;
    const selectedSavedCard = useMemo(
        () => savedCards.find(card => card.id === selectedSavedCardId) ?? null,
        [savedCards, selectedSavedCardId],
    );
    const documentType = useMemo(() => getDocumentType(payerDocument), [payerDocument]);
    const checkoutUnavailable =
        (checkoutMethod === 'ONLINE' && !config.onlineEnabled)
        || (checkoutMethod === 'ON_PICKUP' && !config.allowOnPickupPayment);
    const canCreateOrder = !isResumingOrder && items.length > 0 && !creatingOrder && !loadingConfig && !checkoutUnavailable;
    const canGeneratePix = !!onlineOrder && config.pixEnabled && !processingPayment;
    const canPayCard = !!onlineOrder && config.cardEnabled && cardReady && !processingPayment;

    function syncOnlineMethod(payment: PaymentResponse | null, preserveSelection = false) {
        if (preserveSelection && payment?.status !== 'APPROVED') {
            if (onlineMethodRef.current === 'CARD' && config.cardEnabled) {
                setOnlineMethod('CARD');
                return;
            }

            if (onlineMethodRef.current === 'PIX' && config.pixEnabled) {
                setOnlineMethod('PIX');
                return;
            }
        }

        if (payment?.paymentMethod === 'CARD' && config.cardEnabled) {
            setOnlineMethod('CARD');
            return;
        }

        if (config.pixEnabled) {
            setOnlineMethod('PIX');
            return;
        }

        if (config.cardEnabled) {
            setOnlineMethod('CARD');
        }
    }

    function applyExistingOrder(order: CheckoutOrder | ReconciledOrderPayment, preserveSelection = false) {
        const nextOrder = {
            id: 'orderId' in order ? order.orderId : order.id,
            totalCents: order.totalCents,
            status: 'orderStatus' in order ? order.orderStatus : order.status,
            paymentMethod: order.paymentMethod,
            latestPayment: order.latestPayment,
        };

        setOnlineOrder(nextOrder);
        setLatestPayment(order.latestPayment);
        syncOnlineMethod(order.latestPayment, preserveSelection);
    }

    async function reconcileOnlineOrder(orderId: string) {
        const data = await api.get<ReconciledOrderPayment>(`/payments/orders/${orderId}/reconcile`);
        applyExistingOrder(data, true);

        if (data.orderStatus !== 'CREATED' || data.latestPayment?.status === 'APPROVED') {
            navigate(`/order/${orderId}`, { replace: true });
        }

        return data;
    }

    useEffect(() => {
        onlineMethodRef.current = onlineMethod;
    }, [onlineMethod]);

    useEffect(() => {
        saveCardRef.current = saveCard;
    }, [saveCard]);

    useEffect(() => {
        api.get<PaymentConfig>('/payments/public-config')
            .then((response) => {
                setConfig(response);
                if (!response.onlineEnabled && response.allowOnPickupPayment) {
                    setCheckoutMethod('ON_PICKUP');
                }
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoadingConfig(false));
    }, []);

    useEffect(() => {
        if (!resumeOrderId) return;

        let cancelled = false;
        setLoadingExistingOrder(true);
        setError('');

        api.get<CheckoutOrder>(`/orders/${resumeOrderId}`)
            .then((order) => {
                if (cancelled) return;

                const isPayableOnline = ['ONLINE', 'PIX', 'CARD'].includes(order.paymentMethod);
                if (order.status !== 'CREATED' || !isPayableOnline) {
                    navigate(`/order/${resumeOrderId}`, { replace: true });
                    return;
                }

                applyExistingOrder(order);
            })
            .catch((err) => {
                if (!cancelled) {
                    setOnlineOrder(null);
                    setLatestPayment(null);
                    setError(err.message || 'Nao foi possivel recuperar o pagamento deste pedido.');
                    navigate('/pedido', { replace: true });
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingExistingOrder(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [resumeOrderId]);

    useEffect(() => {
        setPayerName(user?.name ?? '');
        setPayerEmail(user?.email ?? '');
        setPayerDocument(user?.cpf ?? '');
        setPayerPhone(user?.phone ?? '');
    }, [user?.name, user?.email, user?.cpf, user?.phone]);

    useEffect(() => {
        if (!onlineOrder || onlineMethod !== 'CARD') return;

        setSavedCardsResolved(false);
        const loadSavedCards = async () => {
            try {
                const cards = await api.get<SavedCard[]>('/payments/saved-cards');
                setSavedCards(cards);
                if (cards.length > 0) {
                    setSelectedSavedCardId(cards[0].id);
                } else {
                    setSelectedSavedCardId(null);
                }
            } catch (err) {
                console.error('[Checkout] Erro ao carregar cartoes salvos', err);
            } finally {
                setSavedCardsResolved(true);
            }
        };

        void loadSavedCards();
    }, [onlineOrder?.id, onlineMethod]);

    useEffect(() => {
        if (!onlineOrder) return;
        syncOnlineMethod(latestPayment ?? onlineOrder.latestPayment);
    }, [config.pixEnabled, config.cardEnabled, onlineOrder?.id]);

    useEffect(() => {
        if (!onlineOrder || onlineOrder.status !== 'CREATED') return;

        let cancelled = false;
        let intervalId = 0;
        const runReconcile = async () => {
            if (cancelled) return;

            try {
                const data = await api.get<ReconciledOrderPayment>(`/payments/orders/${onlineOrder.id}/reconcile`);
                if (cancelled) return;

                applyExistingOrder(data, true);
                if (data.orderStatus !== 'CREATED' || data.latestPayment?.status === 'APPROVED') {
                    navigate(`/order/${onlineOrder.id}`, { replace: true });
                }
            } catch (err) {
                if (cancelled) return;

                const message = err instanceof Error ? err.message : '';
                if (message.toLowerCase().includes('payment not found')) {
                    setLatestPayment(null);
                    setError('O pagamento pendente anterior não foi encontrado no gateway. Gere um novo pagamento para continuar.');
                    cancelled = true;
                    if (intervalId) {
                        window.clearInterval(intervalId);
                    }
                    return;
                }

                console.error('[Checkout] Falha ao reconciliar pagamento', err);
            }
        };

        void runReconcile();
        intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void runReconcile();
            }
        }, 8000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [onlineOrder?.id, onlineOrder?.status]);

    const profileNeedsCompletion = !user?.isProfileComplete;

    async function ensureProfileReady() {
        const normalizedCpf = normalizeTaxId(payerDocument);
        const normalizedPhone = normalizePhone(payerPhone);

        if (normalizedCpf.length !== 11) {
            throw new Error('Informe um CPF válido com 11 dígitos para continuar.');
        }

        if (normalizedPhone.length < 10) {
            throw new Error('Informe um celular válido com DDD para continuar.');
        }

        if (user?.cpf === normalizedCpf && user?.phone === normalizedPhone && user.isProfileComplete) {
            return;
        }

        setSavingProfile(true);
        try {
            const updatedUser = await updateProfile(normalizedCpf, normalizedPhone);
            setPayerDocument(updatedUser.cpf ?? normalizedCpf);
            setPayerPhone(updatedUser.phone ?? normalizedPhone);
        } finally {
            setSavingProfile(false);
        }
    }

    useEffect(() => {
        if (!onlineOrder?.id) return;

        const handleStatusUpdate = (data: any) => {
            if (data.orderId === onlineOrder.id && data.status === 'PAID') {
                navigate(`/order/${onlineOrder.id}`);
            }
        };

        socket.on('order_status_update', handleStatusUpdate);
        return () => {
            socket.off('order_status_update', handleStatusUpdate);
        };
    }, [onlineOrder?.id, navigate]);

    useEffect(() => {
        cardSubmitRef.current = null;

        if (!onlineOrder?.id || onlineMethod !== 'CARD' || !config.cardEnabled || !config.mercadoPagoPublicKey) {
            setCardReady(false);
            setCardFormError('');
            if (savedCardSecurityFieldRef.current) {
                try { savedCardSecurityFieldRef.current.unmount(); } catch { }
                savedCardSecurityFieldRef.current = null;
            }
            if (cardFormRef.current) {
                try { cardFormRef.current.unmount(); } catch { }
                cardFormRef.current = null;
            }
            return;
        }

        if (!savedCardsResolved) {
            setCardReady(false);
            setCardFormError('');
            return;
        }

        let cancelled = false;
        const currentOrderId = onlineOrder.id;
        const currentOrderTotalCents = onlineOrder.totalCents;

        async function setupCardForm() {
            setCardReady(false);
            setCardFormError('');

            try {
                await loadMercadoPago();
                const sdkWindow = window as Window & { MercadoPago?: any };
                if (!sdkWindow.MercadoPago) {
                    throw new Error('SDK do Mercado Pago não carregou corretamente.');
                }

                if (savedCardSecurityFieldRef.current) {
                    try { savedCardSecurityFieldRef.current.unmount(); } catch { }
                    savedCardSecurityFieldRef.current = null;
                }
                if (cardFormRef.current) {
                    try { cardFormRef.current.unmount(); } catch { }
                    cardFormRef.current = null;
                }

                const mp = new sdkWindow.MercadoPago(config.mercadoPagoPublicKey, { locale: 'pt-BR' });
                mercadoPagoRef.current = mp;

                if (selectedSavedCardId) {
                    const securityField = mp.fields.create('securityCode', {
                        placeholder: 'CVV',
                    });
                    securityField.mount('form-checkout__savedSecurityCode');
                    savedCardSecurityFieldRef.current = securityField;
                    setCardReady(true);

                    cardSubmitRef.current = async () => {
                        setProcessingPayment(true);
                        setError('');

                        try {
                            const token = await mp.fields.createCardToken({
                                cardId: selectedSavedCardId,
                            });

                            if (!token?.id) {
                                throw new Error('Token do cartao salvo nao foi gerado. Revise o CVV e tente novamente.');
                            }

                            const response = await api.post<PaymentResponse>(`/payments/orders/${currentOrderId}/card`, {
                                cardId: selectedSavedCardId,
                                cardToken: token.id,
                                paymentMethodId: selectedSavedCard?.paymentMethodId ?? undefined,
                                issuerId: selectedSavedCard?.issuerId ?? undefined,
                            });

                            setLatestPayment(response);
                            if (response.status === 'APPROVED') {
                                navigate(`/order/${currentOrderId}`);
                                return;
                            }

                            if (response.lastError) {
                                setError(response.lastError);
                            }
                        } finally {
                            setProcessingPayment(false);
                        }
                    };

                    return;
                }

                const form = mp.cardForm({
                    amount: String((currentOrderTotalCents / 100).toFixed(2)),
                    iframe: true,
                    form: {
                        id: 'card-payment-form',
                        cardNumber: { id: 'form-checkout__cardNumber', placeholder: '0000 0000 0000 0000' },
                        expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/AA' },
                        securityCode: { id: 'form-checkout__securityCode', placeholder: 'CVV' },
                        cardholderName: { id: 'form-checkout__cardholderName', placeholder: 'Nome no cartao' },
                        issuer: { id: 'form-checkout__issuer' },
                        installments: { id: 'form-checkout__installments' },
                        identificationType: { id: 'form-checkout__identificationType' },
                        identificationNumber: { id: 'form-checkout__identificationNumber', placeholder: 'CPF ou CNPJ' },
                        cardholderEmail: { id: 'form-checkout__cardholderEmail', placeholder: 'voce@exemplo.com' },
                    },
                    callbacks: {
                        onFormMounted: (mountError: unknown) => {
                            if (cancelled) return;
                            if (mountError) {
                                setCardFormError('Nao foi possivel carregar o formulario de cartao.');
                                return;
                            }
                            setCardReady(true);
                        },
                        onSubmit: (event: Event) => {
                            event.preventDefault();
                            void cardSubmitRef.current?.();
                        },
                        onError: () => {
                            if (!cancelled) {
                                setCardFormError('Verifique os dados do cartao e tente novamente.');
                            }
                        },
                    },
                });

                cardFormRef.current = form;
                cardSubmitRef.current = async () => {
                    const cardFormData = form.getCardFormData();
                    if (!cardFormData?.token) {
                        throw new Error('Token do cartao nao foi gerado. Revise os campos e tente novamente.');
                    }

                    setProcessingPayment(true);
                    setError('');

                    try {
                        const response = await api.post<PaymentResponse>(`/payments/orders/${currentOrderId}/card`, {
                            cardToken: cardFormData.token,
                            paymentMethodId: cardFormData.paymentMethodId,
                            issuerId: cardFormData.issuerId || undefined,
                            installments: 1,
                            saveCard: saveCardRef.current,
                        });

                        setLatestPayment(response);
                        if (response.status === 'APPROVED') {
                            navigate(`/order/${currentOrderId}`);
                            return;
                        }

                        if (response.lastError) {
                            setError(response.lastError);
                        }
                    } finally {
                        setProcessingPayment(false);
                    }
                };
            } catch (setupError: any) {
                if (!cancelled) {
                    setCardFormError(setupError?.message || 'Erro ao iniciar o pagamento com cartao.');
                }
            }
        }

        void setupCardForm();

        return () => {
            cancelled = true;
            if (savedCardSecurityFieldRef.current) {
                try { savedCardSecurityFieldRef.current.unmount(); } catch { }
                savedCardSecurityFieldRef.current = null;
            }
            if (cardFormRef.current) {
                try { cardFormRef.current.unmount(); } catch { }
                cardFormRef.current = null;
            }
        };
    }, [onlineOrder?.id, onlineOrder?.totalCents, onlineMethod, selectedSavedCardId, savedCardsResolved, config.cardEnabled, config.mercadoPagoPublicKey, navigate]);

    async function handleCreateOrder() {
        if (!canCreateOrder) return;
        setCreatingOrder(true);
        setError('');

        try {
            await ensureProfileReady();

            const order = await api.post<CheckoutOrder>('/orders', {
                items: items.map((item) => ({ productId: item.productId, qty: item.qty })),
                paymentMethod: checkoutMethod,
            });

            if (checkoutMethod === 'ON_PICKUP') {
                clear();
                navigate(`/order/${order.id}`);
                return;
            }

            clear();
            setOnlineOrder(order);
            setLatestPayment(order.latestPayment);
            syncOnlineMethod(order.latestPayment);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
        } finally {
            setCreatingOrder(false);
        }
    }

    async function handleCreatePixPayment() {
        if (!onlineOrder) return;

        setProcessingPayment(true);
        setError('');
        try {
            await ensureProfileReady();
            const response = await api.post<PaymentResponse>(`/payments/orders/${onlineOrder.id}/pix`, {});
            setLatestPayment(response);
            syncOnlineMethod(response);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao gerar pagamento PIX');
        } finally {
            setProcessingPayment(false);
        }
    }

    async function submitCardPayment() {
        try {
            if (selectedSavedCardId) {
                if (!cardReady || !cardSubmitRef.current) {
                    setError('Formulario do cartao salvo ainda nao esta pronto.');
                    return;
                }

                await cardSubmitRef.current();
                return;
            }

            if (!cardReady) {
                setError('Formulario de cartao ainda nao esta pronto.');
                return;
            }

            const formElement = document.getElementById('card-payment-form');
            if (!(formElement instanceof HTMLFormElement)) {
                setError('Formulario de cartao ainda nao esta pronto.');
                return;
            }

            setError('');
            formElement.requestSubmit();
        } catch (err: any) {
            setError(err?.message || 'Erro ao processar pagamento com cartao.');
            setProcessingPayment(false);
        }
    }

    function renderOrderReview() {
        return (
            <>
                <section>
                    <h2 className={styles.sectionTitle}>
                        <ShoppingBag size={20} strokeWidth={2.5} /> Resumo do Pedido
                    </h2>
                    <div className={styles.cartSection}>
                        <ul className={styles.itemList}>
                            {items.map((item) => (
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
                        {profileNeedsCompletion && (
                            <div className={styles.infoBox}>
                                <div className={styles.infoBoxTitle}>
                                    <ShieldCheck size={18} strokeWidth={2.5} />
                                    Complete seu cadastro para pagar
                                </div>
                                <p className={styles.infoBoxText}>
                                    Como o pedido envolve pagamento, seu CPF e celular precisam estar salvos antes de criar o pedido.
                                </p>
                            </div>
                        )}

                        {profileNeedsCompletion && (
                            <div className={styles.fieldGrid}>
                                <label className={styles.field}>
                                    <span>Nome</span>
                                    <input
                                        className={styles.input}
                                        value={payerName}
                                        placeholder="Nome completo"
                                        readOnly
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>E-mail</span>
                                    <input
                                        className={styles.input}
                                        type="email"
                                        value={payerEmail}
                                        placeholder="voce@exemplo.com"
                                        readOnly
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>CPF</span>
                                    <input
                                        className={styles.input}
                                        value={formatTaxId(payerDocument)}
                                        onChange={(event) => setPayerDocument(formatTaxId(event.target.value))}
                                        placeholder="000.000.000-00"
                                        inputMode="numeric"
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>Celular</span>
                                    <input
                                        className={styles.input}
                                        type="tel"
                                        value={payerPhone}
                                        onChange={(event) => setPayerPhone(event.target.value)}
                                        placeholder="65999999999"
                                        inputMode="tel"
                                    />
                                </label>
                            </div>
                        )}

                        <div className={styles.paymentOptions}>
                            <div
                                className={`${styles.option} ${checkoutMethod === 'ONLINE' ? styles.activeOption : ''} ${!config.onlineEnabled ? styles.optionDisabled : ''}`}
                                onClick={() => config.onlineEnabled && setCheckoutMethod('ONLINE')}
                            >
                                <QrCode size={24} color={checkoutMethod === 'ONLINE' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                <div className={styles.paymentTextBlock}>
                                    <span className={styles.paymentLabel}>Pagamento Online</span>
                                    <span className={styles.paymentHint}>
                                        Pix ou cartao de credito/debito.
                                    </span>
                                </div>
                                <input type="radio" checked={checkoutMethod === 'ONLINE'} readOnly disabled={!config.onlineEnabled} />
                            </div>

                            {config.allowOnPickupPayment && (
                                <div
                                    className={`${styles.option} ${checkoutMethod === 'ON_PICKUP' ? styles.activeOption : ''}`}
                                    onClick={() => setCheckoutMethod('ON_PICKUP')}
                                >
                                    <Wallet size={24} color={checkoutMethod === 'ON_PICKUP' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                    <div className={styles.paymentTextBlock}>
                                        <span className={styles.paymentLabel}>Pagar no Balcao</span>
                                        <span className={styles.paymentHint}>
                                            O pedido sai confirmado e o pagamento fica para a retirada.
                                        </span>
                                    </div>
                                    <input type="radio" checked={checkoutMethod === 'ON_PICKUP'} readOnly />
                                </div>
                            )}
                        </div>

                        {!config.onlineEnabled && !config.allowOnPickupPayment && (
                            <div className={styles.error}>
                                <AlertCircle size={18} /> Nenhuma forma de pagamento esta disponivel no momento.
                            </div>
                        )}

                        {error && (
                            <div className={styles.error}>
                                <AlertCircle size={18} /> {error}
                            </div>
                        )}

                        <button className={styles.confirmBtn} disabled={!canCreateOrder || savingProfile} onClick={handleCreateOrder}>
                            {creatingOrder ? (
                                <><Loader2 size={20} className={styles.spin} /> Processando...</>
                            ) : savingProfile ? (
                                <><Loader2 size={20} className={styles.spin} /> Salvando perfil...</>
                            ) : checkoutMethod === 'ONLINE' ? (
                                <><CheckCircle2 size={24} strokeWidth={2.5} /> Ir para pagamento online</>
                            ) : (
                                <><CheckCircle2 size={24} strokeWidth={2.5} /> Finalizar pedido</>
                            )}
                        </button>
                    </div>
                </section>
            </>
        );
    }

    function renderPixResult() {
        if (!activePaymentSummary?.qrCode) return null;
        const qrImageSrc = normalizeQrCodeImageSrc(activePaymentSummary.qrCodeBase64);

        return (
            <div className={styles.pixResult}>
                {qrImageSrc && (
                    <img
                        src={qrImageSrc}
                        alt="QR Code PIX"
                        className={styles.qrImage}
                    />
                )}

                <div className={styles.pixCodeBox}>{activePaymentSummary.qrCode}</div>

                <button
                    type="button"
                    className={styles.secondaryWideBtn}
                    onClick={() => navigator.clipboard.writeText(activePaymentSummary.qrCode || '')}
                >
                    <Copy size={18} />
                    Copiar codigo PIX
                </button>

                <p className={styles.inlineHint}>
                    Assim que confirmarmos o pagamento, seu pedido sera liberado automaticamente.
                </p>
            </div>
        );
    }

    function renderOnlinePayment() {
        if (!onlineOrder) return null;
        const shouldShowProfileFields = profileNeedsCompletion;

        return (
            <>
                <section>
                    <h2 className={styles.sectionTitle}>
                        <ShieldCheck size={20} strokeWidth={2.5} /> Pagamento Online
                    </h2>
                    <div className={styles.paymentSection}>
                        <div className={styles.summaryPill}>
                            Pedido #{onlineOrder.id.slice(0, 8)} • {formatCurrency(onlineOrder.totalCents)}
                        </div>

                        {profileNeedsCompletion && (
                            <div className={styles.statusCard}>
                                Complete CPF e celular abaixo. Esses dados sao obrigatorios para liberar o pagamento online.
                            </div>
                        )}

                        {shouldShowProfileFields ? (
                            <div className={styles.fieldGrid}>
                                <label className={styles.field}>
                                    <span>Nome do pagador</span>
                                    <input
                                        className={styles.input}
                                        value={payerName}
                                        placeholder="Nome completo"
                                        readOnly
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>E-mail</span>
                                    <input
                                        id="form-checkout__cardholderEmail"
                                        className={styles.input}
                                        type="email"
                                        value={payerEmail}
                                        placeholder="voce@exemplo.com"
                                        readOnly
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>CPF</span>
                                    <input
                                        id="form-checkout__identificationNumber"
                                        className={styles.input}
                                        value={formatTaxId(payerDocument)}
                                        onChange={(event) => setPayerDocument(formatTaxId(event.target.value))}
                                        placeholder="000.000.000-00"
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>Celular</span>
                                    <input
                                        className={styles.input}
                                        type="tel"
                                        value={payerPhone}
                                        onChange={(event) => setPayerPhone(event.target.value)}
                                        placeholder="(65) 99999-9999"
                                    />
                                </label>
                            </div>
                        ) : (
                            <>
                                <div className={styles.statusCard}>
                                    Pagador: <strong>{payerName}</strong> • {payerEmail} • CPF {formatTaxId(payerDocument)} • Celular {payerPhone}
                                </div>
                                <div style={{ display: 'none' }}>
                                    <input id="form-checkout__cardholderEmail" value={payerEmail} readOnly />
                                    <input id="form-checkout__identificationNumber" value={normalizeTaxId(payerDocument)} readOnly />
                                    <select id="form-checkout__identificationType" defaultValue={documentType}>
                                        <option value={documentType}>{documentType}</option>
                                    </select>
                                </div>
                            </>
                        )}

                        <div className={styles.paymentOptions}>
                            {config.pixEnabled && (
                                <div
                                    className={`${styles.option} ${onlineMethod === 'PIX' ? styles.activeOption : ''}`}
                                    onClick={() => setOnlineMethod('PIX')}
                                >
                                    <QrCode size={22} color={onlineMethod === 'PIX' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                    <div className={styles.paymentTextBlock}>
                                        <span className={styles.paymentLabel}>Pix</span>
                                        <span className={styles.paymentHint}>Gera QR Code e copia e cola na hora.</span>
                                    </div>
                                    <input type="radio" checked={onlineMethod === 'PIX'} readOnly />
                                </div>
                            )}

                            {config.cardEnabled && (
                                <div
                                    className={`${styles.option} ${onlineMethod === 'CARD' ? styles.activeOption : ''}`}
                                    onClick={() => setOnlineMethod('CARD')}
                                >
                                    <CreditCard size={22} color={onlineMethod === 'CARD' ? 'var(--secondary)' : 'var(--text-dim)'} />
                                    <div className={styles.paymentTextBlock}>
                                        <span className={styles.paymentLabel}>Cartao</span>
                                        <span className={styles.paymentHint}>Credito ou debito com tokenizacao segura.</span>
                                    </div>
                                    <input type="radio" checked={onlineMethod === 'CARD'} readOnly />
                                </div>
                            )}
                        </div>

                        {onlineMethod === 'PIX' && renderPixResult()}

                        {onlineMethod === 'CARD' && (
                            <form id="card-payment-form" className={styles.cardForm}>
                                {shouldShowProfileFields ? (
                                    <label className={styles.field}>
                                        <span>Nome no cartao</span>
                                        <input
                                            id="form-checkout__cardholderName"
                                            className={styles.input}
                                            defaultValue={payerName}
                                            onChange={(event) => setPayerName(event.target.value)}
                                            placeholder="Nome como aparece no cartao"
                                        />
                                    </label>
                                ) : (
                                    <div style={{ display: 'none' }}>
                                        <input id="form-checkout__cardholderName" value={payerName} readOnly />
                                    </div>
                                )}

                                {savedCards.length > 0 && (
                                    <div className={styles.savedCardsSection}>
                                        <div className={styles.savedCardsGrid}>
                                            {savedCards.map(card => (
                                                <div
                                                    key={card.id}
                                                    className={`${styles.savedCardItem} ${selectedSavedCardId === card.id ? styles.activeSavedCard : ''}`}
                                                    onClick={() => setSelectedSavedCardId(selectedSavedCardId === card.id ? null : card.id)}
                                                >
                                                    <div className={styles.savedCardInfo}>
                                                        {card.thumbnail && <img src={card.thumbnail} alt={card.brand ?? 'Cartão salvo'} className={styles.cardIcon} />}
                                                        <span>•••• {card.lastFourDigits}</span>
                                                    </div>
                                                    <input type="radio" checked={selectedSavedCardId === card.id} readOnly />
                                                </div>
                                            ))}
                                            <div
                                                className={`${styles.savedCardItem} ${!selectedSavedCardId ? styles.activeSavedCard : ''}`}
                                                onClick={() => setSelectedSavedCardId(null)}
                                            >
                                                <span>Novo cartão</span>
                                                <input type="radio" checked={!selectedSavedCardId} readOnly />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!selectedSavedCardId && (
                                    <>
                                        <div className={styles.cardFrameGrid}>
                                            <div className={styles.frameField}>
                                                <span>Numero do cartao</span>
                                                <div id="form-checkout__cardNumber" className={styles.frameInput} />
                                            </div>
                                            <div className={styles.frameField}>
                                                <span>Validade</span>
                                                <div id="form-checkout__expirationDate" className={styles.frameInput} />
                                            </div>
                                            <div className={styles.frameField}>
                                                <span>CVV</span>
                                                <div id="form-checkout__securityCode" className={styles.frameInput} />
                                            </div>
                                            <div style={{ display: 'none' }}>
                                                <select id="form-checkout__issuer" />
                                                <select id="form-checkout__installments" />
                                            </div>
                                        </div>

                                        <label className={styles.checkboxField}>
                                            <input
                                                type="checkbox"
                                                checked={saveCard}
                                                onChange={(e) => setSaveCard(e.target.checked)}
                                            />
                                            <span>Salvar este cartão para o próximo pedido</span>
                                        </label>
                                    </>
                                )}

                                {selectedSavedCardId && (
                                    <div className={styles.savedCardConfirmation}>
                                        <p>Usando cartão salvo terminado em <strong>{selectedSavedCard?.lastFourDigits}</strong>.</p>
                                        <div className={styles.cardFrameGrid}>
                                            <div className={styles.frameField}>
                                                <span>CVV do cartão salvo</span>
                                                <div id="form-checkout__savedSecurityCode" className={styles.frameInput} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {cardFormError && (
                                    <div className={styles.error}>
                                        <AlertCircle size={18} /> {cardFormError}
                                    </div>
                                )}
                            </form>
                        )}

                        {activePaymentSummary && (
                            <div className={styles.statusCard}>
                                <strong>Status:</strong> {activePaymentSummary.status}
                            </div>
                        )}

                        {error && (
                            <div className={styles.error}>
                                <AlertCircle size={18} /> {error}
                            </div>
                        )}

                        <div className={styles.actionRow}>
                            <button type="button" className={styles.ghostWideBtn} onClick={() => navigate(`/order/${onlineOrder.id}`)}>
                                Ver pedido
                            </button>
                            {onlineMethod === 'PIX' ? (
                                <button type="button" className={styles.confirmBtn} disabled={!canGeneratePix || savingProfile} onClick={handleCreatePixPayment}>
                                    {processingPayment ? <><Loader2 size={20} className={styles.spin} /> Gerando PIX...</> : savingProfile ? <><Loader2 size={20} className={styles.spin} /> Salvando perfil...</> : activePaymentSummary?.paymentMethod === 'PIX' ? 'Gerar ou atualizar PIX' : 'Gerar PIX'}
                                </button>
                            ) : (
                                <button type="button" className={styles.confirmBtn} disabled={!canPayCard || savingProfile} onClick={submitCardPayment}>
                                    {processingPayment ? <><Loader2 size={20} className={styles.spin} /> Processando...</> : savingProfile ? <><Loader2 size={20} className={styles.spin} /> Salvando perfil...</> : 'Pagar com cartao'}
                                </button>
                            )}
                        </div>

                        <button type="button" className={styles.ghostWideBtn} onClick={() => void reconcileOnlineOrder(onlineOrder.id)}>
                            Atualizar status do pagamento
                        </button>
                    </div>
                </section>
            </>
        );
    }

    if (loadingConfig || loadingExistingOrder) {
        return (
            <div className={styles.page}>
                <div className={styles.emptyState}>
                    <Loader2 size={46} strokeWidth={1.5} className={styles.spin} color="var(--primary)" />
                    <h2>Carregando pagamento</h2>
                    <p>Estamos verificando o estado atual do seu pedido.</p>
                </div>
            </div>
        );
    }

    if (items.length === 0 && !onlineOrder && !isResumingOrder) {
        return (
            <div className={styles.page}>
                <div className={styles.emptyState}>
                    <ShoppingBag size={80} strokeWidth={1} color="var(--primary)" opacity={0.2} />
                    <h2>Seu pedido esta vazio</h2>
                    <p>Que tal escolher algo gostoso?</p>
                    <button className={styles.backBtn} onClick={() => navigate('/menu')}>
                        Ver Cardapio
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <main className={styles.content}>
                <div className={styles.titleBlock} style={{ marginBottom: '2rem', textAlign: 'center' }}>
                    <h1 className={styles.title}>{onlineOrder ? 'Pagamento' : 'Pedido'}</h1>
                    <p className={styles.subtitle}>
                        {onlineOrder ? 'Conclua o pagamento para liberar seu pedido.' : 'Revise seus itens antes de finalizar.'}
                    </p>
                </div>
                {onlineOrder ? renderOnlinePayment() : renderOrderReview()}
            </main>
        </div>
    );
}
