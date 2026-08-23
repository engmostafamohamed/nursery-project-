import { HelpPanel } from '@/components/help/HelpPanel';
import { AIAssistant } from '@/components/ai/AIAssistant';
import { HelpAiKeyboardShortcuts } from '@/components/shared/HelpAiKeyboardShortcuts';
import { HelpAiRouteTracker } from '@/components/shared/HelpAiRouteTracker';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { mapProfileRoleToSurface } from '@/lib/aiContext';
import { isAiAssistantEnabled, isHelpPanelEnabled } from '@/lib/helpAiPreferences';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';
import type { UserRole } from '@/types/user';

interface Props {
  /** Fallback when profile is still loading or role mapping is unexpected. */
  layoutRole: 'admin' | 'teacher' | 'parent';
}

function roleFromLayout(layoutRole: Props['layoutRole']): UserRole {
  if (layoutRole === 'admin') return 'branch_admin';
  if (layoutRole === 'teacher') return 'teacher';
  return 'parent';
}

export function HelpAiBundle({ layoutRole }: Props) {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const helpOpen = useHelpAiUiStore((s) => s.helpOpen);
  const setHelpOpen = useHelpAiUiStore((s) => s.setHelpOpen);

  const surfaceRole =
    profile?.role != null ? (mapProfileRoleToSurface(profile.role) ?? layoutRole) : layoutRole;

  const helpOk = isHelpPanelEnabled();
  const aiOk = isAiAssistantEnabled();

  return (
    <>
      <HelpAiRouteTracker />
      <HelpAiKeyboardShortcuts />
      {helpOk ? <HelpPanel open={helpOpen} onOpenChange={setHelpOpen} surfaceRole={surfaceRole} /> : null}
      {aiOk && user?.id ? (
        <AIAssistant
          surfaceRole={surfaceRole}
          userId={user.id}
          nurseryId={profile?.nursery_id ?? null}
          dbRole={profile?.role ?? roleFromLayout(layoutRole)}
        />
      ) : null}
    </>
  );
}
