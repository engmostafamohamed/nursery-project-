import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HealthVaccinationDialog } from '@/components/health/HealthVaccinationDialog';
import { Badge } from '@/components/ui/badge';
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
import { todayYmdLocal } from '@/lib/healthAlertsCompute';
import type { ChildVaccinationsRow } from '@/types/tables/child_health';

type Props = {
  items: ChildVaccinationsRow[];
  readOnly: boolean;
  onAdd: (patch: Partial<ChildVaccinationsRow>) => void;
  onEdit: (id: string, patch: Partial<ChildVaccinationsRow>) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
};

export function HealthVaccinationsSection({ items, readOnly, onAdd, onEdit, onDelete, isBusy }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChildVaccinationsRow | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const today = todayYmdLocal();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('health.sections.vaccinations')}</CardTitle>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
              {t('health.actions.addVaccination')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('health.empty.vaccinations')}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((v) => {
                const overdue = v.next_due_date ? v.next_due_date < today : false;
                return (
                  <li
                    key={v.id}
                    className={`rounded-xl border p-3 ${
                      overdue ? 'border-error bg-error-container' : 'border-outline-variant bg-surface-container-low'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 text-sm">
                        <p className="text-base font-semibold">{v.vaccine_name}</p>
                        {overdue && (
                          <Badge className="border-error bg-error text-white">{t('health.alerts.vaccineOverdue')}</Badge>
                        )}
                        <p>
                          {t('health.fields.doseNumber')}: {v.dose_number}
                        </p>
                        <p>
                          {t('health.fields.dateAdministered')}:{' '}
                          {v.date_administered
                            ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB').format(
                                new Date(v.date_administered),
                              )
                            : '—'}
                        </p>
                        <p>
                          {t('health.fields.nextDue')}: {v.next_due_date ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.administeredBy')}: {v.administered_by ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.batch')}: {v.batch_number ?? '—'}
                        </p>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(v); setOpen(true); }}>
                            {t('common.edit')}
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmId(v.id)}>
                            {t('common.delete')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <HealthVaccinationDialog
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
            <DialogTitle>{t('health.confirm.deleteVaccinationTitle')}</DialogTitle>
            <DialogDescription>{t('health.confirm.deleteVaccinationBody')}</DialogDescription>
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
