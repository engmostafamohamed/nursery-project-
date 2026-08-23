import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChildVaccinationsRow } from '@/types/tables/child_health';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChildVaccinationsRow | null;
  onSubmit: (patch: Partial<ChildVaccinationsRow>) => void;
  isBusy: boolean;
};

const MOH_KEYS = [
  'bcg', 'hepb', 'polio', 'dtp', 'hib', 'hepa', 'mmr',
  'varicella', 'meningococcal', 'hpv', 'td', 'covid', 'other',
] as const;

type Fields = {
  preset: string;
  customName: string;
  dose_number: number;
  date_administered: string;
  next_due_date: string;
  administered_by: string;
  batch_number: string;
};

const DEFAULT_FIELDS: Fields = {
  preset: 'bcg',
  customName: '',
  dose_number: 1,
  date_administered: '',
  next_due_date: '',
  administered_by: '',
  batch_number: '',
};

export function HealthVaccinationDialog({ open, onOpenChange, initial, onSubmit, isBusy }: Props) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Fields>(DEFAULT_FIELDS);

  useEffect(() => {
    if (!open) return;
    setFields(
      initial
        ? {
            preset: 'other',
            customName: initial.vaccine_name,
            dose_number: initial.dose_number,
            date_administered: initial.date_administered ?? '',
            next_due_date: initial.next_due_date ?? '',
            administered_by: initial.administered_by ?? '',
            batch_number: initial.batch_number ?? '',
          }
        : DEFAULT_FIELDS,
    );
  }, [open, initial]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const vaccineName =
    fields.preset === 'other' ? fields.customName.trim() : t(`health.mohVaccines.${fields.preset}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t('health.dialog.editVaccination') : t('health.dialog.addVaccination')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="vac">{t('health.fields.vaccineName')}</Label>
            <select
              id="vac"
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
              value={fields.preset}
              onChange={(e) => set('preset', e.target.value)}
            >
              {MOH_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`health.mohVaccines.${k}`)}
                </option>
              ))}
            </select>
          </div>
          {fields.preset === 'other' && (
            <div className="space-y-1.5">
              <Label htmlFor="cust">{t('health.fields.customVaccine')}</Label>
              <Input id="cust" value={fields.customName} onChange={(e) => set('customName', e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="dose">{t('health.fields.doseNumber')}</Label>
            <Input
              id="dose"
              type="number"
              min={1}
              value={fields.dose_number}
              onChange={(e) => set('dose_number', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="giv">{t('health.fields.dateAdministered')}</Label>
            <Input id="giv" type="date" value={fields.date_administered} onChange={(e) => set('date_administered', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">{t('health.fields.nextDue')}</Label>
            <Input id="due" type="date" value={fields.next_due_date} onChange={(e) => set('next_due_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="by">{t('health.fields.administeredBy')}</Label>
            <Input id="by" value={fields.administered_by} onChange={(e) => set('administered_by', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bat">{t('health.fields.batch')}</Label>
            <Input id="bat" value={fields.batch_number} onChange={(e) => set('batch_number', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isBusy || !vaccineName}
            onClick={() =>
              onSubmit({
                vaccine_name: vaccineName,
                dose_number: Number.isFinite(fields.dose_number) && fields.dose_number > 0 ? fields.dose_number : 1,
                date_administered: fields.date_administered || null,
                next_due_date: fields.next_due_date || null,
                administered_by: fields.administered_by.trim() || null,
                batch_number: fields.batch_number.trim() || null,
              })
            }
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
