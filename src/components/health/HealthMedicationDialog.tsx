import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChildMedicationsRow, MedicationAdminMethod, ParentConsentStatus } from '@/types/tables/child_health';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChildMedicationsRow | null;
  onSubmit: (patch: Partial<ChildMedicationsRow>) => void;
  isBusy: boolean;
};

const METHODS: MedicationAdminMethod[] = ['oral', 'inhaler', 'injection', 'topical'];
const CONSENTS: ParentConsentStatus[] = ['pending', 'granted', 'denied'];

type Fields = {
  name: string;
  dosage: string;
  administration_times: string;
  administration_method: MedicationAdminMethod;
  storage_requirements: string;
  expiry_date: string;
  parent_consent_status: ParentConsentStatus;
};

const DEFAULT_FIELDS: Fields = {
  name: '',
  dosage: '',
  administration_times: '',
  administration_method: 'oral',
  storage_requirements: '',
  expiry_date: '',
  parent_consent_status: 'pending',
};

export function HealthMedicationDialog({ open, onOpenChange, initial, onSubmit, isBusy }: Props) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Fields>(DEFAULT_FIELDS);

  useEffect(() => {
    if (!open) return;
    setFields(
      initial
        ? {
            name: initial.name,
            dosage: initial.dosage ?? '',
            administration_times: initial.administration_times ?? '',
            administration_method: initial.administration_method,
            storage_requirements: initial.storage_requirements ?? '',
            expiry_date: initial.expiry_date ?? '',
            parent_consent_status: initial.parent_consent_status,
          }
        : DEFAULT_FIELDS,
    );
  }, [open, initial]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t('health.dialog.editMedication') : t('health.dialog.addMedication')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mn">{t('health.fields.medicationName')}</Label>
            <Input id="mn" value={fields.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dose">{t('health.fields.dosage')}</Label>
            <Input id="dose" value={fields.dosage} onChange={(e) => set('dosage', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tm">{t('health.fields.times')}</Label>
            <Input id="tm" value={fields.administration_times} onChange={(e) => set('administration_times', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meth">{t('health.fields.method')}</Label>
            <select
              id="meth"
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
              value={fields.administration_method}
              onChange={(e) => set('administration_method', e.target.value as MedicationAdminMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`health.method.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st">{t('health.fields.storage')}</Label>
            <Input id="st" value={fields.storage_requirements} onChange={(e) => set('storage_requirements', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex">{t('health.fields.expiry')}</Label>
            <Input id="ex" type="date" value={fields.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs">{t('health.fields.consent')}</Label>
            <select
              id="cs"
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
              value={fields.parent_consent_status}
              onChange={(e) => set('parent_consent_status', e.target.value as ParentConsentStatus)}
            >
              {CONSENTS.map((c) => (
                <option key={c} value={c}>
                  {t(`health.consent.${c}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isBusy || !fields.name.trim()}
            onClick={() =>
              onSubmit({
                name: fields.name.trim(),
                dosage: fields.dosage.trim() || null,
                administration_times: fields.administration_times.trim() || null,
                administration_method: fields.administration_method,
                storage_requirements: fields.storage_requirements.trim() || null,
                expiry_date: fields.expiry_date || null,
                parent_consent_status: fields.parent_consent_status,
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
