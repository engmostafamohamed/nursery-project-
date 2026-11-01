import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { LanguageToggle } from '@/components/LanguageToggle';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  PASSWORD_MIN_LENGTH,
  confirmPasswordProblem,
  mustChangePassword,
  newPasswordProblem,
  resetErrorKey,
} from '@/lib/passwordReset';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * Choosing a new password. Opened two ways:
 *   * from the link of a "forgot password" email: the link signs the person in for this;
 *   * at a staff member's first sign-in, when someone else gave them their first password
 *     (the route guard sends them here until they choose their own).
 * Without a session (the link expired or was used) it says so and offers a new link.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, user, loading } = useAuthSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return <PageSkeleton />;

  const firstSignIn = mustChangePassword(user);
  const passwordProblem = newPasswordProblem(password);
  const confirmProblem = confirmPasswordProblem(password, confirm);
  const shownPasswordProblem = touched.password ? passwordProblem : null;
  const shownConfirmProblem = touched.confirm ? confirmProblem : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ password: true, confirm: true });
    setSaveError(null);
    if (passwordProblem || confirmProblem) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
      if (error) {
        setSaveError(t(`auth.reset.errors.${resetErrorKey(error)}`));
        return;
      }
      toast.success(t('auth.reset.saved'));
      navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute end-6 top-6">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-surface-container-lowest p-6 shadow-sm md:p-8">
        <p className="font-headline text-2xl font-extrabold text-on-surface">{t('common.appName')}</p>

        {!session ? (
          <div className="space-y-4" data-testid="reset-link-expired">
            <span className="material-symbols-outlined text-4xl text-warning" aria-hidden>
              link_off
            </span>
            <h1 className="font-headline text-xl font-bold text-on-surface">{t('auth.reset.expiredTitle')}</h1>
            <p className="text-sm text-on-surface-variant">{t('auth.reset.expiredBody')}</p>
            <Button asChild className="w-full">
              <Link to="/login" state={{ forgotPassword: true }}>
                {t('auth.reset.requestAgain')}
              </Link>
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate data-testid="reset-password-form">
            <div>
              <h1 className="font-headline text-xl font-bold text-on-surface">
                {firstSignIn ? t('auth.reset.firstSignInTitle') : t('auth.reset.newPasswordTitle')}
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                {firstSignIn ? t('auth.reset.firstSignInBody') : t('auth.reset.newPasswordBody')}
              </p>
              {user?.email ? (
                <p dir="ltr" className="mt-2 text-start font-mono text-xs text-on-surface-variant">
                  {user.email}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">{t('auth.reset.newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                className={cn(shownPasswordProblem && invalidFieldClass)}
                value={password}
                aria-invalid={Boolean(shownPasswordProblem)}
                aria-describedby="new-password-help"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setSaveError(null);
                }}
                onBlur={() => setTouched((was) => ({ ...was, password: was.password || password.length > 0 }))}
              />
              {shownPasswordProblem ? (
                <FieldError id="new-password-help" message={t(`auth.reset.passwordProblems.${shownPasswordProblem}`, { min: PASSWORD_MIN_LENGTH })} />
              ) : (
                <p id="new-password-help" className="text-xs text-on-surface-variant">
                  {t('auth.reset.passwordHint', { min: PASSWORD_MIN_LENGTH })}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t('auth.reset.confirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className={cn(shownConfirmProblem && invalidFieldClass)}
                value={confirm}
                aria-invalid={Boolean(shownConfirmProblem)}
                aria-describedby={shownConfirmProblem ? 'confirm-password-error' : undefined}
                onChange={(event) => {
                  setConfirm(event.target.value);
                  setSaveError(null);
                  // Says "they match" or not as soon as it is as long as the first.
                  if (event.target.value.length >= password.length && password) setTouched((was) => ({ ...was, confirm: true }));
                }}
                onBlur={() => setTouched((was) => ({ ...was, confirm: was.confirm || confirm.length > 0 }))}
              />
              <FieldError id="confirm-password-error" message={shownConfirmProblem ? t(`auth.reset.confirmProblems.${shownConfirmProblem}`) : null} />
            </div>

            <Button type="submit" className="w-full btn-gradient text-primary-foreground" disabled={saving}>
              {saving ? t('common.saving') : t('auth.reset.save')}
            </Button>
            <FieldError message={saveError} className="text-sm" />

            <button type="button" className="text-sm text-secondary hover:underline" onClick={() => void signOut()}>
              {t('auth.reset.signOutInstead')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
