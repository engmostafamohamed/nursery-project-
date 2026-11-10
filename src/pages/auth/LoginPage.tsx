import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { ForgotPasswordPanel } from '@/components/auth/ForgotPasswordPanel';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PageSkeleton } from '@/components/PageSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { SignInForm } from '@/features/sign-in/SignInForm';
import { SignInHero } from '@/features/sign-in/SignInHero';
import { SignInLinkSent } from '@/features/sign-in/SignInLinkSent';
import { useAuthSession } from '@/hooks/useAuthSession';
import { consumeSessionExpiredFlag } from '@/lib/sessionExpiry';

/**
 * The demo accounts panel: in development, or where VITE_SHOW_DEMO_ACCOUNTS=true. Decided when the
 * app is built, so a production build leaves the panel (and the demo password) out entirely.
 */
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DemoAccountsPanel = SHOW_DEMO_ACCOUNTS
  ? lazy(() => import('@/components/auth/DemoAccountsPanel').then((m) => ({ default: m.DemoAccountsPanel })))
  : null;

/** The demo accounts, loaded on first show. */
function DemoPanel({ onPick }: { onPick: (email: string, password: string) => void }) {
  if (!DemoAccountsPanel) return null;
  return (
    <Suspense fallback={null}>
      <DemoAccountsPanel onPick={onPick} />
    </Suspense>
  );
}

type View = { kind: 'form' } | { kind: 'forgot'; email: string } | { kind: 'linkSent'; email: string };

/**
 * Signing in: the brand and language at the top, the form in the middle (or "forgot password", or
 * "check your inbox" after asking for a sign-in link), and on wide screens a photo with what the
 * app does. Someone sent back here because their session ended is told so above the form.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuthSession();
  const location = useLocation();
  const navigationState = location.state as { sessionExpired?: boolean; from?: string; forgotPassword?: boolean } | null;
  const returnTo = navigationState?.from;
  // The reset page sends people back here, with "forgot password" open, when their link has expired.
  const [view, setView] = useState<View>(() => (navigationState?.forgotPassword ? { kind: 'forgot', email: '' } : { kind: 'form' }));

  // Landing here after being signed out is not the same as arriving fresh: say so. The flag is read
  // (and cleared) once, when the page opens, or it would announce an expiry again later.
  const [flagged] = useState(consumeSessionExpiredFlag);
  const expired = flagged || Boolean(navigationState?.sessionExpired);

  if (loading) return <PageSkeleton />;
  if (session) {
    if (!returnTo || returnTo === '/login') return <Navigate to="/" replace />;
    // The page may be left over from whoever used this browser before; ProtectedRoute reads this
    // to send them home instead of refusing them.
    return <Navigate to={returnTo} replace state={{ afterSignIn: true }} />;
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest lg:grid lg:grid-cols-2">
      <main className="flex min-h-screen flex-col px-5 py-5 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="btn-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold tracking-tight text-white shadow-sm" aria-hidden>
              XO
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-headline text-lg font-extrabold text-on-surface">{t('common.appName')}</p>
              <p className="truncate text-xs text-on-surface-variant">{t('auth.loginSubtitle')}</p>
            </div>
          </div>
          <LanguageToggle />
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            {view.kind === 'forgot' ? (
              <ForgotPasswordPanel initialEmail={view.email} onBack={() => setView({ kind: 'form' })} />
            ) : view.kind === 'linkSent' ? (
              <SignInLinkSent email={view.email} onBack={() => setView({ kind: 'form' })} onResend={() => setView({ kind: 'form' })} />
            ) : (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 id="sign-in-title" className="font-headline text-3xl font-extrabold text-on-surface">{t('auth.page.welcome')}</h1>
                  <p className="text-sm text-on-surface-variant">{t('auth.page.welcomeHint')}</p>
                </div>

                {expired ? (
                  <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-on-surface" data-testid="session-expired">
                    <MaterialSymbol name="schedule" size="text-lg" className="text-warning" />
                    {t('auth.sessionExpired')}
                  </p>
                ) : null}

                <SignInForm
                  onForgot={(identifier) => setView({ kind: 'forgot', email: identifier })}
                  onLinkSent={(email) => setView({ kind: 'linkSent', email })}
                  DemoPanel={DemoAccountsPanel ? DemoPanel : undefined}
                />

                <p className="text-center text-sm text-on-surface-variant">
                  {t('auth.page.newParent')}{' '}
                  <Link to="/signup" className="font-semibold text-primary hover:underline">
                    {t('signup.createAccount')}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="text-center text-xs text-on-surface-variant">
          © {new Date().getFullYear()} {t('common.appName')}
        </footer>
      </main>

      <SignInHero />
    </div>
  );
}
