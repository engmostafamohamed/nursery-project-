import { useTranslation } from 'react-i18next';

import { CommunityPostsTable } from '@/components/community/CommunityPostsTable';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useCommunity } from '@/hooks/useCommunity';
import { useUserProfile } from '@/hooks/useUserProfile';

export function TeacherCommunityPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const community = useCommunity(profile?.nursery_id ?? undefined, user?.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('community.teacherTitle')}</h1>
      <CommunityPostsTable community={community} />
    </div>
  );
}
