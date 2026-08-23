import { ChatPanel } from '@/components/chat/ChatPanel';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';

export function ParentMessagesPage() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  if (!user) return null;

  return (
    <ChatPanel
      role="parent"
      currentUserId={user.id}
      nurseryId={profile?.nursery_id ?? null}
      languagePref={languagePref}
      className="h-[calc(100dvh-11rem)]"
    />
  );
}
