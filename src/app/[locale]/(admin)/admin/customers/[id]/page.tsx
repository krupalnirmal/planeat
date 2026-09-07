import { setRequestLocale } from 'next-intl/server';
import { CustomerDetailScreen } from '@/components/admin/customer-detail-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <CustomerDetailScreen customerId={id} />;
}
