import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { Store, QrCode, ClipboardList, ShoppingBag, PieChart, UtensilsCrossed, CheckCircle2, Bell } from 'lucide-react';
import styles from './DashboardPage.module.css';

const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Administrador',
    CASHIER: 'Caixa / Atendente',
    KITCHEN: 'Cozinha',
    CLIENT: 'Acadêmico',
};

export default function DashboardPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { permission, requestPermission } = useNotifications();

    async function handleLogout() {
        await logout();
        navigate('/login');
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerBrand}>
                    <UtensilsCrossed size={24} className={styles.headerIcon} />
                    <span className={styles.headerTitle}>Cantina</span>
                </div>
                <button className={styles.logoutBtn} onClick={handleLogout}>
                    Sair
                </button>
            </header>

            <main className={styles.main}>
                <div className={styles.welcomeCard}>
                    <div className={styles.avatar}>
                        {user?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h2 className={styles.userName}>Olá, {user?.name}!</h2>
                        <p className={styles.userRole}>
                            {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
                        </p>
                        <p className={styles.userEmail}>{user?.email}</p>
                    </div>
                </div>

                <div className={styles.statusCard}>
                    <CheckCircle2 size={20} className={styles.statusDot} color="#10b981" />
                    <p className={styles.statusText}>
                        <strong>Fase 0 concluída</strong> — Infra, autenticação e RBAC funcionando.
                        Os módulos de negócio serão desenvolvidos na Fase 1.
                    </p>
                </div>

                {/* Ações Rápidas por Perfil */}
                {user?.role === 'ADMIN' && (
                    <div className={styles.navGrid}>
                        <button className={styles.navBtn} onClick={() => navigate('/admin')}>
                            <PieChart size={40} color="var(--secondary)" strokeWidth={2.5} />
                            Painel Administrativo
                        </button>
                        <button className={styles.navBtn} onClick={() => navigate('/cashier/scan')}>
                            <QrCode size={40} color="var(--accent)" strokeWidth={2.5} />
                            Operar Caixa / PDV
                        </button>
                        <button className={styles.navBtn} onClick={() => navigate('/menu')}>
                            <ShoppingBag size={40} color="var(--primary)" strokeWidth={2.5} />
                            Catálogo (Modo Cliente)
                        </button>
                    </div>
                )}

                {user?.role === 'CASHIER' && (
                    <div className={styles.navGrid}>
                        <button className={styles.navBtn} onClick={() => navigate('/cashier/scan')}>
                            <QrCode size={40} color="var(--accent)" strokeWidth={2.5} />
                            Acessar Ponto de Venda
                        </button>
                        <button className={styles.navBtn} onClick={() => navigate('/cashier/cash-open')}>
                            <Store size={40} color="var(--secondary)" strokeWidth={2.5} />
                            Gestão de Caixa
                        </button>
                    </div>
                )}

                {user?.role === 'CLIENT' && (
                    <div className={styles.navGrid}>
                        <button className={styles.navBtn} onClick={() => navigate('/menu')}>
                            <ShoppingBag size={40} color="var(--primary)" strokeWidth={2.5} />
                            Fazer Novo Pedido
                        </button>
                        <button className={styles.navBtn} onClick={() => navigate('/orders')}>
                            <ClipboardList size={40} color="var(--secondary)" strokeWidth={2.5} />
                            Meus Pedidos
                        </button>
                    </div>
                )}

                {user?.role === 'CLIENT' && permission !== 'granted' && (
                    <div className={styles.statusCard} style={{ marginTop: '1rem', border: '1px solid var(--secondary)', background: 'rgba(212, 163, 115, 0.05)' }}>
                        <Bell size={24} color="var(--secondary)" strokeWidth={2.5} />
                        <div>
                            <p className={styles.statusText} style={{ color: 'var(--text-main)', fontWeight: 600 }}>Notificações Desativadas</p>
                            <p className={styles.statusText}>Habilite para ser avisado assim que seu Pedido Virtual ficar Pronto!</p>
                            <button
                                onClick={requestPermission}
                                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, background: 'var(--secondary)', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                                Habilitar Notificações
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
