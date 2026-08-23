import { useTranslation } from 'react-i18next';

import { ImportWizard } from '@/components/admin/ImportWizard';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminBulkImportPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  if (!profile?.nursery_id) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('import.title')}</h1>
      <ImportWizard nurseryId={profile.nursery_id} importedBy={user?.id} />
    </div>
  );
}
