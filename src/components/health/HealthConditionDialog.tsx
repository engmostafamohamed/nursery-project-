import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChildChronicConditionsRow } from '@/types/tables/child_health';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChildChronicConditionsRow | null;
  onSubmit: (patch: Partial<ChildChronicConditionsRow>) => void;
  isBusy: boolean;
};

type Fields = {
  condition_name: string;
  diagnosis_date: string;
  severity: string;
  treatment_protocol: string;
  trigger_factors: string;
  emergency_response_plan: string;
};

const DEFAULT_FIELDS: Fields = {
  condition_name: '',
  diagnosis_date: '',
  severity: '',
  treatment_protocol: '',
  trigger_factors: '',
  emergency_response_plan: '',
};

export function HealthConditionDialog({ open, onOpenChange, initial, onSubmit, isBusy }: Props) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Fields>(DEFAULT_FIELDS);

  useEffect(() => {
    if (!open) return;
    setFields(
      initial
        ? {
            condition_name: initial.condition_name,
            diagnosis_date: initial.diagnosis_date ?? '',
            severity: initial.severity ?? '',
            treatment_protocol: initial.treatment_protocol ?? '',
            trigger_factors: initial.trigger_factors ?? '',
            emergency_response_plan: initial.emergency_response_plan ?? '',
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
          <DialogTitle>{initial ? t('health.dialog.editCondition') : t('health.dialog.addCondition')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cn">{t('health.fields.conditionName')}</Label>
            <Input id="cn" value={fields.condition_name} onChange={(e) => set('condition_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dx">{t('health.fields.diagnosisDate')}</Label>
            <Input id="dx" type="date" value={fields.diagnosis_date} onChange={(e) => set('diagnosis_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sev">{t('health.fields.severity')}</Label>
            <Input id="sev" value={fields.severity} onChange={(e) => set('severity', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr">{t('health.fields.treatment')}</Label>
            <textarea
              id="tr"
              className="min-h-[64px] w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
              value={fields.treatment_protocol}
              onChange={(e) => set('treatment_protocol', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg">{t('health.fields.triggers')}</Label>
            <textarea
              id="tg"
              className="min-h-[64px] w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
              value={fields.trigger_factors}
              onChange={(e) => set('trigger_factors', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl">{t('health.fields.emergencyPlan')}</Label>
            <textarea
              id="pl"
              className="min-h-[64px] w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
              value={fields.emergency_response_plan}
              onChange={(e) => set('emergency_response_plan', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isBusy || !fields.condition_name.trim()}
            onClick={() =>
              onSubmit({
                condition_name: fields.condition_name.trim(),
                diagnosis_date: fields.diagnosis_date || null,
                severity: fields.severity.trim() || null,
                treatment_protocol: fields.treatment_protocol.trim() || null,
                trigger_factors: fields.trigger_factors.trim() || null,
                emergency_response_plan: fields.emergency_response_plan.trim() || null,
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
