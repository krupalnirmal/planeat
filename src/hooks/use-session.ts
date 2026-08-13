'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/**
 * The current user, or null for a guest.
 *
 * `/api/me` returns `{ user: null }` rather than a 401 for guests (B17 — the
 * whole catalogue is public), so this hook never surfaces an error state just
 * because somebody has not logged in.
 */

export interface SessionAddress {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface SessionUser {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  dob: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | null;
  role: 'GUEST' | 'CUSTOMER' | 'DELIVERY_PARTNER' | 'STORE_ADMIN' | 'SUPER_ADMIN';
  preferredLanguage: 'mr' | 'hi' | 'en';
  addresses: SessionAddress[];
}

export const SESSION_QUERY_KEY = ['session'] as const;

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<{ user: SessionUser | null }>('/api/me'),
    staleTime: 60_000,
  });

  return {
    user: query.data?.user ?? null,
    isLoggedIn: Boolean(query.data?.user),
    isLoading: query.isLoading,
    defaultAddress: query.data?.user?.addresses.find((a) => a.isDefault) ?? null,
  };
}

export function useInvalidateSession() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
}
