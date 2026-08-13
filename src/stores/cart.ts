'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The GUEST cart (M3).
 *
 * B17 lets people browse and fill a cart before logging in, so a guest needs
 * somewhere to put quantities. At login these lines are handed to
 * `POST /api/cart/merge` and this store is cleared; from then on the server
 * cart is authoritative.
 *
 * Components never import this directly — they use `useCart()`, which routes
 * to the server cart or to this one. Quantities only, no prices: money is
 * recomputed server-side at checkout, so a stale localStorage price can never
 * become the price charged (R4).
 */

export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  /** Set once the store has rehydrated, so SSR and the client agree. */
  hydrated: boolean;

  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  increment: (variantId: string) => void;
  decrement: (variantId: string) => void;
  remove: (variantId: string) => void;
  clear: () => void;

  quantityOf: (variantId: string) => number;
  totalItems: () => number;
}

const MAX_PER_LINE = 20;

export const useGuestCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      hydrated: false,

      add: (line, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.variantId === line.variantId);
          if (!existing) {
            return { lines: [...state.lines, { ...line, quantity }] };
          }
          return {
            lines: state.lines.map((l) =>
              l.variantId === line.variantId
                ? { ...l, quantity: Math.min(MAX_PER_LINE, l.quantity + quantity) }
                : l,
            ),
          };
        }),

      setQuantity: (variantId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.variantId !== variantId)
              : state.lines.map((l) =>
                  l.variantId === variantId
                    ? { ...l, quantity: Math.min(MAX_PER_LINE, quantity) }
                    : l,
                ),
        })),

      increment: (variantId) => get().setQuantity(variantId, get().quantityOf(variantId) + 1),
      decrement: (variantId) => get().setQuantity(variantId, get().quantityOf(variantId) - 1),
      remove: (variantId) => get().setQuantity(variantId, 0),
      clear: () => set({ lines: [] }),

      quantityOf: (variantId) =>
        get().lines.find((l) => l.variantId === variantId)?.quantity ?? 0,

      totalItems: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    {
      name: 'planeat.cart.v1',
      partialize: (state) => ({ lines: state.lines }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
