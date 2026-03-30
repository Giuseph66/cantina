import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { getDefaultRouteForRole } from '../utils/authRouting';
import { Search, ShoppingBag, User, Store, LogOut } from 'lucide-react';
import styles from './Header.module.css';

function formatCurrency(cents: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function Header() {
    const { user, logout } = useAuth();
    const { count, totalCents, clear } = useCart();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const searchTerm = searchParams.get('s') || '';

    const handleSearchChange = (val: string) => {
        if (val) {
            setSearchParams({ s: val });
        } else {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('s');
            setSearchParams(nextParams);
        }

        // Se não estiver na home, navega para lá para mostrar os resultados
        if (window.location.pathname !== '/') {
            navigate(`/?s=${encodeURIComponent(val)}`);
        }
    };

    const handleLogout = async () => {
        await logout();
        clear();
        navigate('/');
    };

    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <Link to="/" className={styles.logo}>
                    <div className={styles.logoIconWrapper}>
                        <Store className={styles.logoIcon} size={20} />
                    </div>
                    <span className={styles.logoText}>Cantina</span>
                </Link>

                <div className={styles.searchBar}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Buscar lanches, bebidas..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                </div>

                <div className={styles.headerActions}>
                    {!user ? (
                        <Link to="/login" className={styles.loginBtn}>
                            <User size={18} />
                            <span>Entrar</span>
                        </Link>
                    ) : (
                        <div className={styles.userProfile}>
                            <div className={styles.avatar}>
                                {user.name ? user.name.charAt(0).toUpperCase() : <User size={18} />}
                            </div>
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>{user.name?.split(' ')[0] || 'Usuário'}</span>
                                <div className={styles.userActions}>
                                    <Link to={getDefaultRouteForRole(user.role)} className={styles.painelLink}>Painel</Link>
                                    <button onClick={handleLogout} className={styles.logoutBtn} title="Sair">
                                        <LogOut size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <button className={styles.cartBtn} onClick={() => navigate('/pedido')}>
                        <div className={styles.cartIconWrapper}>
                            <ShoppingBag size={20} />
                            {count > 0 && <span className={styles.cartBadge}>{count}</span>}
                        </div>
                        <span className={styles.cartTotal}>{formatCurrency(totalCents)}</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
