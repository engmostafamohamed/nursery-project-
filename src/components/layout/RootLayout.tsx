import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';

import { ConfirmHost } from '@/components/ui/confirm';
import { cn } from '@/lib/utils';

/**
 * Root shell: `dir`/`lang` sync with i18n. RTL layout, spacing, and major surfaces were reviewed
 * for Arabic (Wave 6); see `src/utils/rtlTestingChecklist.ts` for manual QA notes.
 */
export function RootLayout() {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [isRTL, i18n.language]);

  return (
    <div className={cn('min-h-screen bg-background text-on-background', !isRTL && 'font-body')}>
      <Outlet />
      <Toaster richColors position="top-center" />
      <ConfirmHost />
    </div>
  );
}
