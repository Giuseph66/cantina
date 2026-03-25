import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface CartItem {
    productId: string;
    name: string;
    priceCents: number;
    qty: number;
}

interface CartContextValue {
    items: CartItem[];
    add: (item: Omit<CartItem, 'qty'>) => void;
    remove: (productId: string) => void;
    setQty: (productId: string, qty: number) => void;
    clear: () => void;
    totalCents: number;
    count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);

    const add = useCallback((item: Omit<CartItem, 'qty'>) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.productId === item.productId);
            if (existing) return prev.map((i) => i.productId === item.productId ? { ...i, qty: i.qty + 1 } : i);
            return [...prev, { ...item, qty: 1 }];
        });
    }, []);

    const remove = useCallback((productId: string) => {
        setItems((prev) => prev.filter((i) => i.productId !== productId));
    }, []);

    const setQty = useCallback((productId: string, qty: number) => {
        if (qty <= 0) { remove(productId); return; }
        setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, qty } : i));
    }, [remove]);

    const clear = useCallback(() => setItems([]), []);

    const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    const count = items.reduce((sum, i) => sum + i.qty, 0);

    return (
        <CartContext.Provider value={{ items, add, remove, setQty, clear, totalCents, count }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error('useCart deve ser usado dentro de CartProvider');
    return ctx;
}
