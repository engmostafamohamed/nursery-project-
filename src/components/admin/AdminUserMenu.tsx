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

export function AdminUserMenu() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  const displayName =
    i18n.language === 'ar'
      ? (profile?.name_ar?.trim() || profile?.name_en?.trim() || '')
      : (profile?.name_en?.trim() || profile?.name_ar?.trim() || '');
  const email = profile?.email ?? user?.email ?? '';
  const initials = getUserInitials(displayName, email);
  const avatarSrc =
    displayName.length > 0
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=eceef0&color=191c1e`
      : undefined;

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(t('admin.userMenu.logoutError'));
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
          aria-label={t('admin.userMenu.openMenu')}
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
            <p className="text-sm font-medium text-on-surface">{displayName || t('admin.userMenu.fallbackName')}</p>
            <p className="text-xs text-on-surface-variant break-all">{email || '—'}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/admin/profile" className="flex cursor-pointer items-center gap-2">
            <User className="h-4 w-4" aria-hidden />
            {t('admin.userMenu.profileSettings')}
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
          {t('admin.userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
