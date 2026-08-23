import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

const reactions = [
  { key: 'love', icon: 'favorite' },
  { key: 'thanks', icon: 'thumb_up' },
  { key: 'happy', icon: 'sentiment_very_satisfied' },
] as const;

type Props = {
  initialReaction?: string | null;
  initialComment?: string | null;
  onSave: (payload: { reaction?: string; comment?: string }) => Promise<void>;
};

export function ReportReactionButtons({ initialReaction, initialComment, onSave }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>(initialReaction ?? '');
  const [comment, setComment] = useState(initialComment ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(initialReaction ?? '');
    setComment(initialComment ?? '');
  }, [initialReaction, initialComment]);

  const save = async () => {
    try {
      setSaving(true);
      await onSave({ reaction: selected || undefined, comment: comment.trim() || undefined });
      toast.success(t('parent.reports.reactionSaved'));
    } catch {
      toast.error(t('parent.reports.actionError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-on-surface">
        <MaterialSymbol name="forum" size="text-lg" />
        {t('parent.reports.reactionsTitle')}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {reactions.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs ${
              selected === key ? 'border-primary bg-primary/10' : 'border-outline-variant'
            }`}
            onClick={() => setSelected(key)}
          >
            <MaterialSymbol name={icon} size="text-lg" />
            {t(`parent.reports.reactions.${key}`)}
          </button>
        ))}
      </div>
      <Input
        maxLength={200}
        placeholder={t('parent.reports.commentPlaceholder')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
        {t('parent.reports.addComment')}
      </Button>
    </div>
  );
}
