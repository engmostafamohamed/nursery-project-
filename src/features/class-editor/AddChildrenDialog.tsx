import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormProblem } from '@/components/ui/FormField';

import { classEditorErrorKey, placesAfter, type ClassEditor } from './classEditor';
import { useMoveChildren } from './classEditorApi';
import { ChildPickerTable } from './ChildPickerTable';
import { OverCapacityNote } from './OverCapacityNote';

/**
 * Adding children to a class: pick them (without a class, or from another class: they move), see
 * what that does to the places, and confirm going over them if it does. Their parents are told.
 */
export function AddChildrenDialog({ editor, className, onClose }: { editor: ClassEditor; className: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overOk, setOverOk] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const move = useMoveChildren();
  const capacity = editor.cls?.capacity ?? null;
  const places = placesAfter(editor.children.length, selected.size, capacity);
  const moving = editor.candidates.filter((c) => selected.has(c.id) && c.classId).length;

  const submit = async () => {
    if (!editor.cls || !selected.size || (places.over && !overOk) || move.isPending) return;
    setProblem(null);
    try {
      const result = await move.mutateAsync({ childIds: [...selected], classId: editor.cls.id, overCapacityOk: overOk });
      toast.success(t('classEditor.add.done', { count: result.moved, class: className }));
      onClose();
    } catch (error) {
      setProblem(t(classEditorErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !move.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="add-children-dialog">
        <DialogHeader>
          <DialogTitle>{t('classEditor.add.title', { class: className })}</DialogTitle>
          <DialogDescription>{t('classEditor.add.description')}</DialogDescription>
        </DialogHeader>
        <ChildPickerTable candidates={editor.candidates} selected={selected} onChange={(next) => { setSelected(next); setProblem(null); }} today={editor.today} />
        <div className="space-y-2 rounded-xl bg-surface-high px-4 py-3 text-sm" aria-live="polite">
          <p className="text-on-surface">
            {t('classEditor.add.summary', { count: selected.size })}
            {moving ? <span className="text-on-surface-variant"> · {t('classEditor.add.moving', { count: moving })}</span> : null}
          </p>
          <p className="text-xs text-on-surface-variant">
            {capacity == null ? t('classEditor.add.noLimit', { after: places.after }) : t('classEditor.add.places', { after: places.after, capacity })}
          </p>
          {places.over ? <OverCapacityNote over={places.over} checked={overOk} onChange={setOverOk} /> : null}
        </div>
        <FormProblem message={problem} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={move.isPending}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void submit()} disabled={!selected.size || (places.over > 0 && !overOk) || move.isPending} data-testid="add-children-confirm">
            {move.isPending ? t('common.saving') : t('classEditor.add.confirm', { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
