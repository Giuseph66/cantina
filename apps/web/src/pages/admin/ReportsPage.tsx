import { useEffect, useState } from 'react';
import { CalendarRange, Filter, RotateCcw, ReceiptText, WalletCards, Trophy, UsersRound, TimerReset } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { ReportCards } from '../../components/admin/ReportCards';
import { useApi } from '../../hooks/useApi';
import adminStyles from './Admin.module.css';
import styles from './ReportsPage.module.css';

type KpiData = {
    date: string;
    revenueCents: number;
    orderCount: number;
    ticketMedioCents: number;
    failedOrdersCount: number;
};

type DailySummary = {
    date: string;
    totalSalesCents: number;
    onlineOrders: number;
    counterOrders: number;
    expiredOrders: number;
    salesByMethod: Record<string, number>;
};

type TopItem = {
    productId: string;
    name: string;
    qtySold: number;
    revenueCents: number;
};

type CashSessionRow = {
    id: string;
    openedBy: { id: string; name: string };
    openedAt: string;
    closedAt: string | null;
    openingCashCents: number;
    closingCashCents: number | null;
    countedCashCents: number | null;
    cashDifferenceCents: number | null;
    totalsByMethod: Record<string, number>;
    expectedCashCents?: number;
    movementCount?: number;
};

type CashReport = {
    date: string;
    totalSalesCents: number;
    onlineOrders: number;
    counterOrders: number;
    expiredOrders: number;
    salesByMethod: Record<string, number>;
    sessions: CashSessionRow[];
};

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDateTime(value: string | null) {
    if (!value) return 'Em aberto';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
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

const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Dinheiro',
    PIX: 'Pix',
    CARD: 'Cartao',
    INTERNAL_CREDIT: 'Notinha',
    ON_PICKUP: 'Na retirada',
};

const CHANNEL_LABELS: Record<string, string> = {
    ONLINE: 'App',
    COUNTER: 'Balcao',
};

export default function ReportsPage() {
    const api = useApi();
    const today = toInputDate(new Date());

    const [dateFrom, setDateFrom] = useState(today);
    const [dateTo, setDateTo] = useState(today);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [channel, setChannel] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [kpis, setKpis] = useState<KpiData | null>(null);
    const [summary, setSummary] = useState<DailySummary | null>(null);
    const [topItems, setTopItems] = useState<TopItem[]>([]);
    const [cashReport, setCashReport] = useState<CashReport | null>(null);

    async function loadReports(currentFilters?: {
        dateFrom: string;
        dateTo: string;
        paymentMethod: string;
        channel: string;
    }) {
        const filters = currentFilters ?? { dateFrom, dateTo, paymentMethod, channel };
        setLoading(true);
        setError('');

        const params = new URLSearchParams();
        params.set('dateFrom', filters.dateFrom);
        params.set('dateTo', filters.dateTo);
        if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
        if (filters.channel) params.set('channel', filters.channel);
        const query = params.toString();

        try {
            const [kpiData, dailyData, topItemsData, cashData] = await Promise.all([
                api.get<KpiData>(`/reports/kpis?${query}`),
                api.get<DailySummary>(`/reports/daily?${query}`),
                api.get<TopItem[]>(`/reports/top-items?${query}`),
                api.get<CashReport>(`/cash/report?${query}`),
            ]);

            setKpis(kpiData);
            setSummary(dailyData);
            setTopItems(topItemsData);
            setCashReport(cashData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar relatorios.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadReports();
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        await loadReports({ dateFrom, dateTo, paymentMethod, channel });
    };

    const applyPreset = async (days: number) => {
        const nextDateFrom = shiftDate(-(days - 1));
        const nextDateTo = today;
        setDateFrom(nextDateFrom);
        setDateTo(nextDateTo);
        await loadReports({ dateFrom: nextDateFrom, dateTo: nextDateTo, paymentMethod, channel });
    };

    const resetFilters = async () => {
        setDateFrom(today);
        setDateTo(today);
        setPaymentMethod('');
        setChannel('');
        await loadReports({ dateFrom: today, dateTo: today, paymentMethod: '', channel: '' });
    };

    return (
        <AdminLayout title="Relatorios" subtitle="Financeiro, operacao e fechamento em uma unica visao">
            <div className={styles.page}>
                <section className={`${adminStyles.card} ${styles.filterCard}`}>
                    <div className={styles.filterHeader}>
                        <div>
                            <h2 className={adminStyles.cardTitle}><Filter size={20} /> Filtros do Periodo</h2>
                            <p className={styles.filterSubtitle}>Refine por datas, canal e forma de pagamento.</p>
                        </div>
                        <div className={styles.presetRow}>
                            <button type="button" className={styles.presetBtn} onClick={() => applyPreset(1)}>Hoje</button>
                            <button type="button" className={styles.presetBtn} onClick={() => applyPreset(7)}>7 dias</button>
                            <button type="button" className={styles.presetBtn} onClick={() => applyPreset(30)}>30 dias</button>
                        </div>
                    </div>

                    <form className={styles.filterForm} onSubmit={handleSubmit}>
                        <label className={styles.field}>
                            <span>Data inicial</span>
                            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                        </label>

                        <label className={styles.field}>
                            <span>Data final</span>
                            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                        </label>

                        <label className={styles.field}>
                            <span>Forma de pagamento</span>
                            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                                <option value="">Todas</option>
                                <option value="CASH">Dinheiro</option>
                                <option value="PIX">Pix</option>
                                <option value="CARD">Cartao</option>
                                <option value="INTERNAL_CREDIT">Notinha</option>
                            </select>
                        </label>

                        <label className={styles.field}>
                            <span>Canal</span>
                            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                                <option value="">Todos</option>
                                <option value="ONLINE">App</option>
                                <option value="COUNTER">Balcao</option>
                            </select>
                        </label>

                        <div className={styles.filterActions}>
                            <button type="submit" className={styles.primaryBtn}>
                                <CalendarRange size={18} />
                                Aplicar filtros
                            </button>
                            <button type="button" className={styles.secondaryBtn} onClick={resetFilters}>
                                <RotateCcw size={18} />
                                Limpar
                            </button>
                        </div>
                    </form>
                </section>

                {error && (
                    <div className={styles.errorBanner}>
                        {error}
                    </div>
                )}

                <ReportCards data={kpis} />

                <div className={styles.heroGrid}>
                    <section className={`${adminStyles.card} ${styles.heroCard}`}>
                        <div className={styles.heroTop}>
                            <div className={styles.heroIcon}>
                                <ReceiptText size={28} />
                            </div>
                            <div>
                                <p className={styles.eyebrow}>Receita consolidada</p>
                                <h2 className={styles.heroValue}>{formatCurrency(summary?.totalSalesCents ?? 0)}</h2>
                            </div>
                        </div>
                        <p className={styles.heroCopy}>
                            Periodo de {dateFrom} ate {dateTo}. O total considera pedidos liquidados no intervalo filtrado.
                        </p>
                    </section>

                    <section className={`${adminStyles.card} ${styles.channelCard}`}>
                        <div className={styles.sectionMiniHeader}>
                            <h3><UsersRound size={18} /> Operacao do Periodo</h3>
                        </div>
                        <div className={styles.channelGrid}>
                            <div className={styles.channelStat}>
                                <span>Pedidos no app</span>
                                <strong>{summary?.onlineOrders ?? 0}</strong>
                            </div>
                            <div className={styles.channelStat}>
                                <span>Vendas no balcao</span>
                                <strong>{summary?.counterOrders ?? 0}</strong>
                            </div>
                            <div className={styles.channelStat}>
                                <span>Expirados</span>
                                <strong>{summary?.expiredOrders ?? 0}</strong>
                            </div>
                        </div>
                    </section>
                </div>

                <div className={styles.grid}>
                    <section className={adminStyles.card}>
                        <div className={styles.sectionMiniHeader}>
                            <h3><WalletCards size={18} /> Vendas por Metodo</h3>
                        </div>
                        <div className={styles.methodList}>
                            {Object.entries(summary?.salesByMethod ?? {}).length > 0 ? Object.entries(summary?.salesByMethod ?? {}).map(([method, amount]) => (
                                <div key={method} className={styles.methodRow}>
                                    <div>
                                        <strong>{PAYMENT_LABELS[method] ?? method}</strong>
                                        <span>{method}</span>
                                    </div>
                                    <strong>{formatCurrency(amount)}</strong>
                                </div>
                            )) : (
                                <div className={adminStyles.emptyState}>
                                    <p>Nenhuma movimentacao encontrada para os filtros atuais.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className={adminStyles.card}>
                        <div className={styles.sectionMiniHeader}>
                            <h3><Trophy size={18} /> Top Produtos</h3>
                        </div>
                        <div className={styles.topList}>
                            {topItems.length > 0 ? topItems.map((item, index) => (
                                <div key={item.productId} className={styles.topRow}>
                                    <div>
                                        <span className={styles.rank}>#{index + 1}</span>
                                        <strong>{item.name}</strong>
                                    </div>
                                    <div className={styles.topMeta}>
                                        <span>{item.qtySold} un</span>
                                        <strong>{formatCurrency(item.revenueCents)}</strong>
                                    </div>
                                </div>
                            )) : (
                                <div className={adminStyles.emptyState}>
                                    <p>Nenhum item vendido no periodo.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <section className={adminStyles.card}>
                    <div className={styles.sectionMiniHeader}>
                        <h3><TimerReset size={18} /> Sessoes e Balancete</h3>
                    </div>
                    <div className={styles.sessions}>
                        {loading ? (
                            <div className={adminStyles.loadingState}>
                                <p>Carregando sessoes...</p>
                            </div>
                        ) : cashReport?.sessions?.length ? cashReport.sessions.map((session) => (
                            <article key={session.id} className={styles.sessionCard}>
                                <div className={styles.sessionHeader}>
                                    <div>
                                        <div className={styles.sessionTitleRow}>
                                            <strong>{session.openedBy.name}</strong>
                                            <span className={session.closedAt ? adminStyles.tagClosed : adminStyles.tagOpen}>
                                                {session.closedAt ? 'Fechado' : 'Em aberto'}
                                            </span>
                                        </div>
                                        <p>
                                            Abertura: {formatDateTime(session.openedAt)} · Fechamento: {formatDateTime(session.closedAt)}
                                        </p>
                                    </div>
                                    <div className={styles.sessionNumbers}>
                                        <span>Fundo: {formatCurrency(session.openingCashCents)}</span>
                                        <span>Esperado: {formatCurrency(session.expectedCashCents ?? session.closingCashCents ?? session.openingCashCents)}</span>
                                    </div>
                                </div>

                                <div className={styles.sessionGrid}>
                                    <div className={styles.sessionMetric}>
                                        <span>Contado</span>
                                        <strong>{session.countedCashCents != null ? formatCurrency(session.countedCashCents) : 'Nao fechado'}</strong>
                                    </div>
                                    <div className={styles.sessionMetric}>
                                        <span>Diferenca</span>
                                        <strong className={(session.cashDifferenceCents ?? 0) === 0 ? styles.neutral : (session.cashDifferenceCents ?? 0) > 0 ? styles.positive : styles.negative}>
                                            {session.cashDifferenceCents != null ? formatCurrency(session.cashDifferenceCents) : 'Nao apurado'}
                                        </strong>
                                    </div>
                                    <div className={styles.sessionMetric}>
                                        <span>Movimentacoes</span>
                                        <strong>{session.movementCount ?? Object.keys(session.totalsByMethod ?? {}).length}</strong>
                                    </div>
                                </div>

                                <div className={styles.methodChips}>
                                    {Object.entries(session.totalsByMethod ?? {}).length > 0 ? Object.entries(session.totalsByMethod).map(([method, amount]) => (
                                        <span key={method} className={styles.methodChip}>
                                            {(PAYMENT_LABELS[method] ?? method)}: {formatCurrency(amount)}
                                        </span>
                                    )) : (
                                        <span className={styles.methodChipMuted}>Sem movimentacoes registradas</span>
                                    )}
                                </div>
                            </article>
                        )) : (
                            <div className={adminStyles.emptyState}>
                                <p>Nenhuma sessao encontrada no periodo selecionado.</p>
                            </div>
                        )}
                    </div>
                </section>

                <section className={`${adminStyles.card} ${styles.auditCard}`}>
                    <div className={styles.sectionMiniHeader}>
                        <h3><Filter size={18} /> Leitura Rapida</h3>
                    </div>
                    <div className={styles.auditGrid}>
                        <div className={styles.auditItem}>
                            <span>Canal filtrado</span>
                            <strong>{channel ? (CHANNEL_LABELS[channel] ?? channel) : 'Todos os canais'}</strong>
                        </div>
                        <div className={styles.auditItem}>
                            <span>Pagamento filtrado</span>
                            <strong>{paymentMethod ? (PAYMENT_LABELS[paymentMethod] ?? paymentMethod) : 'Todos os metodos'}</strong>
                        </div>
                        <div className={styles.auditItem}>
                            <span>Periodo analisado</span>
                            <strong>{dateFrom} ate {dateTo}</strong>
                        </div>
                    </div>
                </section>
            </div>
        </AdminLayout>
    );
}
