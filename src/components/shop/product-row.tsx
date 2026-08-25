/**
 * The single-variant-per-line shape shared by the category grid
 * (`product-card.tsx`), its size picker (`variant-picker-sheet.tsx`) and
 * the voice quantity-add sheet (`voice-quantity-sheet.tsx`).
 *
 * Used to live alongside a `ProductRow` list-row component here — the
 * category page's own row-plus-horizontal-chips layout (D-208 through
 * D-212). That layout was replaced by a Blinkit-matching 2-column grid of
 * `ProductCard`s (session 2026-08-25); this type is what's left of it.
 */
export interface ProductRowVariant {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  pricePaise: string;
  mrpPaise: string;
  stockQty: number;
  lowStockThreshold: number;
}
