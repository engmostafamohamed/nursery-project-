import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { InquiryForm } from '@/components/public/InquiryForm';

export function PublicInquiryFormPage() {
  const { t } = useTranslation();
  const { nurseryId } = useParams();

  if (!nurseryId) return null;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 text-center">
        <h1 className="text-lg font-semibold text-on-surface">{t('admissions.public.title')}</h1>
        <p className="text-sm text-on-surface-variant">{t('admissions.public.subtitle')}</p>
      </div>
      <InquiryForm nurseryId={nurseryId} />
    </div>
  );
}
