import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HealthMedicationDialog } from '@/components/health/HealthMedicationDialog';
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
import type { ChildMedicationsRow } from '@/types/tables/child_health';

type Props = {
  items: ChildMedicationsRow[];
  readOnly: boolean;
  onAdd: (patch: Partial<ChildMedicationsRow>) => void;
  onEdit: (id: string, patch: Partial<ChildMedicationsRow>) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
};

export function HealthMedicationsSection({ items, readOnly, onAdd, onEdit, onDelete, isBusy }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChildMedicationsRow | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const today = todayYmdLocal();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('health.sections.medications')}</CardTitle>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
              {t('health.actions.addMedication')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('health.empty.medications')}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((m) => {
                const expired = m.expiry_date ? m.expiry_date < today : false;
                return (
                  <li
                    key={m.id}
                    className={`rounded-xl border p-3 ${
                      expired ? 'border-error bg-error-container' : 'border-outline-variant bg-surface-container-low'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 text-sm">
                        <p className="text-base font-semibold">{m.name}</p>
                        {expired && (
                          <Badge className="border-error bg-error text-white">{t('health.alerts.medicationExpired')}</Badge>
                        )}
                        <p>
                          {t('health.fields.dosage')}: {m.dosage ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.times')}: {m.administration_times ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.method')}: {t(`health.method.${m.administration_method}`)}
                        </p>
                        <p>
                          {t('health.fields.storage')}: {m.storage_requirements ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.expiry')}: {m.expiry_date ?? '—'}
                        </p>
                        <p>
                          {t('health.fields.consent')}: {t(`health.consent.${m.parent_consent_status}` as const)}
                        </p>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(m); setOpen(true); }}>
                            {t('common.edit')}
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmId(m.id)}>
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

      <HealthMedicationDialog
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
            <DialogTitle>{t('health.confirm.deleteMedicationTitle')}</DialogTitle>
            <DialogDescription>{t('health.confirm.deleteMedicationBody')}</DialogDescription>
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
