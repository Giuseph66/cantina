import { useEffect, useMemo, useState } from 'react';
import {
    NotebookText, Search, UserRound, X, CheckSquare, Square
} from 'lucide-react';
import { CashierLayout } from '../../components/cashier/CashierLayout';
import { useApi } from '../../hooks/useApi';
import styles from './CreditNotesPage.module.css';

interface CreditNoteItem {
    id: string;
    qty: number;
    subtotalCents: number;
    product: {
        id: string;
        name: string;
        imageUrl: string | null;
    };
}

interface CreditNote {
    id: string;
    status: 'OPEN' | 'PAID' | 'CANCELLED';
    totalCents: number;
    paidCents: number;
    customerName: string | null;
    customerPhone: string | null;
    dueAt: string | null;
    notes: string | null;
    createdAt: string;
    settledAt: string | null;
    settledPaymentMethod: 'CASH' | 'PIX' | 'CARD' | null;
    isOverdue: boolean;
    customerUser: { id: string; name: string; email: string } | null;
    createdBy: { id: string; name: string; email: string };
    settledBy: { id: string; name: string } | null;
    order: {
        id: string;
        createdAt: string;
        totalCents: number;
        items: CreditNoteItem[];
    };
}

interface Summary {
    openCount: number;
    openTotalCents: number;
    overdueCount: number;
    overdueCents: number;
    receivedTodayCount: number;
    receivedTodayCents: number;
}

type Filter = 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID';
type SettlementMethod = 'CASH' | 'PIX' | 'CARD';

const SETTLEMENT_LABELS: Record<SettlementMethod, string> = {
    CASH: 'Receber em dinheiro',
    PIX: 'Receber no Pix',
    CARD: 'Receber no cartão',
};

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(date: string | null) {
    if (!date) return 'Sem vencimento';
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

interface CustomerGroup {
    customerId: string;
    customerName: string;
    customerPhone: string;
    notes: CreditNote[];
    openNotesCount: number;
    openTotalCents: number;
    paidTotalCents: number;
}

export default function CreditNotesPage() {
    const api = useApi();
    const [notes, setNotes] = useState<CreditNote[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('OPEN');
    const [loading, setLoading] = useState(true);
    const [settlingId, setSettlingId] = useState<string | null>(null);

    const [selectedCustomer, setSelectedCustomer] = useState<CustomerGroup | null>(null);
    const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
    const [customAmountStr, setCustomAmountStr] = useState<string>('');

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.set('search', search.trim());
            if (filter === 'OPEN' || filter === 'PAID') params.set('status', filter);
            const query = params.toString();

            const [notesData, summaryData] = await Promise.all([
                api.get<CreditNote[]>(`/credit-notes${query ? `?${query}` : ''}`),
                api.get<Summary>('/credit-notes/summary'),
            ]);

            setSummary(summaryData);
            setNotes(filter === 'OVERDUE' ? notesData.filter((note) => note.isOverdue) : notesData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [filter, search]);

    const customerGroups = useMemo(() => {
        const groups = new Map<string, CustomerGroup>();
        for (const note of notes) {
            const id = note.customerUser?.id ?? note.customerName ?? 'avulso';
            const name = note.customerUser?.name ?? note.customerName ?? 'Cliente avulso';
            const phone = note.customerUser?.email ?? note.customerPhone ?? 'Sem contato';

            if (!groups.has(id)) {
                groups.set(id, { customerId: id, customerName: name, customerPhone: phone, notes: [], openNotesCount: 0, openTotalCents: 0, paidTotalCents: 0 });
            }
            const group = groups.get(id)!;
            group.notes.push(note);
            if (note.status === 'OPEN') {
                group.openNotesCount += 1;
                group.openTotalCents += note.totalCents;
                group.paidTotalCents += note.paidCents;
            }
        }
        return Array.from(groups.values()).sort((a, b) => (b.openTotalCents - b.paidTotalCents) - (a.openTotalCents - a.paidTotalCents));
    }, [notes]);

    const handleSelectCustomer = (group: CustomerGroup) => {
        setSelectedCustomer(group);
        const openNotes = group.notes.filter(n => n.status === 'OPEN').map(n => n.id);
        setSelectedNoteIds(new Set(openNotes));
        setCustomAmountStr('');
    };

    const handleCloseModal = () => {
        setSelectedCustomer(null);
        setSelectedNoteIds(new Set());
        setCustomAmountStr('');
    };

    const toggleNoteSelection = (noteId: string) => {
        const newSet = new Set(selectedNoteIds);
        if (newSet.has(noteId)) {
            newSet.delete(noteId);
        } else {
            newSet.add(noteId);
        }
        setSelectedNoteIds(newSet);
        setCustomAmountStr('');
    };

    const selectedNotesTotalPendingCents = useMemo(() => {
        if (!selectedCustomer) return 0;
        return selectedCustomer.notes
            .filter(n => selectedNoteIds.has(n.id))
            .reduce((sum, n) => sum + (n.totalCents - n.paidCents), 0);
    }, [selectedCustomer, selectedNoteIds]);

    const settleBulk = async (paymentMethod: SettlementMethod) => {
        if (!selectedCustomer || selectedNoteIds.size === 0) return;

        let amountCents: number | undefined;
        if (customAmountStr.trim() !== '') {
            const parsedStr = customAmountStr.replace(',', '.');
            const parsed = parseFloat(parsedStr);
            if (isNaN(parsed) || parsed <= 0) {
                alert('Valor inválido para pagamento.');
                return;
            }
            amountCents = Math.round(parsed * 100);
            if (amountCents > selectedNotesTotalPendingCents) {
                alert('O valor informado é maior que o saldo devedor das notinhas selecionadas.');
                return;
            }
        } else {
            amountCents = selectedNotesTotalPendingCents;
        }

        try {
            setSettlingId('bulk');
            await api.post(`/credit-notes/bulk-settle`, {
                noteIds: Array.from(selectedNoteIds),
                amountCents,
                paymentMethod
            });
            handleCloseModal();
            await load();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSettlingId(null);
        }
    };

    return (
        <CashierLayout title="Notinhas" subtitle="Crédito interno, recebimentos pendentes e histórico de cobrança">
            <div className={styles.page}>
                <section className={styles.metricsGrid}>
                    <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>A receber</span>
                        <strong className={styles.metricValue}>{formatCurrency(summary?.openTotalCents ?? 0)}</strong>
                        <p className={styles.metricHint}>{summary?.openCount ?? 0} notinhas em aberto</p>
                    </article>
                    <article className={`${styles.metricCard} ${styles.metricWarn}`}>
                        <span className={styles.metricLabel}>Vencidas</span>
                        <strong className={styles.metricValue}>{formatCurrency(summary?.overdueCents ?? 0)}</strong>
                        <p className={styles.metricHint}>{summary?.overdueCount ?? 0} pendências atrasadas</p>
                    </article>
                    <article className={styles.metricCard}>
                        <span className={styles.metricLabel}>Recebido hoje</span>
                        <strong className={styles.metricValue}>{formatCurrency(summary?.receivedTodayCents ?? 0)}</strong>
                        <p className={styles.metricHint}>{summary?.receivedTodayCount ?? 0} quitações no turno</p>
                    </article>
                </section>

                <section className={styles.board}>
                    <div className={styles.toolbar}>
                        <label className={styles.searchField}>
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Buscar por cliente, telefone, operador ou pedido"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </label>

                        <div className={styles.filterTabs}>
                            {(['ALL', 'OPEN', 'OVERDUE', 'PAID'] as Filter[]).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={`${styles.filterTab} ${filter === value ? styles.filterTabActive : ''}`}
                                    onClick={() => setFilter(value)}
                                >
                                    {value === 'ALL' ? 'Todas' : value === 'OPEN' ? 'Em aberto' : value === 'OVERDUE' ? 'Vencidas' : 'Quitadas'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.resultsBar}>
                        <span>{loading ? 'Carregando...' : `${customerGroups.length} cliente(s)`}</span>
                        <strong>{formatCurrency(customerGroups.reduce((acc, c) => acc + (c.openTotalCents - c.paidTotalCents), 0))}</strong>
                    </div>

                    {loading ? (
                        <div className={styles.emptyState}>Carregando clientes...</div>
                    ) : customerGroups.length === 0 ? (
                        <div className={styles.emptyState}>
                            <NotebookText size={34} />
                            <p>Nenhuma notinha encontrada para esse filtro.</p>
                        </div>
                    ) : (
                        <div className={styles.groupedList}>
                            {customerGroups.map((group) => (
                                <article
                                    key={group.customerId}
                                    className={styles.customerCard}
                                    onClick={() => handleSelectCustomer(group)}
                                >
                                    <div className={styles.customerCardHeader}>
                                        <div>
                                            <h3 className={styles.customerCardName}>{group.customerName}</h3>
                                            <p className={styles.customerCardPhone}>
                                                <UserRound size={14} />
                                                {group.customerPhone}
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.customerCardStats}>
                                        <strong className={styles.customerCardTotal}>{formatCurrency(group.openTotalCents - group.paidTotalCents)}</strong>
                                        <span className={styles.customerCardCount}>{group.openNotesCount} notinhas pendentes</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {selectedCustomer && (
                <div className={styles.modalOverlay} onMouseDown={handleCloseModal}>
                    <div className={styles.modalContent} onMouseDown={(e) => e.stopPropagation()}>
                        <header className={styles.modalHeader}>
                            <div>
                                <h2>{selectedCustomer.customerName}</h2>
                                <p>Selecione as notinhas para quitar ou informe o valor parcial.</p>
                            </div>
                            <button onClick={handleCloseModal} className={styles.modalClose}>
                                <X size={20} />
                            </button>
                        </header>

                        <div className={styles.modalBody}>
                            <div className={styles.modalSection}>
                                <h3>Notinhas em Aberto</h3>
                                {selectedCustomer.notes.filter(n => n.status === 'OPEN').length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>Nenhuma notinha em aberto.</p>
                                ) : (
                                    selectedCustomer.notes.filter(n => n.status === 'OPEN').map(note => {
                                        const isSelected = selectedNoteIds.has(note.id);
                                        const amountNeeded = note.totalCents - note.paidCents;
                                        return (
                                            <div
                                                key={note.id}
                                                className={`${styles.selectableNote} ${isSelected ? styles.selectableNoteSelected : ''}`}
                                                onClick={() => toggleNoteSelection(note.id)}
                                            >
                                                <div className={styles.checkIcon}>
                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                                <div className={styles.selectableNoteInfo}>
                                                    <div className={styles.selectableNoteHeader}>
                                                        <strong>{formatCurrency(amountNeeded)}</strong>
                                                        <span>{formatDate(note.createdAt)}</span>
                                                    </div>
                                                    <span>Pedido #{note.order.id.slice(-6).toUpperCase()} • {note.order.items.length} itens</span>
                                                    {note.paidCents > 0 && (
                                                        <span style={{ color: '#047857', fontWeight: 600 }}>Parcialmente paga: {formatCurrency(note.paidCents)}</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {selectedNoteIds.size > 0 && (
                                <div className={styles.modalSection}>
                                    <h3>Valor a pagar</h3>
                                    <div className={styles.amountInputRow}>
                                        <input
                                            type="text"
                                            className={styles.amountInput}
                                            value={customAmountStr}
                                            onChange={(e) => setCustomAmountStr(e.target.value.replace(/[^0-9.,]/g, ''))}
                                            placeholder={`Ex: ${(selectedNotesTotalPendingCents / 100).toFixed(2).replace('.', ',')}`}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            Total selecionado: <strong>{formatCurrency(selectedNotesTotalPendingCents)}</strong>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <footer className={styles.modalFooter}>
                            {selectedNoteIds.size === 0 ? (
                                <div className={styles.emptySelectionWarning}>
                                    Selecione pelo menos uma notinha para prosseguir.
                                </div>
                            ) : (
                                <div className={styles.modalFooterActions}>
                                    {(['CASH', 'PIX', 'CARD'] as SettlementMethod[]).map((method) => (
                                        <button
                                            key={method}
                                            type="button"
                                            className={styles.actionBtn}
                                            onClick={() => settleBulk(method)}
                                            disabled={settlingId === 'bulk'}
                                        >
                                            {settlingId === 'bulk' ? 'Processando...' : SETTLEMENT_LABELS[method]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </footer>
                    </div>
                </div>
            )}
        </CashierLayout>
    );
}
