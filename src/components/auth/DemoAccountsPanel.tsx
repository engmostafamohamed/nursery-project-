import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * The sign-in page's demo accounts: one click fills a seed account and signs in. Development only:
 * the sign-in page loads this file only in dev or with VITE_SHOW_DEMO_ACCOUNTS=true, so a production
 * build does not contain it (nor the demo password).
 */
const DEMO_PASSWORD = 'Demo2026!';

const demoAccounts = [
  {
    email: 'demo-xo-admin@xonursery.com',
    role: 'xo_super_admin',
    name_en: 'Demo XO Admin',
    description: 'Full platform access',
  },
  {
    email: 'demo-branch-admin@xonursery.com',
    role: 'branch_admin',
    name_en: 'Demo Branch Admin',
    description: 'Manage one nursery',
  },
  {
    email: 'demo-manager@xonursery.com',
    role: 'manager',
    name_en: 'Demo Manager (Finance)',
    description: 'Nursery ops + finance gates',
  },
  {
    email: 'demo-manager-hr@xonursery.com',
    role: 'manager',
    name_en: 'Demo Manager (HR)',
    description: 'Nursery ops + HR gates',
  },
  {
    email: 'demo-teacher@xonursery.com',
    role: 'teacher',
    name_en: 'Demo Teacher',
    description: 'Classroom management',
  },
  {
    email: 'demo-manager-teacher@xonursery.com',
    role: 'manager',
    name_en: 'Demo Manager Teacher',
    description: 'Teacher + staff manager',
  },
  {
    email: 'demo-parent@xonursery.com',
    role: 'parent',
    name_en: 'Demo Parent',
    description: 'View child activities',
  },
] as const;

interface SeedDemoRow {
  email: string;
  auth_role: string;
  custom_role: string | null;
  position_name: string | null;
}

interface DemoListItem {
  email: string;
  role: string;
  name_en: string;
  description: string;
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

  // The list above is the source of the copy and colours; the database refreshes each role and
  // position, so a renamed role shows here.
  const accounts = useMemo<DemoListItem[]>(() => {
    const rows = new Map((seedRows.data ?? []).map((row) => [row.email, row]));
    return demoAccounts.map((seed) => {
      const row = rows.get(seed.email);
      if (!row) return { ...seed };
      const description = row.position_name
        ? `${row.custom_role || row.auth_role} · ${row.position_name}`
        : row.custom_role || row.auth_role;
      return { ...seed, role: row.auth_role, description };
    });
  }, [seedRows.data]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-surface-high text-foreground">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-foreground/5"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="text-xs font-semibold tracking-[0.24em]">{t('auth.demoAccountsHeader')}</span>
        <span className={`material-symbols-outlined text-base transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          expand_more
        </span>
      </button>

      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-4 pb-2 text-xs text-on-surface-variant">{t('auth.demoAccountsHint')}</p>
          <div className="px-4 pb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 text-left text-[11px] font-medium text-on-surface-variant">Role</th>
                  <th className="py-2 px-3 text-left text-[11px] font-medium text-on-surface-variant">Email</th>
                  <th className="py-2 pl-3 text-left text-[11px] font-medium text-on-surface-variant">Access</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.email}
                    onClick={() => onPick(account.email, DEMO_PASSWORD)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-foreground/5"
                  >
                    <td className="py-3 pr-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-2 py-1 text-[11px] font-medium',
                          account.role === 'xo_super_admin' && 'bg-primary/10 text-primary',
                          account.role === 'branch_admin' && 'bg-info/10 text-info',
                          account.role === 'manager' &&
                            account.email === 'demo-manager-hr@xonursery.com' &&
                            'bg-teal-500/15 text-teal-700 dark:text-teal-300',
                          account.role === 'manager' &&
                            account.email === 'demo-manager@xonursery.com' &&
                            'bg-purple-500/15 text-purple-700 dark:text-purple-300',
                          account.role === 'manager' &&
                            account.email === 'demo-manager-teacher@xonursery.com' &&
                            'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
                          account.role === 'teacher' && 'bg-success/10 text-success',
                          account.role === 'parent' && 'bg-warning/10 text-warning',
                        )}
                      >
                        {account.name_en}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-on-surface">{account.email}</td>
                    <td className="py-3 pl-3 text-[11px] text-on-surface-variant">{account.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-on-surface-variant">
              Password for all demo accounts:{' '}
              <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px]">{DEMO_PASSWORD}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
