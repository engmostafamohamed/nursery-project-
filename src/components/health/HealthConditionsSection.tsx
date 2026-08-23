import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HealthConditionDialog } from '@/components/health/HealthConditionDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChildChronicConditionsRow } from '@/types/tables/child_health';

type Props = {
  items: ChildChronicConditionsRow[];
  readOnly: boolean;
  onAdd: (patch: Partial<ChildChronicConditionsRow>) => void;
  onEdit: (id: string, patch: Partial<ChildChronicConditionsRow>) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
};

export function HealthConditionsSection({ items, readOnly, onAdd, onEdit, onDelete, isBusy }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChildChronicConditionsRow | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('health.sections.conditions')}</CardTitle>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
              {t('health.actions.addCondition')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('health.empty.conditions')}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((c) => (
                <li key={c.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 text-sm">
                      <p className="text-base font-semibold">{c.condition_name}</p>
                      <p>
                        {t('health.fields.diagnosisDate')}:{' '}
                        {c.diagnosis_date
                          ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB').format(
                              new Date(c.diagnosis_date),
                            )
                          : '—'}
                      </p>
                      <p>
                        {t('health.fields.severity')}: {c.severity ?? '—'}
                      </p>
                      <p>
                        {t('health.fields.treatment')}: {c.treatment_protocol ?? '—'}
                      </p>
                      <p>
                        {t('health.fields.triggers')}: {c.trigger_factors ?? '—'}
                      </p>
                      <p>
                        {t('health.fields.emergencyPlan')}: {c.emergency_response_plan ?? '—'}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>
                          {t('common.edit')}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmId(c.id)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <HealthConditionDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSubmit={(payload) => {
          if (editing) onEdit(editing.id, payload);
          else onAdd(payload);
          setOpen(false);
          setEditing(null);
        }}
        isBusy={isBusy}
      />

      <Dialog open={Boolean(confirmId)} onOpenChange={() => setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('health.confirm.deleteConditionTitle')}</DialogTitle>
            <DialogDescription>{t('health.confirm.deleteConditionBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy}
              onClick={() => {
                if (confirmId) onDelete(confirmId);
                setConfirmId(null);
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
