import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { classEditorErrorKey, type OtherClass } from './classEditor';
import { useDeleteClassSafely } from './classEditorApi';

/**
 * Deleting a class. Its children are never left without one: when it has any, the class they move
 * to is chosen first. Its team leaves it. Cannot be undone.
 */
export function DeleteClassDialog({ classId, className, childrenCount, classes, onDeleted, onClose }: {
  classId: string;
  className: string;
  childrenCount: number;
  classes: OtherClass[];
  onDeleted: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [target, setTarget] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = useDeleteClassSafely();
  const needsTarget = childrenCount > 0;

  const submit = async () => {
    setTried(true);
    if ((needsTarget && !target) || remove.isPending) return;
    setProblem(null);
    try {
      await remove.mutateAsync({ classId, moveTo: needsTarget ? target : null });
      toast.success(t('classEditor.delete.done', { class: className }));
      onDeleted();
    } catch (error) {
      setProblem(t(classEditorErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="delete-class-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="delete_forever" size="text-xl" className="text-error" />
            {t('classEditor.delete.title', { class: className })}
          </DialogTitle>
          <DialogDescription>{needsTarget ? t('classEditor.delete.withChildren', { count: childrenCount }) : t('classEditor.delete.empty')}</DialogDescription>
        </DialogHeader>
        {needsTarget ? (
          classes.length ? (
            <FormField id="delete-target" label={t('classEditor.delete.moveTo')} error={tried && !target ? t('classEditor.move.required') : null}>
              <Select id="delete-target" value={target} onChange={(e) => setTarget(e.target.value)} className={cn(tried && !target && invalidFieldClass)}>
                <option value="">{t('classEditor.move.choose')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr} · {c.capacity != null ? t('classEditor.move.fill', { count: c.children, capacity: c.capacity }) : t('classEditor.move.fillNoLimit', { count: c.children })}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-on-surface">{t('classEditor.delete.noOtherClass')}</p>
          )
        ) : null}
        <p className="text-xs text-on-surface-variant">{t('classEditor.delete.teamLeaves')}</p>
        <FormProblem message={problem} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={remove.isPending}>{t('common.cancel')}</Button>
          <Button type="button" variant="destructive" onClick={() => void submit()} disabled={remove.isPending || (needsTarget && !classes.length)} data-testid="delete-class-confirm">
            {remove.isPending ? t('common.saving') : t('classEditor.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
