import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AdminLayout } from '../admin/AdminLayout';
import { useCashSession } from '../../hooks/useCashSession';
import {
    LogOut, Store, QrCode, ShoppingCart, Wallet, Lock,
    Menu, X, ChevronLeft, ChevronRight, NotebookText,
} from 'lucide-react';
import styles from '../../pages/admin/Admin.module.css';

interface CashierLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
}

export function CashierLayout({ children, title, subtitle }: CashierLayoutProps) {
    const { user } = useAuth();
    if (user?.role === 'ADMIN') {
        return <AdminLayout title={title} subtitle={subtitle}>{children}</AdminLayout>;
    }
    return <CashierLayoutInner title={title} subtitle={subtitle}>{children}</CashierLayoutInner>;
}

function CashierLayoutInner({ children, title, subtitle }: CashierLayoutProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, user } = useAuth();
    const { hasOpenSession, isLoading: isCashLoading } = useCashSession();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    const isActive = (path: string) => location.pathname === path;
    const go = (path: string) => { navigate(path); setIsMobileOpen(false); };

    return (
        <div className={`${styles.page} ${isCollapsed ? styles.pageCollapsed : ''}`}>
            {/* Mobile Header */}
            <header className={styles.mobileHeader}>
                <div className={styles.mobileLogo}>
                    <Store size={24} strokeWidth={3} />
                    <span>Caixa</span>
                </div>
                <button className={styles.menuBtn} onClick={() => setIsMobileOpen(o => !o)}>
                    {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {isMobileOpen && <div className={styles.overlay} onClick={() => setIsMobileOpen(false)} />}

            <aside className={`${styles.sidebar} ${isMobileOpen ? styles.sidebarMobileOpen : ''} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.logo}>
                        <Store size={isCollapsed ? 28 : 32} strokeWidth={3} />
                        {!isCollapsed && <span>Cantina</span>}
                    </div>
                    {!isCollapsed && <span className={styles.logoSub}>Operação de Caixa</span>}
                    {!isCollapsed && user && (
                        <span className={styles.logoSub} style={{ marginTop: '0.25rem', opacity: 0.7 }}>
                            {user.name}
                        </span>
                    )}
                </div>

                <nav className={styles.nav}>
                    {!isCollapsed && <p className={styles.navSection}>Operação</p>}
                    {isCollapsed && <div className={styles.navDivider} />}

                    <button className={`${styles.navBtn} ${isActive('/cashier/scan') ? styles.activeNav : ''}`}
                        onClick={() => go('/cashier/scan')} title="Scanner / Validação">
                        <QrCode size={20} />
                        {!isCollapsed && <span>Scanner / Validação</span>}
                    </button>

                    <button className={`${styles.navBtn} ${isActive('/cashier/counter') ? styles.activeNav : ''}`}
                        onClick={() => go('/cashier/counter')} title="Venda Balcão">
                        <ShoppingCart size={20} />
                        {!isCollapsed && <span>Venda Balcão</span>}
                    </button>

                    <button className={`${styles.navBtn} ${isActive('/cashier/credit-notes') ? styles.activeNav : ''}`}
                        onClick={() => go('/cashier/credit-notes')} title="Notinhas">
                        <NotebookText size={20} />
                        {!isCollapsed && <span>Notinhas</span>}
                    </button>

                    {!isCollapsed && <p className={styles.navSection}>Caixa</p>}
                    {isCollapsed && <div className={styles.navDivider} />}

                    {!isCashLoading && !hasOpenSession && (
                        <button className={`${styles.navBtn} ${isActive('/cashier/cash-open') ? styles.activeNav : ''}`}
                            onClick={() => go('/cashier/cash-open')} title="Abrir Caixa">
                            <Wallet size={20} />
                            {!isCollapsed && <span>Abrir Caixa</span>}
                        </button>
                    )}

                    {!isCashLoading && hasOpenSession && (
                        <button className={`${styles.navBtn} ${isActive('/cashier/cash-close') ? styles.activeNav : ''}`}
                            onClick={() => go('/cashier/cash-close')} title="Fechar Caixa">
                            <Lock size={20} />
                            {!isCollapsed && <span>Fechar Caixa</span>}
                        </button>
                    )}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button className={styles.logoutBtn}
                        onClick={async () => { await logout(); navigate('/login'); }}
                        title="Sair">
                        <LogOut size={18} />
                        {!isCollapsed && <span>Sair do Sistema</span>}
                    </button>
                    <button className={styles.collapseBtn} onClick={() => setIsCollapsed(c => !c)}
                        title={isCollapsed ? 'Expandir' : 'Recolher'}>
                        {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>
            </aside>

            <main className={styles.main}>
                <header className={styles.header}>
                    <div className={styles.titleBlock}>
                        <h1 className={styles.title}>{title}</h1>
                        <p className={styles.subtitle}>{subtitle ?? ''}</p>
                    </div>
                </header>
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
