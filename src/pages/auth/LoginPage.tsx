import { zodResolver } from '@hookform/resolvers/zod';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { LanguageToggle } from '@/components/LanguageToggle';
import { PageSkeleton } from '@/components/PageSkeleton';
import { consumeSessionExpiredFlag } from '@/lib/sessionExpiry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const signInSchema = z.object({
  // Parents sign in with a username, staff with their email — accept either.
  email: z.string().min(1),
  password: z.string().min(8),
});

/** Mirrors the signup function: a parent's auth address is derived from their username. */
const USERNAME_EMAIL_DOMAIN = 'parents.xo.local';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

/**
 * Parents registered before usernames existed authenticate with their real email,
 * while newer ones use the synthetic address signup mints. Ask the database which
 * applies, and fall back to the synthetic form if the lookup is unavailable.
 */
async function toAuthEmail(identifier: string): Promise<string> {
  const value = identifier.trim();
  if (value.includes('@')) return value;
  if (!USERNAME_PATTERN.test(value)) return value;

  // Cast: this RPC is newer than the generated database types.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)('auth_email_for_username', { p_username: value });
  if (!error && typeof data === 'string' && data) return data;
  return `${value.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

type SignInValues = z.infer<typeof signInSchema>;
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

interface DynamicDemoAccount {
  email: string;
  name_en: string;
  name_ar: string | null;
  auth_role: string;
  custom_role: string | null;
  position_name: string | null;
  hr_department: string | null;
  is_seed_demo: boolean;
}

interface DemoListItem {
  email: string;
  role: string;
  name_en: string;
  description: string;
  is_dynamic: boolean;
}

/** Live-fetches every demo-eligible account from the DB (placeholder-email
 *  staff + seed @xonursery.com demos). The list updates whenever a new staff
 *  is onboarded via the Edge Function. */
function useDemoLoginAccounts() {
  return useQuery<DynamicDemoAccount[]>({
    queryKey: ['demo-login-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_demo_login_accounts');
      if (error) throw error;
      return (data ?? []) as DynamicDemoAccount[];
    },
    staleTime: 1000 * 30,
  });
}

export function LoginPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuthSession();
  const [submitting, setSubmitting] = useState<'idle' | 'password' | 'magic'>('idle');
  const location = useLocation();
  const navigationState = location.state as { sessionExpired?: boolean; from?: string } | null;
  const returnTo = navigationState?.from;

  // Landing here after being kicked out is not the same as arriving fresh; say so,
  // once, so the sign-in form does not look like it forgot them for no reason.
  const expiryAnnounced = useRef(false);
  useEffect(() => {
    if (expiryAnnounced.current) return;
    // Either the guard redirected here, or some other request tripped the global
    // handler and the session simply vanished underneath the user.
    const expired = navigationState?.sessionExpired || consumeSessionExpiredFlag();
    if (expired) {
      expiryAnnounced.current = true;
      toast.info(t('auth.sessionExpired'));
    }
  }, [navigationState?.sessionExpired, t]);
  const [demoOpen, setDemoOpen] = useState(false);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const showDemoAccounts = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true' || params.get('preview') === 'true';
  }, []);

  // Dynamic demo list — fetched from the DB so freshly onboarded staff (with
  // placeholder emails) appear here automatically with their derived role,
  // position, and HR department tags.
  const dynamicDemos = useDemoLoginAccounts();

  /** Merge the hard-coded seed list with the DB-driven list. The seed list is
   *  the source of truth for description copy + chip color; the DB adds any
   *  extra placeholder-email staff. Dedup by email (DB wins on collision so
   *  the latest role/position name is shown). */
  const mergedDemoAccounts = useMemo<DemoListItem[]>(() => {
    const map = new Map<string, DemoListItem>();
    for (const seed of demoAccounts) {
      map.set(seed.email, { ...seed, is_dynamic: false });
    }
    for (const row of dynamicDemos.data ?? []) {
      const existing = map.get(row.email);
      const desc = row.position_name
        ? `${row.custom_role ?? row.auth_role} · ${row.position_name}`
        : (row.custom_role ?? row.auth_role);
      if (existing) {
        // Refresh role/description from the DB so name changes propagate.
        map.set(row.email, { ...existing, role: row.auth_role, description: desc });
      } else if (row.email.endsWith('@staff.placeholder.xo')) {
        // Brand-new onboarded staff — add to the list.
        map.set(row.email, {
          email: row.email,
          role: row.auth_role,
          name_en: row.name_en,
          description: desc,
          is_dynamic: true,
        });
      }
    }
    return Array.from(map.values());
  }, [dynamicDemos.data]);

  const performPasswordSignIn = async (values: SignInValues) => {
    setSubmitting('password');
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: await toAuthEmail(values.email),
        password: values.password,
      });
      if (error) {
        toast.error(`${t('auth.loginError')} (${error.message})`);
        return;
      }
      let session: Session | null = signInData.session;
      if (!session) {
        const { data: fromStorage } = await supabase.auth.getSession();
        session = fromStorage.session;
      }
      if (!session) {
        toast.error(t('auth.sessionNotPersisted'));
        return;
      }
      if (import.meta.env.DEV) {
        console.log('Login session (verify):', session);
      }
    } finally {
      setSubmitting('idle');
    }
  };

  const onPasswordSignIn = form.handleSubmit(async (values) => {
    await performPasswordSignIn(values);
  });

  const onMagicLink = async () => {
    const ok = await form.trigger('email');
    if (!ok) return;
    setSubmitting('magic');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: form.getValues('email'),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) {
        toast.error(`${t('auth.magicLinkError')} (${error.message})`);
        return;
      }
      toast.success(t('auth.magicLinkSent'));
    } finally {
      setSubmitting('idle');
    }
  };

  if (loading) return <PageSkeleton />;
  if (session) return <Navigate to={returnTo && returnTo !== '/login' ? returnTo : '/'} replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen grid-cols-1 gap-0 lg:grid-cols-2">
        <section className="relative flex flex-col bg-surface-container-lowest p-10 lg:p-12">
          <div className="absolute end-6 top-6">
            <LanguageToggle />
          </div>
          <div className="mx-auto mt-6 w-full max-w-md space-y-6">
            <div>
              <p className="font-headline text-2xl font-extrabold text-on-surface">{t('common.appName')}</p>
              <p className="text-sm text-on-surface-variant">{t('auth.loginSubtitle')}</p>
            </div>

            <form id="login-form" className="space-y-4" onSubmit={onPasswordSignIn} noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.emailOrUsername')}</Label>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute start-3 top-3 text-on-surface-variant">mail</span>
                  <Input id="email" type="text" autoComplete="username" className="ps-11" placeholder={t('auth.emailOrUsernamePlaceholder')} {...form.register('email')} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute start-3 top-3 text-on-surface-variant">lock</span>
                  <Input id="password" type="password" className="ps-11" placeholder={t('auth.passwordPlaceholder')} {...form.register('password')} />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full btn-gradient text-primary-foreground"
                disabled={submitting !== 'idle'}
              >
                {submitting === 'password' ? t('common.loading') : t('auth.signIn')}
              </Button>

              {showDemoAccounts ? (
                <div className="overflow-hidden rounded-xl border border-border/40 bg-surface-high text-foreground">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-foreground/5"
                    onClick={() => setDemoOpen((open) => !open)}
                  >
                    <span className="text-xs font-semibold tracking-[0.24em]">{t('auth.demoAccountsHeader')}</span>
                    <span
                      className={`material-symbols-outlined text-base transition-transform duration-200 ${demoOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      expand_more
                    </span>
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-out ${demoOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
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
                            {mergedDemoAccounts.map((account) => (
                              <tr
                                key={account.email}
                                onClick={() => {
                                  form.setValue('email', account.email, { shouldDirty: true, shouldValidate: true });
                                  form.setValue('password', DEMO_PASSWORD, { shouldDirty: true, shouldValidate: true });
                                  setTimeout(() => {
                                    (document.getElementById('login-form') as HTMLFormElement | null)?.requestSubmit();
                                  }, 100);
                                }}
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
              ) : null}

              <div className="flex items-center justify-between text-sm">
                <button type="button" className="text-secondary hover:underline">{t('auth.forgotPassword')}</button>
                <button
                  type="button"
                  className="text-secondary hover:underline"
                  disabled={submitting !== 'idle'}
                  onClick={() => void onMagicLink()}
                >
                  {submitting === 'magic' ? t('common.loading') : t('auth.sendMagicLink')}
                </button>
              </div>
            </form>

            <p className="text-center text-sm text-on-surface-variant">
              {t('signup.noAccount')}{' '}
              <Link to="/signup" className="text-secondary hover:underline">
                {t('signup.createAccount')}
              </Link>
            </p>

            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <div className="h-px flex-1 bg-outline-variant" />
              <span>{t('auth.orContinueWith')}</span>
              <div className="h-px flex-1 bg-outline-variant" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="w-full">Google</Button>
              <Button variant="outline" className="w-full">Apple</Button>
            </div>
          </div>
        </section>

        <section
          className="relative hidden bg-primary-container p-8 text-white lg:flex lg:flex-col lg:justify-between"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=1200&q=80)",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-b from-primary/50 via-primary-container/60 to-primary/70" />
          <div className="relative z-10 mt-16">
            <h2 className="font-headline text-4xl font-extrabold">{t('auth.rightHeadline')}</h2>
          </div>
          <div className="relative z-10 grid gap-4">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <h3 className="text-lg font-semibold">{t('auth.featureOneTitle')}</h3>
              <p className="mt-1 text-sm text-white/80">{t('auth.featureOneDescription')}</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <h3 className="text-lg font-semibold">{t('auth.featureTwoTitle')}</h3>
              <p className="mt-1 text-sm text-white/80">{t('auth.featureTwoDescription')}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
