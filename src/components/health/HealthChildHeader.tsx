import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ChildHealthChild } from '@/hooks/useChildHealth';
import { getUserInitials } from '@/lib/utils';

type Props = {
  child: ChildHealthChild;
  backTo: string;
  actions?: React.ReactNode;
};

export function HealthChildHeader({ child, backTo, actions }: Props) {
  const { t, i18n } = useTranslation();
  const displayName =
    i18n.language === 'ar'
      ? child.full_name_ar || child.full_name_en
      : child.full_name_en || child.full_name_ar;
  const initials = getUserInitials(displayName, '');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 border border-outline-variant">
          <AvatarImage src={child.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{displayName}</h1>
          <Link className="inline-flex items-center gap-1 text-sm text-secondary underline" to={backTo}>
            <span className="material-symbols-outlined text-base" aria-hidden>arrow_back</span>
            {t('health.backToChild')}
          </Link>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
