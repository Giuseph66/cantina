import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { Store, TrendingUp, ShoppingBag, XOctagon, Trophy } from 'lucide-react';
import { ReportCards } from '../../components/admin/ReportCards';
import { AdminLayout } from '../../components/admin/AdminLayout';
import styles from './Admin.module.css';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function AdminDashboard() {
    const api = useApi();
    const { user } = useAuth();

    const [report, setReport] = useState<any>(null);
    const [kpis, setKpis] = useState<any>(null);
    const [topItems, setTopItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get('/reports/daily'),
            api.get('/reports/kpis'),
            api.get('/reports/top-items')
        ])
            .then(([dailyData, kpisData, topItemsData]) => {
                setReport(dailyData);
                setKpis(kpisData);
                setTopItems(topItemsData as any[]);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <AdminLayout
            title="Dashboard"
            subtitle={`Bem-vindo de volta, ${user?.name}`}
        >
            <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Visão Geral (Hoje)</h2>
            </div>

            <ReportCards data={kpis} />

            <div className={styles.dashboardGrid}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}><Store size={20} /> Resumo de Hoje</h2>
                    </div>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <TrendingUp size={40} className={styles.pulse} />
                            <p>Carregando dados...</p>
                        </div>
                    ) : report ? (
                        <div className={styles.reportStats}>
                            <div className={styles.statHero}>
                                <div className={styles.statHeroIcon}>
                                    <TrendingUp size={32} strokeWidth={2.5} />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statLabel}>Vendas Totais (Pagas)</div>
                                    <div className={styles.statValue}>{formatCurrency(report.totalSalesCents)}</div>
                                </div>
                            </div>

                            <div className={styles.miniStatsGrid}>
                                <div className={styles.miniStat}>
                                    <div className={`${styles.miniStatIcon} ${styles.bgSecondary}`}>
                                        <ShoppingBag size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className={styles.miniStatInfo}>
                                        <span className={styles.miniStatValue}>{report.onlineOrders}</span>
                                        <span className={styles.miniStatLabel}>Pedidos no App</span>
                                    </div>
                                </div>
                                <div className={styles.miniStat}>
                                    <div className={`${styles.miniStatIcon} ${styles.bgPrimary}`}>
                                        <Store size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className={styles.miniStatInfo}>
                                        <span className={styles.miniStatValue}>{report.counterOrders}</span>
                                        <span className={styles.miniStatLabel}>Vendas Balcão</span>
                                    </div>
                                </div>
                                <div className={styles.miniStat}>
                                    <div className={`${styles.miniStatIcon} ${styles.bgDanger}`}>
                                        <XOctagon size={20} strokeWidth={2.5} />
                                    </div>
                                    <div className={styles.miniStatInfo}>
                                        <span className={`${styles.miniStatValue} ${styles.textDanger}`}>{report.expiredOrders}</span>
                                        <span className={styles.miniStatLabel}>Expirados</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.miniStatsGrid}>
                                {Object.entries(report.salesByMethod ?? {}).map(([method, amount]) => (
                                    <div key={method} className={styles.miniStat}>
                                        <div className={`${styles.miniStatIcon} ${styles.bgSecondary}`}>
                                            <Store size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className={styles.miniStatInfo}>
                                            <span className={styles.miniStatValue}>{formatCurrency(amount as number)}</span>
                                            <span className={styles.miniStatLabel}>{method}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>Erro ao carregar dados do dia.</p>
                        </div>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}>Sessões de Caixa (Hoje)</h2>
                    </div>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <p>Carregando sessões...</p>
                        </div>
                    ) : report?.sessions?.length > 0 ? (
                        <div className={styles.sessionList}>
                            {report.sessions.map((s: any) => (
                                <div key={s.id}>
                                    <div className={styles.sessionRow}>
                                        <div className={styles.sessionInfo}>
                                            <span className={s.closedAt ? styles.tagClosed : styles.tagOpen}>
                                                {s.closedAt ? 'FECHADO' : 'ABERTO'}
                                            </span>
                                            <span className={styles.sessionTime}>
                                                {new Date(s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {s.closedAt && (
                                            <div className={styles.sessionTotal}>
                                                {formatCurrency(s.closingCashCents)}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.sessionInfo} style={{ justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                                        <span className={styles.sessionTime}>{s.openedBy?.name ?? 'Operador'}</span>
                                        <span className={s.cashDifferenceCents === 0 ? styles.tagClosed : styles.tagOpen}>
                                            Dif.: {formatCurrency(s.cashDifferenceCents ?? 0)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>Nenhuma sessão de caixa aberta hoje.</p>
                        </div>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h2 className={styles.cardTitle}><Trophy size={20} /> Top Produtos Vendidos</h2>
                    </div>
                    {loading ? (
                        <div className={styles.loadingState}>
                            <p>Analisando vendas...</p>
                        </div>
                    ) : topItems?.length > 0 ? (
                        <div className={styles.topItemsList}>
                            {topItems.map((item: any, idx: number) => (
                                <div key={item.productId} className={styles.topItemRow}>
                                    <div className={styles.topItemInfo}>
                                        <span className={styles.topItemRank}>#{idx + 1}</span>
                                        <span className={styles.topItemName}>{item.name}</span>
                                    </div>
                                    <div className={styles.topItemStats}>
                                        <div className={styles.topItemQty}>{item.qtySold} un</div>
                                        <div className={styles.topItemRevenue}>{formatCurrency(item.revenueCents)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>Nenhuma venda registrada hoje.</p>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
