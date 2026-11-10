import { useRef, useState, type ComponentType, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ResetEmailProblem } from '@/lib/passwordReset';
import { cn } from '@/lib/utils';

import { identifierProblem, magicLinkProblem, passwordProblem } from './signIn';
import { sendSignInLink, signInWithPassword } from './signInApi';

/** Keeps the browser's autofill from painting the fields its own pale blue. */
const autofillClass =
  '[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgb(var(--surface-low))] [&:-webkit-autofill]:[-webkit-text-fill-color:rgb(var(--foreground))]';

type Busy = 'idle' | 'password' | 'link';

/**
 * The sign-in form: a username or an email and the password, each checked under its field as it is
 * typed; what went wrong with the sign-in itself shows above the button, in words a parent or a
 * teacher understands. Also: show the password, a Caps Lock warning, "Forgot password?", and a
 * one-time sign-in link by email. `DemoPanel` (development only) is given a way to sign in as an account at once.
 */
export function SignInForm({
  onForgot,
  onLinkSent,
  DemoPanel,
}: {
  onForgot: (identifier: string) => void;
  onLinkSent: (email: string) => void;
  DemoPanel?: ComponentType<{ onPick: (email: string, password: string) => void }>;
}) {
  const { t } = useTranslation();
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [touched, setTouched] = useState({ identifier: false, password: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<Busy>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [linkProblem, setLinkProblem] = useState<ResetEmailProblem | null>(null);

  const idIssue = identifierProblem(identifier);
  const pwIssue = passwordProblem(password);
  const identifierError = linkProblem
    ? t(`auth.page.magic.problems.${linkProblem}`)
    : (tried || touched.identifier) && idIssue ? t(`auth.page.problems.identifier.${idIssue}`) : null;
  const passwordError = (tried || touched.password) && pwIssue ? t(`auth.page.problems.password.${pwIssue}`) : null;

  const signIn = async (values: { identifier: string; password: string }) => {
    setTried(true);
    setLinkProblem(null);
    setProblem(null);
    if (identifierProblem(values.identifier)) {
      identifierRef.current?.focus();
      return;
    }
    if (passwordProblem(values.password)) {
      passwordRef.current?.focus();
      return;
    }
    setBusy('password');
    const result = await signInWithPassword(values.identifier, values.password);
    setBusy('idle');
    if (result.ok) return; // The page moves on once the session is there.
    setProblem(t(result.reason === 'notPersisted' ? 'auth.sessionNotPersisted' : `auth.page.errors.${result.reason}`));
    if (result.reason === 'wrongCredentials') passwordRef.current?.select();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy === 'idle') void signIn({ identifier, password });
  };

  const sendLink = async () => {
    setProblem(null);
    const issue = magicLinkProblem(identifier);
    if (issue) {
      setLinkProblem(issue);
      identifierRef.current?.focus();
      return;
    }
    setBusy('link');
    const outcome = await sendSignInLink(identifier);
    setBusy('idle');
    if (outcome === 'sent') onLinkSent(identifier.trim());
    else setProblem(t(`auth.page.magic.errors.${outcome}`));
  };

  const signInAs = (email: string, pass: string) => {
    setIdentifier(email);
    setPassword(pass);
    void signIn({ identifier: email, password: pass });
  };

  return (
    <div className="space-y-5">
      <form id="login-form" className="space-y-4" onSubmit={onSubmit} noValidate aria-labelledby="sign-in-title">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.emailOrUsername')}</Label>
          <div className="relative">
            <MaterialSymbol name="person" size="text-xl" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <Input
              ref={identifierRef}
              id="email"
              type="text"
              dir="auto"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className={cn('ps-11', autofillClass, identifierError && invalidFieldClass)}
              placeholder={t('auth.emailOrUsernamePlaceholder')}
              value={identifier}
              aria-invalid={Boolean(identifierError)}
              aria-describedby={identifierError ? 'email-error' : undefined}
              onChange={(e) => { setIdentifier(e.target.value); setLinkProblem(null); setProblem(null); }}
              onBlur={() => setTouched((s) => ({ ...s, identifier: s.identifier || Boolean(identifier) }))}
            />
          </div>
          <FieldError id="email-error" message={identifierError} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <button type="button" className="rounded text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => onForgot(identifier)}>
              {t('auth.forgotPassword')}
            </button>
          </div>
          <div className="relative">
            <MaterialSymbol name="lock" size="text-xl" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <Input
              ref={passwordRef}
              id="password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              className={cn('pe-12 ps-11', autofillClass, passwordError && invalidFieldClass)}
              placeholder={t('auth.page.passwordPlaceholder')}
              value={password}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={[passwordError ? 'password-error' : '', capsLock ? 'password-caps' : ''].filter(Boolean).join(' ') || undefined}
              onChange={(e) => { setPassword(e.target.value); setProblem(null); }}
              onBlur={() => { setTouched((s) => ({ ...s, password: s.password || Boolean(password) })); setCapsLock(false); }}
              onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
              onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={visible}
              className="absolute end-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MaterialSymbol name={visible ? 'visibility_off' : 'visibility'} size="text-xl" />
            </button>
          </div>
          <FieldError id="password-error" message={passwordError} />
          {capsLock ? (
            <p id="password-caps" className="flex items-center gap-1 text-xs text-warning">
              <MaterialSymbol name="keyboard_capslock" size="text-sm" />
              {t('auth.page.capsLock')}
            </p>
          ) : null}
        </div>

        <FormProblem message={problem} />

        <Button type="submit" className="h-12 w-full btn-gradient text-base text-primary-foreground" disabled={busy !== 'idle'} aria-busy={busy === 'password'}>
          {busy === 'password' ? (
            <>
              <MaterialSymbol name="progress_activity" size="text-lg" className="me-2 animate-spin" />
              {t('auth.page.signingIn')}
            </>
          ) : t('auth.signIn')}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-on-surface-variant">
        <span className="h-px flex-1 bg-outline-variant" />
        {t('auth.page.or')}
        <span className="h-px flex-1 bg-outline-variant" />
      </div>

      <Button type="button" variant="outline" className="h-11 w-full" disabled={busy !== 'idle'} onClick={() => void sendLink()} data-testid="send-sign-in-link">
        <MaterialSymbol name={busy === 'link' ? 'progress_activity' : 'forward_to_inbox'} size="text-lg" className={cn('me-2', busy === 'link' && 'animate-spin')} />
        {busy === 'link' ? t('auth.page.magic.sending') : t('auth.page.magic.button')}
      </Button>

      {DemoPanel ? <DemoPanel onPick={signInAs} /> : null}
    </div>
  );
}
