import { setRequestLocale } from 'next-intl/server';
import { AdminOrderDetailScreen } from '@/components/admin/order-detail-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <AdminOrderDetailScreen orderId={id} />;
}
