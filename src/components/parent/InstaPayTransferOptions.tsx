import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

type Props = {
  accountName: string | null;
  accountNumber: string | null;
  qrImageUrl: string | null;
};

export function InstaPayTransferOptions({ accountName, accountNumber, qrImageUrl }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const normalizedAccountNumber = accountNumber?.trim() ?? '';

  const copyAccount = async () => {
    if (!normalizedAccountNumber) return;
    try {
      await navigator.clipboard.writeText(normalizedAccountNumber);
      setCopied(true);
      toast.success(t('payment.instaPay.copied'));
    } catch (error) {
      setCopied(false);
      toast.error(t('payment.instaPay.copyFailed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <section className="space-y-3" aria-label={t('payment.instaPay.title')}>
      <h3 className="text-sm font-semibold text-on-surface">{t('payment.instaPay.title')}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MaterialSymbol name="account_balance" />
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-on-surface">{t('payment.instaPay.accountTitle')}</h4>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t('payment.instaPay.accountDescription')}</p>
            </div>
          </div>
          <div className="my-4 flex-1 rounded-xl bg-surface-container p-3">
            <p className="text-xs text-on-surface-variant">{t('payment.instaPay.accountName')}</p>
            <p className="mt-1 break-words font-semibold text-on-surface">
              {accountName?.trim() || t('payment.instaPay.notConfigured')}
            </p>
            <p className="mt-3 text-xs text-on-surface-variant">{t('payment.instaPay.accountNumber')}</p>
            <p dir="ltr" className="mt-1 break-all font-mono text-lg font-bold tracking-wide text-primary">
              {normalizedAccountNumber || '—'}
            </p>
          </div>
          <Button type="button" variant="outline" disabled={!normalizedAccountNumber} onClick={() => void copyAccount()}>
            <MaterialSymbol name={copied ? 'check' : 'content_copy'} size="text-base" />
            {t(copied ? 'payment.instaPay.copiedButton' : 'payment.instaPay.copyButton')}
          </Button>
        </div>

        <div className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MaterialSymbol name="qr_code_2" />
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-on-surface">{t('payment.instaPay.qrTitle')}</h4>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t('payment.instaPay.qrDescription')}</p>
            </div>
          </div>
          <div className="my-4 flex min-h-44 flex-1 items-center justify-center rounded-xl bg-surface-container p-3">
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt={t('payment.instaPay.qrAlt')}
                className="max-h-56 w-full max-w-56 object-contain"
              />
            ) : (
              <p className="max-w-xs text-center text-sm text-on-surface-variant">
                {t('payment.instaPay.qrNotConfigured')}
              </p>
            )}
          </div>
          <p className="text-xs leading-5 text-on-surface-variant">{t('payment.instaPay.qrSafetyNote')}</p>
        </div>
      </div>
    </section>
  );
}
