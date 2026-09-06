'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { AdminPageHeader, AdminTable } from '@/components/admin/admin-shell';
import { useRouter } from '@/i18n/navigation';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { UnitType } from '@/generated/prisma/enums';

/**
 * M9 — create/edit a product, and manage its variants. `createProduct`,
 * `updateProduct`, and `upsertVariant` (src/lib/admin/catalogue.ts) were
 * already complete and audited; this is the missing UI over them.
 *
 * One component handles both create and edit (`productId` undefined vs
 * set) since the product fields are identical either way — only the
 * variants section (meaningless before the product itself exists) and the
 * submit action differ.
 */

const UNIT_TYPES: UnitType[] = ['G', 'KG', 'ML', 'L', 'PIECE', 'BUNCH', 'PACK'];

interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

interface VariantRow {
  id: string;
  label: string;
  quantity: number;
  unit: UnitType;
  mrpPaise: string;
  pricePaise: string;
  stockQty: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
}

interface ProductDetail {
  id: string;
  sku: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  categoryId: string;
  categorySlug: string;
  unitType: UnitType;
  description: string | null;
  tags: string[];
  imageUrls: string[];
  isMealPlanEligible: boolean;
  isActive: boolean;
  sortOrder: number;
  variants: VariantRow[];
}

interface ProductFields {
  sku: string;
  nameEn: string;
  nameMr: string;
  nameHi: string;
  categoryId: string;
  unitType: UnitType;
  description: string;
  tagsText: string;
  imageUrls: string[];
  isMealPlanEligible: boolean;
  isActive: boolean;
  sortOrder: string;
}

const BLANK_FIELDS: ProductFields = {
  sku: '',
  nameEn: '',
  nameMr: '',
  nameHi: '',
  categoryId: '',
  unitType: 'G',
  description: '',
  tagsText: '',
  imageUrls: [],
  isMealPlanEligible: false,
  isActive: true,
  sortOrder: '0',
};

const MAX_PRODUCT_IMAGES = 6;

export function ProductFormScreen({ productId }: { productId?: string }) {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');

  const product = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => api.get<{ product: ProductDetail }>(`/api/admin/products/${productId}`),
    enabled: productId !== undefined,
  });

  if (productId && product.isLoading) {
    return (
      <>
        <AdminPageHeader title={t('editProduct')} backHref="/admin/catalogue" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('loading')}</p>
      </>
    );
  }

  if (productId && !product.data) {
    return (
      <>
        <AdminPageHeader title={t('editProduct')} backHref="/admin/catalogue" backLabel={tc('back')} />
        <p className="text-sm text-muted-foreground">{tc('empty')}</p>
      </>
    );
  }

  const p = product.data?.product;
  const initial: ProductFields = p
    ? {
        sku: p.sku,
        nameEn: p.nameEn,
        nameMr: p.nameMr,
        nameHi: p.nameHi,
        categoryId: p.categoryId,
        unitType: p.unitType,
        description: p.description ?? '',
        tagsText: p.tags.join(', '),
        imageUrls: p.imageUrls,
        isMealPlanEligible: p.isMealPlanEligible,
        isActive: p.isActive,
        sortOrder: String(p.sortOrder),
      }
    : BLANK_FIELDS;

  return (
    <>
      <AdminPageHeader
        title={productId ? t('editProduct') : t('addProduct')}
        backHref="/admin/catalogue"
        backLabel={tc('back')}
      />

      {/* Keyed by productId so a brand-new mount (and a fresh `initial`)
          happens per product, instead of syncing query data into state
          with an effect. */}
      <ProductFieldsForm key={productId ?? 'new'} productId={productId} initial={initial} />

      {productId && p && <VariantsSection productId={productId} variants={p.variants} />}
    </>
  );
}

function ProductFieldsForm({
  productId,
  initial,
}: {
  productId?: string;
  initial: ProductFields;
}) {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState<ProductFields>(initial);
  const [error, setError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<{ categories: CategoryOption[] }>('/api/admin/categories'),
  });

  const saveProduct = useMutation({
    mutationFn: () => {
      const body = {
        sku: fields.sku,
        nameEn: fields.nameEn,
        nameMr: fields.nameMr,
        nameHi: fields.nameHi,
        categoryId: fields.categoryId,
        unitType: fields.unitType,
        description: fields.description || null,
        tags: fields.tagsText
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        imageUrls: fields.imageUrls,
        isMealPlanEligible: fields.isMealPlanEligible,
        isActive: fields.isActive,
        sortOrder: Number(fields.sortOrder) || 0,
      };
      return productId
        ? api.patch<{ productId: string }>(`/api/admin/products/${productId}`, body)
        : api.post<{ productId: string }>('/api/admin/products', body);
    },
    onSuccess: (data) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      if (productId) {
        void queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      } else {
        // Straight to the new product's edit page — adding its first
        // variant is the very next thing anyone does after creating one.
        router.replace(`/admin/catalogue/${data.productId}`);
      }
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : tc('failed'));
    },
  });

  return (
    <>
      {error && (
        <p className="mb-4 rounded-[var(--radius)] bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <section className="mb-4 rounded-[var(--radius)] border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('sku')}>
            <input
              value={fields.sku}
              onChange={(e) => setFields((f) => ({ ...f, sku: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
          <Field label={t('category')}>
            <select
              value={fields.categoryId}
              onChange={(e) => setFields((f) => ({ ...f, categoryId: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            >
              <option value="">{t('selectCategory')}</option>
              {categories.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.isActive ? ` (${tc('empty')})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('nameEnLabel')}>
            <input
              value={fields.nameEn}
              onChange={(e) => setFields((f) => ({ ...f, nameEn: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
          <Field label={t('nameMrLabel')}>
            <input
              value={fields.nameMr}
              onChange={(e) => setFields((f) => ({ ...f, nameMr: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
          <Field label={t('nameHiLabel')}>
            <input
              value={fields.nameHi}
              onChange={(e) => setFields((f) => ({ ...f, nameHi: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
          <Field label={t('unitType')}>
            <select
              value={fields.unitType}
              onChange={(e) => setFields((f) => ({ ...f, unitType: e.target.value as UnitType }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            >
              {UNIT_TYPES.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('tags')} hint={t('tagsHint')}>
            <input
              value={fields.tagsText}
              onChange={(e) => setFields((f) => ({ ...f, tagsText: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
          <Field label={t('sortOrder')}>
            <input
              type="number"
              value={fields.sortOrder}
              onChange={(e) => setFields((f) => ({ ...f, sortOrder: e.target.value }))}
              className="h-9 w-full rounded-[var(--radius)] border border-border bg-background px-2 text-sm outline-none"
            />
          </Field>
        </div>

        <ImagesField
          images={fields.imageUrls}
          onChange={(imageUrls) => setFields((f) => ({ ...f, imageUrls }))}
        />

        <Field label={t('description')} className="mt-3">
          <textarea
            value={fields.description}
            onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full rounded-[var(--radius)] border border-border bg-background px-2 py-1.5 text-sm outline-none"
          />
        </Field>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.isMealPlanEligible}
              onChange={(e) => setFields((f) => ({ ...f, isMealPlanEligible: e.target.checked }))}
              className="size-4 accent-[var(--primary)]"
            />
            {t('mealPlanEligible')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fields.isActive}
              onChange={(e) => setFields((f) => ({ ...f, isActive: e.target.checked }))}
              className="size-4 accent-[var(--primary)]"
            />
            {t('active')}
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('mealPlanHint')}</p>

        <button
          type="button"
          disabled={saveProduct.isPending || !fields.sku || !fields.nameEn || !fields.categoryId}
          onClick={() => saveProduct.mutate()}
          className="mt-4 flex h-10 items-center gap-2 rounded-[var(--radius)] bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saveProduct.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {productId
            ? saveProduct.isPending
              ? t('saving')
              : t('save')
            : saveProduct.isPending
              ? t('creating')
              : t('create')}
        </button>
      </section>
    </>
  );
}

function ImagesField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch('/api/admin/uploads/photo?folder=products', {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
        credentials: 'same-origin',
      });
      const payload = await response.json();
      if (!payload.success) {
        throw new ApiClientError(payload.error.code, payload.error.message, response.status);
      }
      return (payload.data as { url: string }).url;
    },
    onSuccess: (url) => {
      setError(null);
      onChange([...images, url]);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : tc('failed')),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) upload.mutate(file);
  }

  return (
    <div className="mt-3">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('images')}</label>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {images.map((url, index) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-[var(--radius)] border border-border">
            {/* Cloudinary/local/mock URLs are all plain <img> src, not next/image's remote-pattern allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, i) => i !== index))}
              aria-label={t('removeImage')}
              className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" aria-hidden />
            </button>
          </div>
        ))}

        {images.length < MAX_PRODUCT_IMAGES && (
          <button
            type="button"
            disabled={upload.isPending}
            onClick={() => fileInputRef.current?.click()}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-[var(--radius)] border border-dashed border-border text-muted-foreground disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            <span className="text-[10px]">{upload.isPending ? t('uploading') : t('addImage')}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const BLANK_VARIANT = {
  label: '',
  quantity: '1',
  unit: 'G' as UnitType,
  mrp: '',
  price: '',
  stockQty: '0',
  lowStockThreshold: '5',
  isDefault: false,
  isActive: true,
};

function VariantsSection({ productId, variants }: { productId: string; variants: VariantRow[] }) {
  const t = useTranslations('admin.catalogue');
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [newVariant, setNewVariant] = useState(BLANK_VARIANT);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
  }

  return (
    <section className="rounded-[var(--radius)] border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-bold">{t('variantsTitle')}</h2>

      {notice && <p className="mb-3 rounded-[var(--radius)] bg-primary/5 px-3 py-2 text-xs">{notice}</p>}

      {variants.length === 0 && (
        <p className="mb-3 text-xs text-muted-foreground">{t('noVariantsYet')}</p>
      )}

      {variants.length > 0 && (
        <AdminTable>
          <thead className="border-b border-border bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 font-medium">{t('label')}</th>
              <th className="px-2 py-2 font-medium">{t('quantity')}</th>
              <th className="px-2 py-2 text-right font-medium">{t('mrp')}</th>
              <th className="px-2 py-2 text-right font-medium">{t('price')}</th>
              <th className="px-2 py-2 text-right font-medium">{t('stock')}</th>
              <th className="px-2 py-2 text-right font-medium">{t('threshold')}</th>
              <th className="px-2 py-2 text-center font-medium">{t('default')}</th>
              <th className="px-2 py-2 text-center font-medium">{t('active')}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <VariantRowEditor
                key={variant.id}
                productId={productId}
                variant={variant}
                onSaved={(message) => {
                  setNotice(message);
                  refresh();
                }}
              />
            ))}
          </tbody>
        </AdminTable>
      )}

      <div className="mt-4 rounded-[var(--radius)] border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('addVariant')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={newVariant.label}
            onChange={(e) => setNewVariant((v) => ({ ...v, label: e.target.value }))}
            placeholder={t('label')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <input
            type="number"
            value={newVariant.quantity}
            onChange={(e) => setNewVariant((v) => ({ ...v, quantity: e.target.value }))}
            placeholder={t('quantity')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <select
            value={newVariant.unit}
            onChange={(e) => setNewVariant((v) => ({ ...v, unit: e.target.value as UnitType }))}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          >
            {UNIT_TYPES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            value={newVariant.mrp}
            onChange={(e) => setNewVariant((v) => ({ ...v, mrp: e.target.value.replace(/[^\d.]/g, '') }))}
            placeholder={t('mrp')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <input
            inputMode="decimal"
            value={newVariant.price}
            onChange={(e) => setNewVariant((v) => ({ ...v, price: e.target.value.replace(/[^\d.]/g, '') }))}
            placeholder={t('price')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <input
            type="number"
            value={newVariant.stockQty}
            onChange={(e) => setNewVariant((v) => ({ ...v, stockQty: e.target.value }))}
            placeholder={t('stock')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <input
            type="number"
            value={newVariant.lowStockThreshold}
            onChange={(e) => setNewVariant((v) => ({ ...v, lowStockThreshold: e.target.value }))}
            placeholder={t('threshold')}
            className="h-9 rounded border border-border bg-background px-2 text-sm outline-none"
          />
          <label className="flex items-center gap-1.5 px-1 text-xs">
            <input
              type="checkbox"
              checked={newVariant.isDefault}
              onChange={(e) => setNewVariant((v) => ({ ...v, isDefault: e.target.checked }))}
              className="size-4 accent-[var(--primary)]"
            />
            {t('default')}
          </label>
        </div>
        <AddVariantButton
          productId={productId}
          draft={newVariant}
          onDone={(message) => {
            setNotice(message);
            setNewVariant(BLANK_VARIANT);
            refresh();
          }}
        />
      </div>
    </section>
  );
}

function AddVariantButton({
  productId,
  draft,
  onDone,
}: {
  productId: string;
  draft: typeof BLANK_VARIANT;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      api.put<{ variantId: string }>(`/api/admin/products/${productId}`, {
        variantId: null,
        label: draft.label,
        quantity: Number(draft.quantity) || 1,
        unit: draft.unit,
        mrpPaise: Number(rupeesToPaise(draft.mrp || '0')),
        pricePaise: Number(rupeesToPaise(draft.price || '0')),
        stockQty: Number(draft.stockQty) || 0,
        lowStockThreshold: Number(draft.lowStockThreshold) || 0,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      }),
    onSuccess: () => {
      setError(null);
      onDone(t('saved'));
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : tc('failed')),
  });

  return (
    <>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <button
        type="button"
        disabled={!draft.label || add.isPending}
        onClick={() => add.mutate()}
        className="mt-2 flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        {add.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
        {t('addVariant')}
      </button>
    </>
  );
}

function VariantRowEditor({
  productId,
  variant,
  onSaved,
}: {
  productId: string;
  variant: VariantRow;
  onSaved: (message: string) => void;
}) {
  const t = useTranslations('admin.catalogue');
  const tc = useTranslations('admin.common');

  const [draft, setDraft] = useState({
    label: variant.label,
    quantity: String(variant.quantity),
    unit: variant.unit,
    mrp: formatPaise(paise(variant.mrpPaise), { withSymbol: false }),
    price: formatPaise(paise(variant.pricePaise), { withSymbol: false }),
    stockQty: String(variant.stockQty),
    lowStockThreshold: String(variant.lowStockThreshold),
    isDefault: variant.isDefault,
    isActive: variant.isActive,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ variantId: string }>(`/api/admin/products/${productId}`, {
        variantId: variant.id,
        label: draft.label,
        quantity: Number(draft.quantity) || 1,
        unit: draft.unit,
        mrpPaise: Number(rupeesToPaise(draft.mrp || '0')),
        pricePaise: Number(rupeesToPaise(draft.price || '0')),
        stockQty: Number(draft.stockQty) || 0,
        lowStockThreshold: Number(draft.lowStockThreshold) || 0,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      }),
    onSuccess: () => {
      setError(null);
      onSaved(t('saved'));
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : tc('failed')),
  });

  return (
    <tr className={cn('border-b border-border last:border-0', save.isPending && 'opacity-60')}>
      <td className="px-2 py-1.5">
        <input
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          className="h-8 w-24 rounded border border-border bg-background px-1.5 text-xs outline-none"
        />
        {error && <p className="mt-1 text-[10px] text-danger">{error}</p>}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          <input
            type="number"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
            className="h-8 w-14 rounded border border-border bg-background px-1.5 text-xs outline-none"
          />
          <select
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value as UnitType }))}
            className="h-8 rounded border border-border bg-background px-1 text-xs outline-none"
          >
            {UNIT_TYPES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          inputMode="decimal"
          value={draft.mrp}
          onChange={(e) => setDraft((d) => ({ ...d, mrp: e.target.value.replace(/[^\d.]/g, '') }))}
          className="h-8 w-16 rounded border border-border bg-background px-1.5 text-right text-xs tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          inputMode="decimal"
          value={draft.price}
          onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value.replace(/[^\d.]/g, '') }))}
          className="h-8 w-16 rounded border border-border bg-background px-1.5 text-right text-xs tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          value={draft.stockQty}
          onChange={(e) => setDraft((d) => ({ ...d, stockQty: e.target.value }))}
          className="h-8 w-16 rounded border border-border bg-background px-1.5 text-right text-xs tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          value={draft.lowStockThreshold}
          onChange={(e) => setDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))}
          className="h-8 w-14 rounded border border-border bg-background px-1.5 text-right text-xs tabular-nums outline-none"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
          className="size-4 accent-[var(--primary)]"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
          className="size-4 accent-[var(--primary)]"
        />
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="h-8 rounded border border-primary px-2 text-[11px] font-bold text-primary disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : t('save')}
        </button>
      </td>
    </tr>
  );
}
