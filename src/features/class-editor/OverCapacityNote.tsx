import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

/** Going over a class's places: said plainly, and only with a tick that it is meant. */
export function OverCapacityNote({ over, checked, onChange }: { over: number; checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5" role="alert" data-testid="over-capacity">
      <p className="flex items-start gap-2 text-sm text-on-surface">
        <MaterialSymbol name="warning" size="text-lg" className="mt-px text-warning" />
        {t('classEditor.over.message', { count: over })}
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-on-surface">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        {t('classEditor.over.confirm')}
      </label>
    </div>
  );
}
