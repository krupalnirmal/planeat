import { setRequestLocale } from 'next-intl/server';
import { ProductFormScreen } from '@/components/admin/product-form-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <ProductFormScreen productId={id} />;
}
