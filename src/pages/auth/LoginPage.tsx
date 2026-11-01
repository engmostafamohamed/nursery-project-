import { zodResolver } from '@hookform/resolvers/zod';
import type { Session } from '@supabase/supabase-js';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { ForgotPasswordPanel } from '@/components/auth/ForgotPasswordPanel';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PageSkeleton } from '@/components/PageSkeleton';
import { consumeSessionExpiredFlag } from '@/lib/sessionExpiry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';

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
/**
 * The demo accounts panel: in development, or where VITE_SHOW_DEMO_ACCOUNTS=true. Decided when the
 * app is built, so a production build leaves the panel (and the demo password) out entirely.
 */
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DemoAccountsPanel = SHOW_DEMO_ACCOUNTS
  ? lazy(() => import('@/components/auth/DemoAccountsPanel').then((m) => ({ default: m.DemoAccountsPanel })))
  : null;

export function LoginPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuthSession();
  const [submitting, setSubmitting] = useState<'idle' | 'password' | 'magic'>('idle');
  const location = useLocation();
  const navigationState = location.state as { sessionExpired?: boolean; from?: string; forgotPassword?: boolean } | null;
  const returnTo = navigationState?.from;

  // Landing here after being kicked out is not the same as arriving fresh; say so,
  // once, so the sign-in form does not look like it forgot them for no reason.
  const expiryAnnounced = useRef(false);
  useEffect(() => {
    if (expiryAnnounced.current) return;
    // Either the guard redirected here, or some other request tripped the global
    // handler and the session simply vanished underneath the user.
    // The flag is read first so it is always cleared, or it would announce an expiry again later.
    const expired = consumeSessionExpiredFlag() || navigationState?.sessionExpired;
    if (expired) {
      expiryAnnounced.current = true;
      toast.info(t('auth.sessionExpired'));
    }
  }, [navigationState?.sessionExpired, t]);
  // The reset page sends people back here, with this open, when their link has expired.
  const [forgotOpen, setForgotOpen] = useState(Boolean(navigationState?.forgotPassword));

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const signInAsDemo = (email: string, password: string) => {
    form.setValue('email', email, { shouldDirty: true, shouldValidate: true });
    form.setValue('password', password, { shouldDirty: true, shouldValidate: true });
    setTimeout(() => {
      (document.getElementById('login-form') as HTMLFormElement | null)?.requestSubmit();
    }, 100);
  };

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

            {forgotOpen ? (
              <ForgotPasswordPanel initialEmail={form.getValues('email')} onBack={() => setForgotOpen(false)} />
            ) : (
            <>
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

              {DemoAccountsPanel ? (
                <Suspense fallback={null}>
                  <DemoAccountsPanel onPick={signInAsDemo} />
                </Suspense>
              ) : null}

              <div className="flex items-center justify-between text-sm">
                <button type="button" className="text-secondary hover:underline" onClick={() => setForgotOpen(true)}>
                  {t('auth.forgotPassword')}
                </button>
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
            </>
            )}
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
