import { useTranslation } from 'react-i18next';

import { AiToolSafetyDialog } from '@/components/ai/AiToolSafetyDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAiAssistantController } from '@/hooks/useAiAssistantController';
import { useAiAssistantPanelPosition } from '@/hooks/useAiAssistantPanelPosition';
import { AI_DAILY_REQUEST_LIMIT, getAiQuotaState } from '@/lib/aiRateLimit';
import type { AiSurfaceRole } from '@/lib/aiContext';
import { cn } from '@/lib/utils';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';
import type { UserRole } from '@/types/user';

interface Props {
  surfaceRole: AiSurfaceRole;
  userId: string;
  nurseryId: string | null;
  dbRole: UserRole;
}

export function AIAssistant({ surfaceRole, userId, nurseryId, dbRole }: Props) {
  const { t } = useTranslation();
  const aiOpen = useHelpAiUiStore((s) => s.aiOpen);
  const setAiOpen = useHelpAiUiStore((s) => s.setAiOpen);
  const quota = getAiQuotaState(userId);

  const {
    online,
    messages,
    draft,
    setDraft,
    loading,
    send,
    confirm,
    onConfirmTool,
    onCancelConfirm,
  } = useAiAssistantController({ surfaceRole, userId, nurseryId, dbRole });

  const { panelRef, contentStyle, headerPointerHandlers, headerClassName, isDesktop } =
    useAiAssistantPanelPosition(userId, aiOpen);

  return (
    <>
      {!aiOpen ? (
        <button
          type="button"
          className={cn(
            'fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:opacity-90 disabled:opacity-40',
          )}
          aria-label={t('ai.openAssistant')}
          title={!online ? t('ai.tooltipOffline') : t('ai.openAssistant')}
          disabled={!online}
          onClick={() => setAiOpen(true)}
        >
          <span className="material-symbols-outlined text-2xl" aria-hidden>
            smart_toy
          </span>
        </button>
      ) : null}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent
          ref={panelRef}
          style={contentStyle}
          className={cn(
            'flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0',
            'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:max-h-[90vh] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-3xl',
            'md:left-1/2 md:top-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2',
          )}
        >
          <DialogHeader
            className={cn('border-b border-outline-variant px-4 py-3', headerClassName)}
            title={isDesktop ? t('ai.dragHeaderHint') : undefined}
            {...headerPointerHandlers}
          >
            <DialogTitle className="text-base">{t('ai.title')}</DialogTitle>
            <p className="text-xs text-on-surface-variant">
              {t('ai.quota', { used: quota.used, limit: AI_DAILY_REQUEST_LIMIT })}
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t('ai.emptyState')}</p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm',
                    m.role === 'user' ? 'ms-8 bg-primary-container/30 text-on-surface' : 'me-8 bg-surface-container text-on-surface',
                  )}
                >
                  {m.content}
                </div>
              ))
            )}
            {loading ? (
              <div className="py-2" aria-busy="true">
                <Skeleton className="h-16 w-full rounded-xl" />
                <p className="mt-2 text-xs text-on-surface-variant">{t('ai.thinking')}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-outline-variant px-4 py-3 sm:justify-between">
            <div className="flex w-full flex-col gap-2 md:flex-row">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('ai.inputPlaceholder')}
                className="min-h-[44px] flex-1 resize-none"
                disabled={loading || !online}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setAiOpen(false)}>
                  {t('common.close')}
                </Button>
                <Button type="button" className="min-h-11" disabled={loading || !online} onClick={() => void send()}>
                  {t('ai.send')}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiToolSafetyDialog confirm={confirm} onConfirm={onConfirmTool} onCancel={onCancelConfirm} />
    </>
  );
}
