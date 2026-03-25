import {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
    useEffect,
} from 'react';

interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<AuthUser>;
    register: (name: string, email: string, password: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
    refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
    const err = await res.json().catch(() => ({}));
    return typeof err.message === 'string' ? err.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshSession = useCallback(async () => {
        const res = await fetch('/api/v1/auth/me', {
            method: 'GET',
            credentials: 'include',
        });

        if (res.status === 401) {
            setUser(null);
            return;
        }

        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Falha ao carregar sessao'));
        }

        const data = (await res.json()) as AuthUser;
        setUser(data);
    }, []);

    useEffect(() => {
        refreshSession()
            .catch((err) => {
                console.error('[Auth] Falha ao restaurar sessao', err);
                setUser(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [refreshSession]);

    const login = useCallback(async (email: string, password: string) => {
        const normalizedEmail = email.trim().toLowerCase();
        const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: normalizedEmail, password }),
        });

        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Credenciais invalidas'));
        }

        const data = (await res.json()) as { user: AuthUser };
        setUser(data.user);
        return data.user;
    }, []);

    const register = useCallback(async (name: string, email: string, password: string) => {
        const normalizedEmail = email.trim().toLowerCase();
        const res = await fetch('/api/v1/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, email: normalizedEmail, password }),
        });

        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Falha ao criar conta'));
        }

        const data = (await res.json()) as { user: AuthUser };
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await fetch('/api/v1/auth/logout', {
                method: 'POST',
                credentials: 'include',
            });
        } finally {
            setUser(null);
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshSession }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
    return ctx;
}
