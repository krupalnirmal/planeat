import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffOf } from '@/lib/admin/audit';
import { suggestRiders } from '@/lib/admin/orders';
import { buildPicklist, defaultPicklistDate, picklistToCsv, type Picklist } from '@/lib/admin/picklist';
import { SETTING_DESCRIPTORS } from '@/lib/admin/settings';
import { SETTING_KEYS } from '@/lib/settings';

/**
 * M9's pure pieces, plus the two queries whose real logic is aggregation and
 * ranking rather than SQL — `buildPicklist` and `suggestRiders` are exercised
 * here against a mocked `db`, so the arithmetic that decides what the owner
 * buys and who a delivery goes to is pinned without a real database.
 */

const dbMock = vi.hoisted(() => ({
  order: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  deliveryPartner: { findMany: vi.fn() },
  deliveryAssignment: { groupBy: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));

describe('audit diffs', () => {
  it('records only what actually changed', () => {
    // A price change buried in twenty unchanged columns is a diff nobody reads.
    const before = { pricePaise: 2500, stockQty: 40, isActive: true, label: '500 g' };
    const diff = diffOf(before, { pricePaise: 4000, stockQty: 40 });

    expect(diff.before).toEqual({ pricePaise: 2500 });
    expect(diff.after).toEqual({ pricePaise: 4000 });
  });

  it('ignores undefined fields rather than recording them as changes', () => {
    const diff = diffOf({ a: 1, b: 2 }, { a: undefined, b: 3 });
    expect(diff.after).toEqual({ b: 3 });
  });

  it('produces an empty diff when nothing moved', () => {
    const diff = diffOf({ stockQty: 40 }, { stockQty: 40 });
    expect(Object.keys(diff.after)).toHaveLength(0);
  });

  it('compares by value, so a numeric string does not read as a change', () => {
    const diff = diffOf({ stockQty: 40 }, { stockQty: '40' as unknown as number });
    expect(Object.keys(diff.after)).toHaveLength(0);
  });
});

describe('picklist CSV', () => {
  const picklist: Picklist = {
    dateKey: '2026-08-12',
    orderCount: 3,
    shortfallCount: 1,
    slips: [],
    lines: [
      {
        productId: 'prd_spinach',
        variantId: 'var_1',
        name: 'पालक',
        totalQuantity: 12,
        unit: 'BUNCH',
        orderCount: 12,
        displayQuantity: '12 bunch',
        stockQty: 8,
        shortfall: 4,
      },
      {
        productId: 'prd_tomato',
        variantId: 'var_2',
        name: 'टोमॅटो, मोठे',
        totalQuantity: 8000,
        unit: 'G',
        orderCount: 6,
        displayQuantity: '8 kg',
        stockQty: 20000,
        shortfall: 0,
      },
    ],
  };

  it('starts with a UTF-8 BOM', () => {
    // Without it, Excel on Windows renders every Marathi vegetable name as
    // mojibake — which makes the export useless for exactly the person it is
    // for.
    expect(picklistToCsv(picklist).charCodeAt(0)).toBe(0xfeff);
  });

  it('keeps Marathi names intact', () => {
    expect(picklistToCsv(picklist)).toContain('पालक');
  });

  it('quotes a name containing a comma so the columns do not shift', () => {
    expect(picklistToCsv(picklist)).toContain('"टोमॅटो, मोठे"');
  });

  it('uses CRLF line endings, which is what Excel expects', () => {
    expect(picklistToCsv(picklist)).toContain('\r\n');
  });

  it('carries the shortfall, so the owner knows what to buy extra', () => {
    const csv = picklistToCsv(picklist);
    const spinachRow = csv.split('\r\n').find((row) => row.includes('पालक'));
    expect(spinachRow).toContain(',4');
  });

  it('has a header row plus one row per line', () => {
    const rows = picklistToCsv(picklist).trim().split('\r\n');
    expect(rows).toHaveLength(3);
  });

  it('escapes an embedded double quote', () => {
    const csv = picklistToCsv({
      ...picklist,
      lines: [{ ...picklist.lines[0], name: 'Spinach "large"' }],
    });
    expect(csv).toContain('"Spinach ""large"""');
  });
});

describe('daily picklist aggregation', () => {
  beforeEach(() => {
    dbMock.order.findMany.mockReset();
    dbMock.product.findMany.mockReset();
  });

  it('sums the same variant across orders in the VARIANT unit, and flags the shortfall', async () => {
    dbMock.order.findMany.mockResolvedValue([
      {
        id: 'ord_1',
        orderNumber: 'AC-260812-AAAAAA',
        addressSnapshot: { line1: '12 Station Rd', city: 'Pathardi', pincode: '414102' },
        deliverySlot: 'SUBSCRIPTION_0630_0900',
        totalPaise: 5000n,
        paymentMethod: 'WALLET',
        paymentStatus: 'PAID',
        notes: null,
        user: { name: 'सुनिता पवार', phone: '9999900002' },
        assignment: null,
        items: [
          {
            productId: 'prd_spinach',
            variantId: 'var_spinach_250',
            nameSnapshot: 'पालक',
            quantity: 2,
            mealSlot: 'MORNING',
            isSubstituted: false,
            originalProductId: null,
            variant: {
              quantity: 250,
              unit: 'G',
              stockQty: 1,
              product: { nameEn: 'Spinach', nameMr: 'पालक', nameHi: 'पालक' },
            },
          },
        ],
      },
      {
        id: 'ord_2',
        orderNumber: 'AC-260812-BBBBBB',
        addressSnapshot: { line1: '4 Market Yard', city: 'Pathardi', pincode: '414102' },
        deliverySlot: 'SUBSCRIPTION_0630_0900',
        totalPaise: 3000n,
        paymentMethod: 'WALLET',
        paymentStatus: 'PAID',
        notes: null,
        user: { name: 'राज शिंदे', phone: '9999900003' },
        assignment: null,
        items: [
          {
            productId: 'prd_spinach',
            variantId: 'var_spinach_250',
            nameSnapshot: 'पालक',
            quantity: 1,
            mealSlot: 'EVENING',
            isSubstituted: false,
            originalProductId: null,
            variant: {
              quantity: 250,
              unit: 'G',
              stockQty: 1,
              product: { nameEn: 'Spinach', nameMr: 'पालक', nameHi: 'पालक' },
            },
          },
        ],
      },
    ]);

    const picklist = await buildPicklist('2026-08-12', 'mr');

    // 2 × 250g + 1 × 250g = 750g total, across 2 orders — "four times five
    // hundred grams" is never what the owner reads at the mandi.
    expect(picklist.lines).toHaveLength(1);
    expect(picklist.lines[0].totalQuantity).toBe(750);
    expect(picklist.lines[0].orderCount).toBe(2);
    expect(picklist.lines[0].displayQuantity).toContain('750');

    // Stock is recorded once per variant (1 unit × 250g = 250g in shop), so
    // 750g needed − 250g in stock leaves a 500g shortfall.
    expect(picklist.lines[0].shortfall).toBe(500);
    expect(picklist.shortfallCount).toBe(1);
  });

  it('groups packing-slip items under morning/evening, per B1', async () => {
    dbMock.order.findMany.mockResolvedValue([
      {
        id: 'ord_1',
        orderNumber: 'AC-260812-AAAAAA',
        addressSnapshot: { line1: '12 Station Rd', city: 'Pathardi', pincode: '414102' },
        deliverySlot: 'SUBSCRIPTION_0630_0900',
        totalPaise: 5000n,
        paymentMethod: 'WALLET',
        paymentStatus: 'PAID',
        notes: null,
        user: { name: 'सुनिता पवार', phone: '9999900002' },
        assignment: null,
        items: [
          {
            productId: 'prd_spinach',
            variantId: 'var_spinach_250',
            nameSnapshot: 'पालक',
            quantity: 1,
            mealSlot: 'MORNING',
            isSubstituted: false,
            originalProductId: null,
            variant: {
              quantity: 250,
              unit: 'G',
              stockQty: 10,
              product: { nameEn: 'Spinach', nameMr: 'पालक', nameHi: 'पालक' },
            },
          },
          {
            productId: 'prd_capsicum',
            variantId: 'var_capsicum_250',
            nameSnapshot: 'ढोबळी मिरची',
            quantity: 1,
            mealSlot: 'EVENING',
            isSubstituted: true,
            originalProductId: 'prd_peanut',
            variant: {
              quantity: 250,
              unit: 'G',
              stockQty: 10,
              product: { nameEn: 'Capsicum', nameMr: 'ढोबळी मिरची', nameHi: 'शिमला मिर्च' },
            },
          },
        ],
      },
    ]);
    dbMock.product.findMany.mockResolvedValue([
      { id: 'prd_peanut', nameEn: 'Groundnut', nameMr: 'शेंगदाणे', nameHi: 'मूंगफली' },
    ]);

    const picklist = await buildPicklist('2026-08-12', 'mr');
    const [slip] = picklist.slips;

    expect(slip.morning).toHaveLength(1);
    expect(slip.morning[0].name).toBe('पालक');
    expect(slip.evening).toHaveLength(1);
    // A substitution carries the ORIGINAL product's name, in the requested
    // locale, so the packer knows what it replaced.
    expect(slip.evening[0].isSubstituted).toBe(true);
    expect(slip.evening[0].originalName).toBe('शेंगदाणे');
  });
});

describe('B12 rider suggestion — suggests, never assigns', () => {
  beforeEach(() => {
    dbMock.order.findMany.mockReset();
    dbMock.deliveryPartner.findMany.mockReset();
    dbMock.deliveryAssignment.groupBy.mockReset();
  });

  it('prefers a rider in the same service area, and spreads load within one run', async () => {
    dbMock.order.findMany.mockResolvedValue([
      {
        id: 'ord_1',
        orderNumber: 'AC-260812-AAAAAA',
        addressSnapshot: { pincode: '414102' },
      },
      {
        id: 'ord_2',
        orderNumber: 'AC-260812-BBBBBB',
        // No rider serves this pincode — falls back to the whole pool.
        addressSnapshot: { pincode: '999999' },
      },
    ]);
    dbMock.deliveryPartner.findMany.mockResolvedValue([
      {
        id: 'dpt_ramesh',
        serviceArea: { pincode: '414102' },
        user: { name: 'Ramesh', phone: '9999911111' },
      },
      {
        id: 'dpt_suresh',
        serviceArea: { pincode: '414103' },
        user: { name: 'Suresh', phone: '9999922222' },
      },
    ]);
    // Ramesh already has 3 deliveries today; Suresh has none.
    dbMock.deliveryAssignment.groupBy.mockResolvedValue([
      { partnerId: 'dpt_ramesh', _count: { partnerId: 3 } },
    ]);

    const suggestions = await suggestRiders('2026-08-12');

    // Order 1's pincode only Ramesh covers — same-area wins even though he is
    // the busier rider; "an available rider in the order's area" is the rule.
    expect(suggestions[0].suggestedPartnerId).toBe('dpt_ramesh');
    expect(suggestions[0].rationale).toBe('SAME_AREA_LIGHTEST_LOAD');

    // Order 2 has no area match, so it falls back to the lightest-load rider
    // across everyone — and by now Ramesh's projected load (4) is heavier
    // than Suresh's (0), so the second order does not pile onto the first.
    expect(suggestions[1].suggestedPartnerId).toBe('dpt_suresh');
    expect(suggestions[1].rationale).toBe('LIGHTEST_LOAD');
  });

  it('reports NO_RIDER_AVAILABLE rather than guessing when nobody is available', async () => {
    dbMock.order.findMany.mockResolvedValue([
      { id: 'ord_1', orderNumber: 'AC-260812-AAAAAA', addressSnapshot: { pincode: '414102' } },
    ]);
    dbMock.deliveryPartner.findMany.mockResolvedValue([]);
    dbMock.deliveryAssignment.groupBy.mockResolvedValue([]);

    const [suggestion] = await suggestRiders('2026-08-12');

    expect(suggestion.suggestedPartnerId).toBeNull();
    expect(suggestion.rationale).toBe('NO_RIDER_AVAILABLE');
  });
});

describe('picklist default date', () => {
  it('defaults to tomorrow in IST, since the list is prepared the evening before', () => {
    // 2026-08-12 01:00 IST — comfortably inside the "prepare tonight" window.
    const now = new Date('2026-08-11T19:30:00.000Z');
    expect(defaultPicklistDate(now)).toBe('2026-08-13');
  });
});

describe('settings descriptors (R8)', () => {
  it('covers every business number the app reads', () => {
    // R8 — "Every fee, threshold, portion size, duration and limit is seeded
    // into app_settings and editable from the admin panel at runtime." A key
    // the code reads but the panel cannot edit is a hard-coded number wearing
    // a disguise.
    const described = new Set(SETTING_DESCRIPTORS.map((entry) => entry.key));

    for (const key of Object.values(SETTING_KEYS)) {
      expect(described.has(key), `${key} is not editable from the admin panel`).toBe(true);
    }
  });

  it('gives every setting a type, so a fee cannot be saved as a word', () => {
    for (const descriptor of SETTING_DESCRIPTORS) {
      expect(['paise', 'number', 'boolean', 'string', 'number-list']).toContain(descriptor.type);
    }
  });

  it('cites the brief rule each number comes from', () => {
    for (const descriptor of SETTING_DESCRIPTORS) {
      expect(descriptor.reference.length).toBeGreaterThan(0);
    }
  });

  it('types every money setting as paise', () => {
    const moneyKeys = SETTING_DESCRIPTORS.filter((entry) => entry.key.endsWith('_paise'));
    expect(moneyKeys.length).toBeGreaterThan(0);
    for (const descriptor of moneyKeys) {
      expect(descriptor.type).toBe('paise');
    }
  });

  it('has no duplicate keys', () => {
    const keys = SETTING_DESCRIPTORS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
