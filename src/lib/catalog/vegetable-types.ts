import type { AppLocale } from '@/i18n/routing';

/**
 * Client-requested grouping for the Vegetables category page — a fixed list
 * rather than a free-text field so the page always renders these groups in
 * this order, and a typo in the seed data shows up as "ungrouped" instead of
 * a silent new group nobody asked for.
 */
export interface VegetableType {
  id: string;
  emoji: string;
  labelEn: string;
  labelMr: string;
  labelHi: string;
}

export const VEGETABLE_TYPES: VegetableType[] = [
  { id: 'leafy', emoji: '🥬', labelEn: 'Leafy Vegetables', labelMr: 'पालेभाज्या', labelHi: 'पत्तेदार सब्ज़ियाँ' },
  { id: 'root', emoji: '🥕', labelEn: 'Root Vegetables', labelMr: 'कंदमुळे', labelHi: 'जड़ वाली सब्ज़ियाँ' },
  { id: 'tuber', emoji: '🥔', labelEn: 'Tuber Vegetables', labelMr: 'कंद', labelHi: 'कंद वाली सब्ज़ियाँ' },
  { id: 'bulb', emoji: '🧅', labelEn: 'Bulb Vegetables', labelMr: 'कांदावर्गीय', labelHi: 'बल्ब वाली सब्ज़ियाँ' },
  { id: 'stem', emoji: '🌱', labelEn: 'Stem Vegetables', labelMr: 'खोडभाज्या', labelHi: 'तने वाली सब्ज़ियाँ' },
  { id: 'fruit', emoji: '🍅', labelEn: 'Fruit Vegetables', labelMr: 'फळभाज्या', labelHi: 'फल वाली सब्ज़ियाँ' },
  { id: 'pod', emoji: '🫘', labelEn: 'Pod & Legume Vegetables', labelMr: 'शेंगावर्गीय', labelHi: 'फली वाली सब्ज़ियाँ' },
  { id: 'flower', emoji: '🥦', labelEn: 'Flower Vegetables', labelMr: 'फुलभाज्या', labelHi: 'फूल वाली सब्ज़ियाँ' },
  { id: 'seed', emoji: '🌽', labelEn: 'Seed & Grain Vegetables', labelMr: 'बीजभाज्या', labelHi: 'बीज वाली सब्ज़ियाँ' },
];

export function vegetableTypeLabel(type: VegetableType, locale: AppLocale): string {
  if (locale === 'mr') return type.labelMr;
  if (locale === 'hi') return type.labelHi;
  return type.labelEn;
}
