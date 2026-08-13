import { db } from '@/lib/db';
import { getBalance } from '@/lib/wallet/ledger';
import type { UserRole } from '@/generated/prisma/enums';

/**
 * M9 — Customers: search, profile, health profile, orders, wallet ledger,
 * manual credit.
 *
 * S6 — the health profile is deliberately NOT part of the customer detail
 * payload. It is a separate call through `getHealthProfileAsAdmin`, which
 * writes an access log row before returning anything, and only a Super Admin
 * may make it. Folding it in here would mean every routine customer lookup
 * silently read sensitive medical data.
 */

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  orderCount: number;
  hasHealthProfile: boolean;
  hasActiveSubscription: boolean;
}

export async function searchCustomers(
  query: string | undefined,
  { skip, take }: { skip: number; take: number },
): Promise<{ customers: CustomerRow[]; total: number }> {
  const where = {
    role: { in: ['CUSTOMER', 'DELIVERY_PARTNER'] as UserRole[] },
    ...(query
      ? {
          OR: [{ phone: { contains: query } }, { name: { contains: query } }],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
        healthProfile: { select: { id: true } },
        subscriptions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      },
    }),
    db.user.count({ where }),
  ]);

  return {
    total,
    customers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
      orderCount: row._count.orders,
      // Whether one EXISTS, never its contents (S6).
      hasHealthProfile: row.healthProfile !== null,
      hasActiveSubscription: row.subscriptions.length > 0,
    })),
  };
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  preferredLanguage: string;
  createdAt: Date;
  walletBalancePaise: bigint;
  addresses: Array<{
    id: string;
    label: string;
    line1: string;
    city: string;
    pincode: string;
    isDefault: boolean;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalPaise: bigint;
    placedAt: Date;
  }>;
  walletTransactions: Array<{
    id: string;
    direction: string;
    amountPaise: bigint;
    source: string;
    balanceAfterPaise: bigint;
    note: string | null;
    createdAt: Date;
  }>;
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: Date;
    endDate: Date;
  }>;
  hasHealthProfile: boolean;
}

export async function getCustomerDetail(userId: string): Promise<CustomerDetail | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      isActive: true,
      preferredLanguage: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          label: true,
          line1: true,
          city: true,
          pincode: true,
          isDefault: true,
        },
      },
      orders: {
        orderBy: { placedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalPaise: true,
          placedAt: true,
        },
      },
      walletTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          direction: true,
          amountPaise: true,
          source: true,
          balanceAfterPaise: true,
          note: true,
          createdAt: true,
        },
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, startDate: true, endDate: true },
      },
      healthProfile: { select: { id: true } },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt,
    // R4 — derived from the ledger, exactly as the customer sees it.
    walletBalancePaise: await getBalance(user.id),
    addresses: user.addresses,
    recentOrders: user.orders,
    walletTransactions: user.walletTransactions,
    subscriptions: user.subscriptions,
    hasHealthProfile: user.healthProfile !== null,
  };
}
