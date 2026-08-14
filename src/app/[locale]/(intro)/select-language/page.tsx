import { setRequestLocale } from 'next-intl/server';
import { SelectLanguageScreen } from '@/components/auth/select-language-screen';

export default async function SelectLanguagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SelectLanguageScreen />;
}
