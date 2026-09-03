import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/types/user';

type ResetMethod = 'email' | 'sms';

type ResetOption = {
  method: ResetMethod;
  value: string;
  label: string;
  description: string;
  icon: string;
};

function randomSixDigitCode(): string {
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(bytes);
  const source = bytes[0] || Math.floor(Math.random() * 900000);
  return String(100000 + (source % 900000));
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local.slice(0, 1) : `${local.slice(0, 2)}...${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  return `${phone.slice(0, 3)}...${digits.slice(-4)}`;
}

function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(email?.trim()) && !email!.endsWith('@parents.xo.local') && !email!.endsWith('@parent.placeholder.xo');
}

export function ParentPasswordResetCard({ profile }: { profile: UserRow | null | undefined }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<ResetMethod | ''>('');
  const [sentCode, setSentCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const options = useMemo<ResetOption[]>(() => {
    const rows: ResetOption[] = [];
    if (isDeliverableEmail(profile?.email)) {
      rows.push({
        method: 'email',
        value: profile.email,
        label: t('parent.dashboard.passwordReset.methodEmail'),
        description: maskEmail(profile.email),
        icon: 'mail',
      });
    }
    if (profile?.phone?.trim()) {
      rows.push({
        method: 'sms',
        value: profile.phone.trim(),
        label: t('parent.dashboard.passwordReset.methodSms'),
        description: maskPhone(profile.phone.trim()),
        icon: 'sms',
      });
    }
    return rows;
  }, [profile?.email, profile?.phone, t]);

  const selectedOption = options.find((option) => option.method === selectedMethod) ?? null;
  const canSend = Boolean(profile?.id && profile?.nursery_id && selectedOption);
  const canSubmit = Boolean(sentCode && enteredCode.trim() && newPassword && confirmPassword);

  const resetDialogState = () => {
    setSelectedMethod(options[0]?.method ?? '');
    setSentCode('');
    setEnteredCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      resetDialogState();
    }
  };

  const sendVerificationCode = async () => {
    if (!profile?.id || !profile.nursery_id || !selectedOption) return;
    const code = randomSixDigitCode();
    setIsSending(true);
    try {
      if (selectedOption.method === 'email') {
        const { error } = await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: 'password_reset',
            recipient_email: selectedOption.value,
            language: i18n.language.startsWith('en') ? 'en' : 'ar',
            nursery_id: profile.nursery_id,
            user_id: profile.id,
            data: {
              otp_code: code,
              name: profile.name_en || profile.name_ar || 'Parent',
            },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke('sms-dispatch', {
          body: {
            trigger_type: 'otp_login',
            recipient_phone: selectedOption.value,
            language: i18n.language.startsWith('en') ? 'en' : 'ar',
            nursery_id: profile.nursery_id,
            user_id: profile.id,
            data: { otp_code: code },
          },
        });
        if (error) throw error;
      }
      setSentCode(code);
      setEnteredCode('');
      toast.success(t('parent.dashboard.passwordReset.codeSent'));
    } catch (error) {
      toast.error(`${t('parent.dashboard.passwordReset.codeFailed')} (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      setIsSending(false);
    }
  };

  const updatePassword = async () => {
    if (!sentCode) return;
    if (enteredCode.trim() !== sentCode) {
      toast.error(t('parent.dashboard.passwordReset.codeInvalid'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('parent.dashboard.passwordReset.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('parent.dashboard.passwordReset.passwordMismatch'));
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('parent.dashboard.passwordReset.updated'));
      setOpen(false);
      resetDialogState();
    } catch (error) {
      toast.error(`${t('parent.dashboard.passwordReset.updateFailed')} (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary-container text-secondary">
            <MaterialSymbol name="lock_reset" size="text-2xl" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{t('parent.dashboard.passwordReset.title')}</h2>
            <p className="mt-1 max-w-prose text-sm leading-5 text-on-surface-variant">{t('parent.dashboard.passwordReset.subtitle')}</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="w-full justify-center sm:w-auto" onClick={() => handleOpenChange(true)}>
          <MaterialSymbol name="lock_reset" size="text-base" />
          <span>{t('parent.dashboard.passwordReset.open')}</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('parent.dashboard.passwordReset.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('parent.dashboard.passwordReset.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {options.length > 0 ? (
              <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as ResetMethod)}>
                {options.map((option) => (
                  <label
                    key={option.method}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant p-3 transition-colors hover:bg-surface-container"
                  >
                    <RadioGroupItem value={option.method} />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MaterialSymbol name={option.icon} size="text-lg" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-on-surface">{option.label}</span>
                      <span className="block truncate text-xs text-on-surface-variant">{option.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-on-surface">
                {t('parent.dashboard.passwordReset.noMethods')}
              </div>
            )}

            <Button type="button" variant="secondary" disabled={!canSend || isSending} onClick={() => void sendVerificationCode()}>
              {isSending ? t('common.loading') : t('parent.dashboard.passwordReset.sendCode')}
            </Button>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parent-reset-code">{t('parent.dashboard.passwordReset.codeLabel')}</Label>
                <Input
                  id="parent-reset-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={enteredCode}
                  onChange={(event) => setEnteredCode(event.target.value.replace(/\D/g, ''))}
                  disabled={!sentCode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent-new-password">{t('parent.dashboard.passwordReset.newPassword')}</Label>
                <Input
                  id="parent-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={!sentCode}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="parent-confirm-password">{t('parent.dashboard.passwordReset.confirmPassword')}</Label>
                <Input
                  id="parent-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={!sentCode}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!canSubmit || isUpdating} onClick={() => void updatePassword()}>
              {isUpdating ? t('common.loading') : t('parent.dashboard.passwordReset.updatePassword')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
