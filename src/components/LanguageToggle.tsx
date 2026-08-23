import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LanguageToggle({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn('gap-2', className)}
      aria-label={t('nav.language')}
      onClick={() => void i18n.changeLanguage(next)}
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span className="text-sm font-medium">
        {i18n.language === 'ar' ? 'English' : 'العربية'}
      </span>
    </Button>
  );
}
