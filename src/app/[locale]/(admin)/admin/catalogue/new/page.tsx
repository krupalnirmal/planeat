import { setRequestLocale } from 'next-intl/server';
import { ProductFormScreen } from '@/components/admin/product-form-screen';

/** M9 admin section. RBAC is enforced by the layout and by every API route. */
export default async function AdminNewProductPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ProductFormScreen />;
}
