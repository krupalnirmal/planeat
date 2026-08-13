import { setRequestLocale } from 'next-intl/server';
import { SmartListReview } from '@/components/smart-list/review-screen';

/**
 * M4's review screen: matched green, ambiguous amber with the top 3, unmatched
 * grey. Nothing reaches the cart without the customer seeing it first.
 */
export default async function SmartListReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <SmartListReview smartListId={id} />;
}
