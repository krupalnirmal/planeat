import { setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/admin-shell';
import { STORE_ROLES } from '@/lib/auth/session';
import { getSession } from '@/lib/auth/session';
import { redirect } from '@/i18n/navigation';

/**
 * Admin shell (M9).
 *
 * R10 — its own route group, so Next code-splits the whole panel away from the
 * customer bundle. Nothing under `components/admin/**` is imported by a
 * customer-facing component.
 *
 * R9 — the role check here is a CONVENIENCE, not the security boundary. It
 * redirects somebody who wandered in, so they see a login rather than an empty
 * dashboard. Every `/api/admin/*` route enforces the role itself, because a
 * layout check protects the page and not the data behind it.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();

  if (!session) {
    redirect({ href: '/login?next=/admin', locale });
  } else if (!STORE_ROLES.includes(session.role)) {
    redirect({ href: '/', locale });
  }

  return <AdminShell>{children}</AdminShell>;
}
