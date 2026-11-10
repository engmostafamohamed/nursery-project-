import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * The sign-in page's demo accounts: one click fills a seed account and signs in. Development only:
 * the sign-in page loads this file only in dev or with VITE_SHOW_DEMO_ACCOUNTS=true, so a production
 * build does not contain it (nor the demo password).
 */
const DEMO_PASSWORD = 'Demo2026!';

/** Each account, its look and its texts (auth.page.demo.accounts.<key>). */
const demoAccounts = [
  { key: 'xoAdmin', email: 'demo-xo-admin@xonursery.com', icon: 'shield_person', tone: 'bg-primary/10 text-primary' },
  { key: 'branchAdmin', email: 'demo-branch-admin@xonursery.com', icon: 'apartment', tone: 'bg-info/10 text-info' },
  { key: 'financeManager', email: 'demo-manager@xonursery.com', icon: 'payments', tone: 'bg-purple-500/15 text-purple-700 dark:text-purple-300' },
  { key: 'hrManager', email: 'demo-manager-hr@xonursery.com', icon: 'badge', tone: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  { key: 'teacher', email: 'demo-teacher@xonursery.com', icon: 'school', tone: 'bg-success/10 text-success' },
  { key: 'managerTeacher', email: 'demo-manager-teacher@xonursery.com', icon: 'groups', tone: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' },
  { key: 'parent', email: 'demo-parent@xonursery.com', icon: 'family_restroom', tone: 'bg-warning/10 text-warning' },
] as const;

interface SeedDemoRow {
  email: string;
  auth_role: string;
  custom_role: string | null;
  position_name: string | null;
}

/** The seed demo accounts as the database has them now (get_demo_login_accounts), for their current role. */
function useSeedDemoAccounts() {
  return useQuery<SeedDemoRow[]>({
    queryKey: ['demo-login-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_demo_login_accounts');
      if (error) throw error;
      return (data ?? []) as SeedDemoRow[];
    },
    staleTime: 1000 * 30,
  });
}

export function DemoAccountsPanel({ onPick }: { onPick: (email: string, password: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const seedRows = useSeedDemoAccounts();

  // The texts come from the locale files; the database's role and position (if renamed) are added
  // to the description, so a renamed role shows here.
  const accounts = useMemo(() => {
    const rows = new Map((seedRows.data ?? []).map((row) => [row.email, row]));
    return demoAccounts.map((seed) => {
      const row = rows.get(seed.email);
      const access = t(`auth.page.demo.accounts.${seed.key}.access`);
      const description = row?.position_name ? `${row.custom_role || access} · ${row.position_name}` : row?.custom_role || access;
      return { ...seed, name: t(`auth.page.demo.accounts.${seed.key}.name`), description };
    });
  }, [seedRows.data, t]);

  return (
    <div className="overflow-hidden rounded-xl border border-dashed border-outline-variant bg-surface-high/60" data-testid="demo-accounts">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="demo-accounts-list"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <MaterialSymbol name="science" size="text-lg" className="text-primary" />
          {t('auth.demoAccountsHeader')}
        </span>
        <span className="flex items-center gap-1 text-xs text-on-surface-variant">
          {t('auth.page.demo.count', { count: accounts.length })}
          <MaterialSymbol name="expand_more" size="text-lg" className={cn('transition-transform duration-200', open && 'rotate-180')} />
        </span>
      </button>

      {open ? (
        <div id="demo-accounts-list" className="border-t border-outline-variant">
          <p className="px-4 pt-3 text-xs text-on-surface-variant">{t('auth.demoAccountsHint')}</p>
          <ul className="max-h-80 space-y-0.5 overflow-y-auto p-2">
            {accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => onPick(account.email, DEMO_PASSWORD)}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-surface-container-lowest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', account.tone)} aria-hidden>
                    <MaterialSymbol name={account.icon} size="text-lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-on-surface">{account.name}</span>
                    <span className="block truncate text-[11px] text-on-surface-variant">{account.description}</span>
                  </span>
                  <span className="hidden max-w-[12rem] truncate font-mono text-[11px] text-on-surface-variant sm:block" dir="ltr">{account.email}</span>
                  <MaterialSymbol name="login" size="text-lg" className="text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-outline-variant px-4 py-2.5 text-[11px] text-on-surface-variant">
            {t('auth.page.demo.password')}{' '}
            <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] text-on-surface" dir="ltr">{DEMO_PASSWORD}</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}
