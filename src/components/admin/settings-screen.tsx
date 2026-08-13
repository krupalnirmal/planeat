'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-shell';
import { ApiClientError, api } from '@/lib/api/client';
import { formatPaise, paise, rupeesToPaise } from '@/lib/money';

/**
 * M9 — "Settings: every value from Part 9, editable at runtime."
 *
 * R8 is the rule this screen exists for: no hard-coded business numbers. Each
 * row shows which rule in the brief it comes from (B10, B4, B3…), so the owner
 * changing the delivery fee can see that it is the same number the free-delivery
 * threshold is measured against.
 *
 * Money is entered in rupees and stored in paise (R4). Showing paise here would
 * be technically honest and practically useless — nobody thinks of the delivery
 * fee as 2500.
 */

interface Setting {
  key: string;
  group: string;
  type: 'paise' | 'number' | 'boolean' | 'string' | 'number-list';
  reference: string;
  value: unknown;
  isDefault: boolean;
  updatedByName: string | null;
}

export function AdminSettingsScreen() {
  const t = useTranslations('admin.settings');
  const tc = useTranslations('admin.common');
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<{ settings: Setting[] }>('/api/admin/settings'),
  });

  const update = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      api.patch('/api/admin/settings', input),
    onSuccess: () => {
      setNotice(t('saved'));
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (error) => {
      setNotice(
        error instanceof ApiClientError && error.code === 'FORBIDDEN'
          ? t('superAdminOnly')
          : tc('failed'),
      );
    },
  });

  if (settings.isLoading) {
    return <p className="text-sm text-muted-foreground">{tc('loading')}</p>;
  }

  const rows = settings.data?.settings ?? [];
  const groups = [...new Set(rows.map((row) => row.group))];

  return (
    <>
      <AdminPageHeader title={t('title')} subtitle={t('hint')} />

      {notice && (
        <p className="mb-4 rounded-[var(--radius)] bg-primary/5 px-4 py-3 text-sm">{notice}</p>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group} className="rounded-[var(--radius)] border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold capitalize">
              {group.replace(/_/g, ' ')}
            </h2>

            <ul className="divide-y divide-border">
              {rows
                .filter((row) => row.group === group)
                .map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs">{row.key}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Info className="size-3" aria-hidden />
                        {t('reference')} {row.reference}
                        {row.updatedByName && ` · ${t('updatedBy')} ${row.updatedByName}`}
                        {row.isDefault && ` · ${t('isDefault')}`}
                      </p>
                    </div>

                    <SettingInput
                      setting={row}
                      onSave={(value) => {
                        setNotice(null);
                        update.mutate({ key: row.key, value });
                      }}
                      saveLabel={t('save')}
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function SettingInput({
  setting,
  onSave,
  saveLabel,
}: {
  setting: Setting;
  onSave: (value: unknown) => void;
  saveLabel: string;
}) {
  const initial =
    setting.type === 'paise'
      ? formatPaise(paise(String(setting.value ?? 0)), { withSymbol: false })
      : Array.isArray(setting.value)
        ? setting.value.join(',')
        : String(setting.value ?? '');

  const [draft, setDraft] = useState(initial);

  if (setting.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={setting.value === true}
        onChange={(event) => onSave(event.target.checked)}
        className="size-5 shrink-0 accent-[var(--primary)]"
      />
    );
  }

  const dirty = draft !== initial;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {setting.type === 'paise' && <span className="text-sm text-muted-foreground">₹</span>}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-9 w-32 rounded border border-border bg-background px-2 text-right text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={() =>
          // Rupees in, paise out (R4).
          onSave(setting.type === 'paise' ? Number(rupeesToPaise(draft)) : draft)
        }
        disabled={!dirty}
        className="h-9 rounded-[var(--radius)] border border-primary px-2.5 text-xs font-semibold text-primary disabled:opacity-40"
      >
        {saveLabel}
      </button>
    </div>
  );
}
