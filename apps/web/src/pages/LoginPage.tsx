import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, ArrowRight, ChevronLeft } from 'lucide-react';
import styles from './LoginPage.module.css';
import { getDefaultRouteForRole } from '../utils/authRouting';

const FOOD_PHOTOS = [
    { src: '/images/login-assado.png',  alt: 'Assado' },
    { src: '/images/login-cafe.png',    alt: 'Café com Leite' },
    { src: '/images/login-misto.png',   alt: 'Misto Quente' },
    { src: '/images/login-burguer.png', alt: 'X-Burguer' },
];

export default function LoginPage() {
    const { login, user, isLoading } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        document.documentElement.style.overflowY = 'hidden';
        return () => { document.documentElement.style.overflowY = ''; };
    }, []);

    useEffect(() => {
        if (!isLoading && user) {
            navigate(getDefaultRouteForRole(user.role), { replace: true });
        }
    }, [isLoading, navigate, user]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const loggedUser = await login(email, password);
            navigate(getDefaultRouteForRole(loggedUser.role), { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Credenciais inválidas. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.card}>

                {/* ── Hero photo mosaic ────────────────────────── */}
                <div className={styles.cardHero}>
                    {FOOD_PHOTOS.map(photo => (
                        <div key={photo.alt} className={styles.heroCell}>
                            <img src={photo.src} alt={photo.alt} className={styles.heroCellImg} />
                        </div>
                    ))}
                    <div className={styles.heroOverlay} aria-hidden="true" />
                    <Link to="/" className={styles.mobileBack}>
                        <ChevronLeft size={18} />
                        <span>Voltar</span>
                    </Link>
                </div>

                {/* ── Form body ────────────────────────────────── */}
                <div className={styles.cardBody}>
                    <div className={styles.formHead}>
                        <h1 className={styles.formTitle}>
                            Entrar na Cantina<span className={styles.dot}>.</span>
                        </h1>
                        <p className={styles.formSub}>Acesse sua conta para fazer pedidos</p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form} noValidate>
                        <div className={styles.field}>
                            <label htmlFor="email" className={styles.label}>E-mail</label>
                            <input
                                id="email"
                                type="email"
                                className={styles.input}
                                placeholder="seu@email.com"
                                value={email}
                                onChange={e => setEmail(e.target.value.toLowerCase())}
                                required
                                autoComplete="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="password" className={styles.label}>Senha</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className={styles.input}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className={styles.eyeBtn}
                                    onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className={styles.error} role="alert">{error}</div>
                        )}

                        <button type="submit" className={styles.button} disabled={loading}>
                            {loading
                                ? <span className={styles.spinner} />
                                : <><span>Entrar</span><ArrowRight size={18} /></>
                            }
                        </button>
                    </form>

                    <div className={styles.footer}>
                        <p className={styles.registerHint}>
                            Não tem conta?{' '}
                            <Link to="/register" className={styles.registerLink}>Criar conta grátis</Link>
                        </p>
                        <Link to="/" className={styles.backLink}>
                            <ChevronLeft size={15} />
                            <span>Ver cardápio</span>
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}
