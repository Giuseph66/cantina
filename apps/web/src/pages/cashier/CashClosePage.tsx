import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { Calculator, CircleDollarSign, Loader2, LogOut, ReceiptText } from 'lucide-react';
import styles from './CashPage.module.css';
import { CashierLayout } from '../../components/cashier/CashierLayout';
import { useCashSession } from '../../hooks/useCashSession';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

type TotalsByMethod = Record<string, number>;

interface CashCloseData {
    openedAt: string;
    openingCashCents: number;
    movements: Array<unknown>;
    openedBy: { name: string };
    summary: {
        movementCount: number;
        expectedCashCents: number;
        totalsByMethod: TotalsByMethod;
    };
}

const METHOD_LABELS: Record<string, string> = {
    ONLINE: 'Pagamento online',
    CASH: 'Dinheiro',
    PIX: 'Pix',
    CARD: 'Cartao',
    INTERNAL_CREDIT: 'Notinha',
    ON_PICKUP: 'Pagar na retirada',
};

export default function CashClosePage() {
    const api = useApi();
    const navigate = useNavigate();
    const { hasOpenSession, isLoading: isCashLoading } = useCashSession();
    const [data, setData] = useState<CashCloseData | null>(null);
    const [notes, setNotes] = useState('');
    const [countedCashStr, setCountedCashStr] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isCashLoading) return;
        if (!hasOpenSession) {
            navigate('/cashier/cash-open', { replace: true });
            return;
        }

        api.get<CashCloseData | null>('/cash/today')
            .then((res) => {
                setData(res);
                if (res) {
                    setCountedCashStr((res.summary.expectedCashCents / 100).toFixed(2));
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [api, hasOpenSession, isCashLoading, navigate]);

    const countedCashValue = Number.parseFloat(countedCashStr.replace(',', '.'));
    const countedCashCents = Number.isFinite(countedCashValue) ? Math.round(countedCashValue * 100) : 0;
    const cashDifferenceCents = data ? countedCashCents - data.summary.expectedCashCents : 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!data) return;
        if (!Number.isFinite(countedCashValue) || countedCashValue < 0) {
            alert('Informe o valor contado em caixa.');
            return;
        }
        if (!window.confirm('Tem certeza? Isso encerrará a sessão atual.')) return;

        setSubmitting(true);
        try {
            const res = await api.post<{
                session: { closingCashCents: number; countedCashCents: number; cashDifferenceCents: number };
                summary: { expectedCashCents: number };
            }>('/cash/close', {
                notes,
                countedCashCents,
            });
            alert(
                `Caixa fechado. Esperado: ${formatCurrency(res.summary.expectedCashCents)} | Contado: ${formatCurrency(res.session.countedCashCents)} | Diferenca: ${formatCurrency(res.session.cashDifferenceCents)}`,
            );
            navigate('/login');
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div className={styles.loading}>
            <Loader2 className={styles.spin} size={32} />
            <span>Sincronizando dados do caixa...</span>
        </div>
    );

    if (!hasOpenSession) return null;

    if (!data) return (
        <CashierLayout title="Fechar Caixa" subtitle="Encerramento de sessão">
            <div className={styles.emptyState}>
                <p>Nenhuma sessão de caixa aberta no momento.</p>
                <button className={styles.btnSecondary} onClick={() => navigate('/cashier/scan')}>
                    Voltar ao Painel
                </button>
            </div>
        </CashierLayout>
    );

    return (
        <CashierLayout title="Fechar Caixa" subtitle="Encerramento e balancete da sessão atual">
            <div className={`${styles.card} ${styles.cashCloseCard}`}>
                <div className={styles.cashCloseHero}>
                    <div className={styles.iconWrapperOut}>
                        <LogOut size={48} strokeWidth={2.5} />
                    </div>
                    <div className={styles.cashCloseHeroText}>
                        <span className={styles.heroEyebrow}>Balancete da sessao</span>
                        <h2 className={styles.heroTitle}>Revise os totais antes de encerrar o turno</h2>
                        <p className={styles.heroDescription}>
                            Confira o valor esperado em especie, compare com o valor contado e registre qualquer observacao relevante.
                        </p>
                    </div>
                </div>

                <div className={styles.cashCloseGrid}>
                    <div className={styles.cashCloseMain}>
                        <div className={styles.infoBlock}>
                            <div className={styles.infoBlockHeader}>
                                <div>
                                    <span className={styles.infoBlockLabel}>Sessao atual</span>
                                    <h3 className={styles.infoBlockTitle}>Resumo operacional</h3>
                                </div>
                                <ReceiptText size={18} strokeWidth={2.3} />
                            </div>
                            <div className={styles.infoRows}>
                                <p><strong>Operador:</strong> {data.openedBy.name}</p>
                                <p><strong>Abertura:</strong> {new Date(data.openedAt).toLocaleTimeString()}</p>
                                <p><strong>Fundo Inicial:</strong> {formatCurrency(data.openingCashCents)}</p>
                                <p><strong>Movimentacoes:</strong> {data.summary.movementCount} transacoes registradas</p>
                            </div>
                        </div>

                        <div className={styles.summaryGrid}>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>Esperado em especie</span>
                                <strong className={styles.summaryValue}>{formatCurrency(data.summary.expectedCashCents)}</strong>
                                <span className={styles.summaryCaption}>Fundo inicial + vendas em dinheiro</span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>Contado agora</span>
                                <strong className={styles.summaryValue}>{formatCurrency(countedCashCents)}</strong>
                                <span className={styles.summaryCaption}>Atualizado conforme voce digita</span>
                            </div>
                            <div className={`${styles.summaryCard} ${cashDifferenceCents === 0 ? styles.summaryNeutral : cashDifferenceCents > 0 ? styles.summaryPositive : styles.summaryNegative}`}>
                                <span className={styles.summaryLabel}>Diferenca</span>
                                <strong className={styles.summaryValue}>{formatCurrency(cashDifferenceCents)}</strong>
                                <span className={styles.summaryCaption}>
                                    {cashDifferenceCents === 0
                                        ? 'Fechamento sem divergencia'
                                        : cashDifferenceCents > 0
                                            ? 'Sobra apurada no caixa'
                                            : 'Falta apurada no caixa'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <aside className={styles.cashCloseAside}>
                        <form onSubmit={handleSubmit} className={`${styles.form} ${styles.cashCloseForm}`}>
                            <div className={styles.formHeader}>
                                <div>
                                    <span className={styles.infoBlockLabel}>Fechamento manual</span>
                                    <h3 className={styles.infoBlockTitle}>Conferir e encerrar</h3>
                                </div>
                                <Calculator size={18} strokeWidth={2.3} />
                            </div>

                            <div className={styles.balanceNotice}>
                                <strong>Esperado agora: {formatCurrency(data.summary.expectedCashCents)}</strong>
                                <span>Preencha o valor contado e registre observacoes do turno, se houver.</span>
                            </div>

                            <label className={styles.label}>Valor contado em caixa (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={countedCashStr}
                                onChange={(e) => setCountedCashStr(e.target.value)}
                                className={styles.input}
                                required
                            />

                            <div className={styles.liveDifference}>
                                <span>Diferenca apurada no momento</span>
                                <strong className={cashDifferenceCents === 0 ? styles.summaryNeutralText : cashDifferenceCents > 0 ? styles.summaryPositiveText : styles.summaryNegativeText}>
                                    {formatCurrency(cashDifferenceCents)}
                                </strong>
                            </div>

                            <label className={styles.label}>Observacoes de Encerramento</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Ex: divergencia de valores, motivo de sangria, observacoes do turno..."
                                className={styles.textarea}
                                rows={4}
                            />

                            <button type="submit" className={styles.btnSubmitRed} disabled={submitting}>
                                {submitting ? 'PROCESSANDO...' : 'ENCERRAR SESSAO E FECHAR CAIXA'}
                            </button>
                        </form>
                    </aside>
                </div>

                <div className={styles.methodList}>
                    <div className={styles.methodListHeader}>
                        <div>
                            <span className={styles.infoBlockLabel}>Conferencia por metodo</span>
                            <h3 className={styles.infoBlockTitle}>Entradas registradas</h3>
                        </div>
                        <CircleDollarSign size={18} strokeWidth={2.3} />
                    </div>
                    {Object.entries(data.summary.totalsByMethod).map(([method, amount]) => (
                        <div key={method} className={styles.methodRow}>
                            <span>{METHOD_LABELS[method] ?? method}</span>
                            <strong>{formatCurrency(amount)}</strong>
                        </div>
                    ))}
                </div>
            </div>
        </CashierLayout>
    );
}
