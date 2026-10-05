import { setRequestLocale } from 'next-intl/server';
import { ComplaintDetailScreen } from '@/components/admin/complaint-detail-screen';

/** RBAC is enforced by the layout and by every API route. */
export default async function AdminComplaintDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <ComplaintDetailScreen complaintId={id} />;
}
