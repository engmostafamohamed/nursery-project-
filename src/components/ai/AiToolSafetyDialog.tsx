import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { assessAiActionSafety, formatSafetyPreview } from '@/lib/aiSafety';

type ConfirmState = {
  name: string;
  input: Record<string, unknown>;
  resolve: (value: string) => void;
} | null;

interface Props {
  confirm: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AiToolSafetyDialog({ confirm, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const assessment = confirm ? assessAiActionSafety(confirm.name, confirm.input) : null;

  return (
    <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ai.safety.title')}</DialogTitle>
        </DialogHeader>
        {assessment ? (
          <p className="text-sm text-on-surface">{formatSafetyPreview(t, assessment)}</p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void onConfirm()}>
            {t('ai.safety.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
