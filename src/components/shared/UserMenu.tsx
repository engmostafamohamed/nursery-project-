import { LogOut, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import { getUserInitials } from '@/lib/utils';

/** Role-agnostic header account menu: avatar trigger → dropdown with the signed-in
 *  user's name/email, a profile link, and a Logout item. Generalized from
 *  AdminUserMenu so every layout (admin, teacher, parent) shares one logout path. */
type UserMenuProps = {
  /** Where the "Profile" item links to, e.g. "/teacher/profile". */
  profilePath: string;
  /** Optional label for the profile item; defaults to common.profile. */
  profileLabel?: string;
  /** Optional already-resolved display name for role-specific account labels. */
  displayNameOverride?: string;
};

export function UserMenu({ profilePath, profileLabel, displayNameOverride }: UserMenuProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  const displayName = displayNameOverride?.trim() || (i18n.language === 'ar'
      ? (profile?.name_ar?.trim() || profile?.name_en?.trim() || '')
      : (profile?.name_en?.trim() || profile?.name_ar?.trim() || ''));
  const email = profile?.email ?? user?.email ?? '';
  const initials = getUserInitials(displayName, email);
  const avatarSrc =
    displayName.length > 0
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=d4e3ff&color=001c3a`
      : undefined;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(t('common.logoutError'));
      return;
    }
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full p-0"
          aria-label={t('common.openMenu')}
        >
          <Avatar className="h-10 w-10">
            {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
            <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-on-surface">{displayName || email || '—'}</p>
            {email ? <p className="text-xs text-on-surface-variant break-all">{email}</p> : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={profilePath} className="flex cursor-pointer items-center gap-2">
            <User className="h-4 w-4" aria-hidden />
            {profileLabel ?? t('common.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-error focus:text-error"
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t('common.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
