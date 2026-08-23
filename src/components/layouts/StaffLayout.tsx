import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { BackButton } from '@/components/shared/BackButton';
import { cn } from '@/lib/utils';

export function StaffLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="text-sm font-semibold text-on-surface">{t('payroll.staffPortalTitle')}</h1>
          </div>
          <NavLink
            to="/staff/payslips"
            className={({ isActive }) => cn('rounded-full px-3 py-1 text-xs', isActive ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant')}
          >
            {t('payroll.payslipsNav')}
          </NavLink>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
