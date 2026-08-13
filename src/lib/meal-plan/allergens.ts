import { normaliseSearchText } from '@/lib/catalog/text';
import {
  ALLERGENS,
  JAIN_EXCLUDED_TAGS,
  JAIN_EXCLUDED_TERMS,
  allergenByCode,
  type AllergenDefinition,
} from './taxonomy';

/**
 * S4 — the allergen hard-block.
 *
 *   "Code-level guarantee, not a prompt-level hope. A plan containing a
 *    declared allergen must never be persisted or shown."
 *
 * Two layers, because neither is reliable alone:
 *
 *   1. **Structured tags.** Depends on the catalogue being tagged correctly,
 *      which depends on whoever added the product.
 *   2. **Text matching** over names, aliases and keywords in all three
 *      languages. Depends on spelling.
 *
 * And one rule that matters more than either: **fail closed**. If a declared
 * allergy cannot be resolved to a known allergen, it is still matched as free
 * text. Dropping a safe vegetable costs the customer one boring day; serving
 * an allergen can put them in hospital.
 */

export interface AllergenCheckable {
  id: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  /** `products.tags`, a JSON array in the database. */
  tags: unknown;
  searchKeywords?: string | null;
  /** Aliases from `product_aliases`, when the caller has loaded them. */
  aliases?: readonly string[];
}

function tagList(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.toLowerCase().trim());
}

/** Everything about a product that a term could legitimately match. */
function searchableText(product: AllergenCheckable): string {
  return normaliseSearchText(
    [
      product.nameEn,
      product.nameMr,
      product.nameHi,
      product.searchKeywords ?? '',
      ...(product.aliases ?? []),
    ].join(' '),
  );
}

function matchesDefinition(
  product: AllergenCheckable,
  definition: AllergenDefinition,
  tags: string[],
  text: string,
): boolean {
  if (definition.tags.some((tag) => tags.includes(tag.toLowerCase()))) return true;
  return definition.terms.some((term) => text.includes(normaliseSearchText(term)));
}

/**
 * Free-text allergies ("मला शेंगदाणे चालत नाहीत", "no cashews") that did not
 * map to a known allergen code. Matched directly, word by word.
 */
function matchesFreeText(text: string, rawAllergy: string): boolean {
  const words = normaliseSearchText(rawAllergy)
    .split(' ')
    // Single characters and very short fragments would match half the
    // catalogue; two characters is the shortest meaningful Devanagari root.
    .filter((word) => word.length > 1);

  return words.some((word) => text.includes(word));
}

export interface AllergenMatch {
  productId: string;
  /** The allergen code, or `FREE_TEXT:<what they typed>`. */
  matched: string;
}

/**
 * Returns every allergen the declared list finds in this product. An empty
 * array means the product is safe *as far as we can tell*, which combined with
 * fail-closed matching is the strongest claim available.
 */
export function findAllergensIn(
  product: AllergenCheckable,
  declaredAllergies: readonly string[],
): AllergenMatch[] {
  if (declaredAllergies.length === 0) return [];

  const tags = tagList(product.tags);
  const text = searchableText(product);
  const matches: AllergenMatch[] = [];

  for (const declared of declaredAllergies) {
    const trimmed = declared.trim();
    if (trimmed.length === 0) continue;

    const definition = allergenByCode(trimmed.toUpperCase());

    if (definition) {
      if (matchesDefinition(product, definition, tags, text)) {
        matches.push({ productId: product.id, matched: definition.code });
      }
      continue;
    }

    // Unknown code or free text. Try every known allergen's terms first — a
    // customer typing "peanuts" should hit the PEANUT definition and all its
    // synonyms, not only the literal word they typed.
    const viaTerms = ALLERGENS.find((candidate) =>
      candidate.terms.some((term) => normaliseSearchText(trimmed).includes(normaliseSearchText(term))),
    );

    if (viaTerms) {
      if (matchesDefinition(product, viaTerms, tags, text)) {
        matches.push({ productId: product.id, matched: viaTerms.code });
      }
      continue;
    }

    // Still unresolved: match what they wrote, literally. Fail closed.
    if (matchesFreeText(text, trimmed)) {
      matches.push({ productId: product.id, matched: `FREE_TEXT:${trimmed}` });
    }
  }

  return matches;
}

export function containsAllergen(
  product: AllergenCheckable,
  declaredAllergies: readonly string[],
): boolean {
  return findAllergensIn(product, declaredAllergies).length > 0;
}

/**
 * Jain diets exclude root vegetables. Not an allergy, but just as absolute to
 * the person who holds it, so it is filtered in code rather than left to the
 * prompt to remember.
 */
export function isJainExcluded(product: AllergenCheckable): boolean {
  const tags = tagList(product.tags);
  if (JAIN_EXCLUDED_TAGS.some((tag) => tags.includes(tag))) return true;

  const text = searchableText(product);
  return JAIN_EXCLUDED_TERMS.some((term) => text.includes(normaliseSearchText(term)));
}

/** Vegan diets exclude anything from an animal. */
export function isVeganExcluded(product: AllergenCheckable): boolean {
  const tags = tagList(product.tags);
  if (tags.includes('dairy') || tags.includes('animal')) return true;

  const text = searchableText(product);
  return ['milk', 'curd', 'paneer', 'ghee', 'butter', 'honey', 'दूध', 'दही', 'पनीर', 'तूप', 'मध'].some(
    (term) => text.includes(normaliseSearchText(term)),
  );
}
