import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Eye, EyeOff, ChevronLeft } from 'lucide-react';
import styles from './LoginPage.module.css';

const FOOD_PHOTOS = [
    { src: '/images/login-assado.png',  alt: 'Assado' },
    { src: '/images/login-cafe.png',    alt: 'Café com Leite' },
    { src: '/images/login-misto.png',   alt: 'Misto Quente' },
    { src: '/images/login-burguer.png', alt: 'X-Burguer' },
];

export default function RegisterPage() {
    const { register, user, isLoading } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        document.documentElement.style.overflowY = 'hidden';
        return () => { document.documentElement.style.overflowY = ''; };
    }, []);

    useEffect(() => {
        if (!isLoading && user) {
            navigate('/pedido', { replace: true });
        }
    }, [isLoading, navigate, user]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('As senhas não conferem');
            return;
        }

        setLoading(true);
        try {
            await register(name, email, password);
            navigate('/pedido');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar conta');
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
                    <Link to="/login" className={styles.mobileBack}>
                        <ChevronLeft size={18} />
                        <span>Voltar</span>
                    </Link>
                </div>

                {/* ── Form body ────────────────────────────────── */}
                <div className={styles.cardBody}>
                    <div className={styles.formHead}>
                        <h1 className={styles.formTitle}>
                            Criar conta<span className={styles.dot}>.</span>
                        </h1>
                        <p className={styles.formSub}>Cadastro gratuito para acompanhar seus pedidos</p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form} noValidate>
                        <div className={styles.field}>
                            <label htmlFor="name" className={styles.label}>Nome</label>
                            <input
                                id="name"
                                type="text"
                                className={styles.input}
                                placeholder="Seu nome completo"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                autoComplete="name"
                            />
                        </div>

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
                                    placeholder="Mínimo 6 caracteres"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                                <button type="button" className={styles.eyeBtn}
                                    onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="confirmPassword" className={styles.label}>Confirmar Senha</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className={styles.input}
                                    placeholder="Repita sua senha"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete="new-password"
                                />
                                <button type="button" className={styles.eyeBtn}
                                    onClick={() => setShowConfirmPassword(v => !v)}
                                    aria-label={showConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}>
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className={styles.error} role="alert">{error}</div>
                        )}

                        <button type="submit" className={styles.button} disabled={loading}>
                            {loading
                                ? <span className={styles.spinner} />
                                : <><span>Criar conta</span><ArrowRight size={18} /></>
                            }
                        </button>
                    </form>

                    <div className={styles.footer}>
                        <p className={styles.registerHint}>
                            Já tem conta?{' '}
                            <Link to="/login" className={styles.registerLink}>Entrar agora</Link>
                        </p>
                        <Link to="/login" className={styles.backLink}>
                            <ChevronLeft size={15} />
                            <span>Voltar</span>
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}
