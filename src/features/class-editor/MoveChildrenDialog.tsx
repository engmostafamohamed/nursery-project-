import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { classEditorErrorKey, placesAfter, type OtherClass } from './classEditor';
import { useMoveChildren } from './classEditorApi';
import { OverCapacityNote } from './OverCapacityNote';

/**
 * Moving children (one or several) to another class: each class shows how full it is; going over
 * its places needs a tick. Their parents are told the new class.
 */
export function MoveChildrenDialog({ childIds, names, classes, onClose }: {
  childIds: string[];
  /** The children's names, for the title (one) or the count (several). */
  names: string[];
  classes: OtherClass[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [target, setTarget] = useState('');
  const [tried, setTried] = useState(false);
  const [overOk, setOverOk] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const move = useMoveChildren();
  const cls = classes.find((c) => c.id === target) ?? null;
  const places = cls ? placesAfter(cls.children, childIds.length, cls.capacity) : null;
  const className = (c: OtherClass) => (isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr);

  const submit = async () => {
    setTried(true);
    if (!cls || (places?.over && !overOk) || move.isPending) return;
    setProblem(null);
    try {
      await move.mutateAsync({ childIds, classId: cls.id, overCapacityOk: overOk });
      toast.success(t('classEditor.move.done', { count: childIds.length, class: className(cls) }));
      onClose();
    } catch (error) {
      setProblem(t(classEditorErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !move.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="move-children-dialog">
        <DialogHeader>
          <DialogTitle>{names.length === 1 ? t('classEditor.move.titleOne', { name: names[0] }) : t('classEditor.move.titleMany', { count: names.length })}</DialogTitle>
          <DialogDescription>{t('classEditor.move.description')}</DialogDescription>
        </DialogHeader>
        <FormField id="move-target" label={t('classEditor.move.to')} error={tried && !cls ? t('classEditor.move.required') : null}>
          <Select id="move-target" value={target} onChange={(e) => { setTarget(e.target.value); setOverOk(false); }} className={cn(tried && !cls && invalidFieldClass)}>
            <option value="">{t('classEditor.move.choose')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {className(c)}{c.gradeLevel ? ` · ${c.gradeLevel}` : ''} · {c.capacity != null ? t('classEditor.move.fill', { count: c.children, capacity: c.capacity }) : t('classEditor.move.fillNoLimit', { count: c.children })}
              </option>
            ))}
          </Select>
        </FormField>
        {cls && places ? (
          <p className="text-xs text-on-surface-variant">
            {cls.capacity == null ? t('classEditor.add.noLimit', { after: places.after }) : t('classEditor.add.places', { after: places.after, capacity: cls.capacity })}
          </p>
        ) : null}
        {places?.over ? <OverCapacityNote over={places.over} checked={overOk} onChange={setOverOk} /> : null}
        <FormProblem message={problem} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={move.isPending}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void submit()} disabled={move.isPending || Boolean(places?.over && !overOk)} data-testid="move-children-confirm">
            {move.isPending ? t('common.saving') : t('classEditor.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
