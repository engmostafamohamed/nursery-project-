import { useTranslation } from 'react-i18next';

import { SignedFileLink } from '@/components/ui/SignedFileLink';

/** The proof a family attached to a payment. */
export function SignedPaymentProofLink({ proofUrl }: { proofUrl: string }) {
  const { t } = useTranslation();
  return <SignedFileLink bucket="payment-proofs" path={proofUrl} label={t('payment.admin.viewProof')} className="mt-3" />;
}
