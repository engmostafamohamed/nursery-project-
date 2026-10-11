import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';

type Props = {
  proofUrl: string;
};

export function SignedPaymentProofLink({ proofUrl }: Props) {
  const { t } = useTranslation();
  const [href, setHref] = useState<string | null>(proofUrl.startsWith('http') ? proofUrl : null);

  useEffect(() => {
    if (proofUrl.startsWith('http')) return;
    let active = true;
    void supabase.storage.from('payment-proofs').createSignedUrl(proofUrl, 10 * 60).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        toast.error(t('payment.admin.proofLoadFailed'), { description: error.message });
        return;
      }
      setHref(data.signedUrl);
    });
    return () => {
      active = false;
    };
  }, [proofUrl, t]);

  if (!href) {
    return <span className="mt-3 inline-flex items-center gap-1 text-xs text-on-surface-variant">{t('payment.admin.proofLoading')}</span>;
  }

  return (
    <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline" href={href} target="_blank" rel="noreferrer">
      <span className="material-symbols-outlined text-sm" aria-hidden>attach_file</span>
      {t('payment.admin.viewProof')}
    </a>
  );
}
