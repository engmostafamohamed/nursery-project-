import { useTranslation } from 'react-i18next';

import { applicationStatusUi } from '@/lib/applicationStatus';
import { cn } from '@/lib/utils';

export function ApplicationStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const ui = applicationStatusUi(status);
  return (
    <span className={cn('inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', ui.className, className)}>
      <span className="material-symbols-outlined text-sm" aria-hidden>{ui.icon}</span>
      {t(`applications.statuses.${status}`, { defaultValue: status })}
    </span>
  );
}
