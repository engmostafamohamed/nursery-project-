import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { isChunkLoadError, sessionStorageOrNull, shouldReloadForNewVersion } from '@/lib/appErrors';

/**
 * Catches a screen that crashes while drawing, so the person sees what happened and a way on
 * instead of a blank page. A screen that could not load because a new version was deployed
 * reloads by itself, once.
 *
 * resetKey: the screen tries again when it changes (the router passes the address, so moving to
 * another page clears the error).
 */
interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: unknown;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
    if (shouldReloadForNewVersion(error, sessionStorageOrNull())) window.location.reload();
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <AppErrorScreen newVersion={isChunkLoadError(this.state.error)} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function AppErrorScreen({ newVersion, onRetry }: { newVersion: boolean; onRetry: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div
      dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
      role="alert"
      className="flex min-h-[70vh] items-center justify-center bg-background p-4 text-on-background"
      data-testid="app-error-screen"
    >
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-surface-container-lowest p-6 text-center shadow-sm">
        <span className="material-symbols-outlined text-5xl text-primary" aria-hidden>
          {newVersion ? 'system_update' : 'sentiment_dissatisfied'}
        </span>
        <h1 className="font-headline text-xl font-bold text-on-surface">
          {newVersion ? t('appError.newVersionTitle') : t('appError.title')}
        </h1>
        <p className="text-sm text-on-surface-variant">{newVersion ? t('appError.newVersionBody') : t('appError.body')}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => window.location.reload()}>
            {t('appError.reload')}
          </Button>
          {newVersion ? null : (
            <Button type="button" variant="outline" onClick={onRetry}>
              {t('appError.retry')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => window.location.assign('/')}>
            {t('appError.home')}
          </Button>
        </div>
      </div>
    </div>
  );
}
