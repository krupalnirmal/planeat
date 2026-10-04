import { setRequestLocale } from 'next-intl/server';
import { VendorDetailScreen } from '@/components/admin/vendor-detail-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminVendorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <VendorDetailScreen vendorId={id} />;
}
