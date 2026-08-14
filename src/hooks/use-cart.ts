'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { useSession } from '@/hooks/use-session';
import { api, qs } from '@/lib/api/client';
import { useGuestCart } from '@/stores/cart';

/**
 * The one cart the UI talks to (M3).
 *
 * Logged in → the server cart, so it survives a reinstall and follows the
 * customer between devices. Guest → localStorage, because B17 lets people
 * browse and fill a cart before committing to a login.
 *
 * Components should not know which of the two they are using. They call
 * `add`, `increment`, `decrement` and read `quantityOf`, and this hook routes
 * it. The guest lines are handed to `POST /api/cart/merge` at login.
 */

export interface CartLineView {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  imageUrl: string | null;
  variantLabel: string;
  quantity: number;
  unitQuantity: number;
  unit: string;
  /** Money crosses JSON as a decimal string (R4). */
  unitPricePaise: string;
  mrpPaise: string;
  linePaise: string;
  availableQty: number;
  inStock: boolean;
  isActive: boolean;
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  itemCount: number;
  itemTotalPaise: string;
}

export const CART_QUERY_KEY = ['cart'] as const;

export function useCart() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { isLoggedIn } = useSession();

  const guestLines = useGuestCart((s) => s.lines);
  const guestAdd = useGuestCart((s) => s.add);
  const guestSetQuantity = useGuestCart((s) => s.setQuantity);

  const serverCart = useQuery({
    queryKey: [...CART_QUERY_KEY, locale],
    queryFn: () =>
      api.get<{ cart: CartView; amountForFreeDeliveryPaise: string }>(
        `/api/cart${qs({ locale })}`,
      ),
    enabled: isLoggedIn,
    staleTime: 10_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: (input: { variantId: string; quantity: number }) =>
      api.post<{ cart: CartView }>(`/api/cart/items${qs({ locale })}`, input),
    onSuccess: (data) => {
      queryClient.setQueryData([...CART_QUERY_KEY, locale], data);
    },
    onError: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { lineId: string; quantity: number }) =>
      api.patch<{ cart: CartView }>(`/api/cart/items/${input.lineId}${qs({ locale })}`, {
        quantity: input.quantity,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData([...CART_QUERY_KEY, locale], data);
    },
    onError: invalidate,
  });

  // Memoised: a fresh array on every render would change the identity of every
  // callback below it, re-rendering every product card in the grid.
  const lines: CartLineView[] = useMemo(
    () =>
      isLoggedIn
        ? (serverCart.data?.cart.lines ?? [])
        : // A guest cart holds quantities only; the catalogue supplies the
          // rest, so these placeholder fields are never rendered before login.
          guestLines.map((line) => ({
            id: line.variantId,
            productId: line.productId,
            variantId: line.variantId,
            name: '',
            imageUrl: null,
            variantLabel: '',
            quantity: line.quantity,
            unitQuantity: 0,
            unit: 'G',
            unitPricePaise: '0',
            mrpPaise: '0',
            linePaise: '0',
            availableQty: line.quantity,
            inStock: true,
            isActive: true,
          })),
    [isLoggedIn, serverCart.data, guestLines],
  );

  const quantityOf = useCallback(
    (variantId: string) => lines.find((line) => line.variantId === variantId)?.quantity ?? 0,
    [lines],
  );

  const lineFor = useCallback(
    (variantId: string) => lines.find((line) => line.variantId === variantId) ?? null,
    [lines],
  );

  const add = useCallback(
    (input: { productId: string; variantId: string; quantity?: number }) => {
      const quantity = input.quantity ?? 1;
      if (isLoggedIn) {
        addMutation.mutate({ variantId: input.variantId, quantity });
      } else {
        guestAdd({ productId: input.productId, variantId: input.variantId }, quantity);
      }
    },
    [isLoggedIn, addMutation, guestAdd],
  );

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      if (isLoggedIn) {
        const line = lineFor(variantId);
        if (!line) return;
        updateMutation.mutate({ lineId: line.id, quantity });
      } else {
        guestSetQuantity(variantId, quantity);
      }
    },
    [isLoggedIn, lineFor, updateMutation, guestSetQuantity],
  );

  const increment = useCallback(
    (variantId: string) => setQuantity(variantId, quantityOf(variantId) + 1),
    [setQuantity, quantityOf],
  );

  const decrement = useCallback(
    (variantId: string) => setQuantity(variantId, quantityOf(variantId) - 1),
    [setQuantity, quantityOf],
  );

  const remove = useCallback((variantId: string) => setQuantity(variantId, 0), [setQuantity]);

  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    itemTotalPaise: isLoggedIn ? (serverCart.data?.cart.itemTotalPaise ?? '0') : '0',
    /** B10, computed server-side — 0 once free delivery is already earned. */
    amountForFreeDeliveryPaise: isLoggedIn
      ? (serverCart.data?.amountForFreeDeliveryPaise ?? '0')
      : '0',
    isLoading: isLoggedIn && serverCart.isLoading,
    isMutating: addMutation.isPending || updateMutation.isPending,
    quantityOf,
    add,
    setQuantity,
    increment,
    decrement,
    remove,
    refetch: invalidate,
  };
}
