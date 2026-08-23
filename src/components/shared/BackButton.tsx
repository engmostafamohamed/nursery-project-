import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { isTabRoot } from '@/lib/tabRootPaths';
import { cn } from '@/lib/utils';

type Variant = 'dark-on-light' | 'light-on-dark';

type Props = {
  /** Optional CSS classes to merge with the default styling. */
  className?: string;
  /**
   * Visual variant. 'dark-on-light' (default) works on light headers;
   * 'light-on-dark' inverts colors for dark header backgrounds.
   */
  variant?: Variant;
};

/**
 * Reads the `idx` that react-router stores in `history.state` to decide
 * whether we have in-app history to pop. Falls back to deriving a parent
 * path from the current pathname when idx is 0 (direct landing).
 */
function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
      return;
    }
    const parts = location.pathname.split('/').filter(Boolean);
    parts.pop();
    const parent = parts.length > 0 ? '/' + parts.join('/') : '/';
    navigate(parent, { replace: true });
  }, [navigate, location.pathname]);
}

export function BackButton({ className, variant = 'dark-on-light' }: Props) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const goBack = useBackNavigation();

  if (isTabRoot(location.pathname)) return null;

  const isRTL = i18n.language === 'ar';

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t('common.back')}
      title={t('common.back')}
      className={cn(
        'flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors',
        variant === 'dark-on-light'
          ? 'border-outline-variant bg-surface text-foreground hover:bg-surface-container'
          : 'border-white/20 bg-white/10 text-white hover:bg-white/20',
        className,
      )}
    >
      <MaterialSymbol
        name="arrow_back"
        size="text-base"
        className={isRTL ? 'scale-x-[-1]' : ''}
      />
    </button>
  );
}
