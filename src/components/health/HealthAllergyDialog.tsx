import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AllergySeverity, ChildAllergiesRow } from '@/types/tables/child_health';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChildAllergiesRow | null;
  onSubmit: (patch: Partial<ChildAllergiesRow>) => void;
  isBusy: boolean;
};

const SEVERITIES: AllergySeverity[] = ['mild', 'moderate', 'severe', 'life_threatening'];

type Fields = {
  allergen_name: string;
  reaction_type: string;
  severity: AllergySeverity;
  treatment_protocol: string;
  last_reaction_date: string;
};

const DEFAULT_FIELDS: Fields = {
  allergen_name: '',
  reaction_type: '',
  severity: 'mild',
  treatment_protocol: '',
  last_reaction_date: '',
};

export function HealthAllergyDialog({ open, onOpenChange, initial, onSubmit, isBusy }: Props) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Fields>(DEFAULT_FIELDS);

  useEffect(() => {
    if (!open) return;
    setFields(
      initial
        ? {
            allergen_name: initial.allergen_name,
            reaction_type: initial.reaction_type ?? '',
            severity: initial.severity,
            treatment_protocol: initial.treatment_protocol ?? '',
            last_reaction_date: initial.last_reaction_date ?? '',
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
          <DialogTitle>{initial ? t('health.dialog.editAllergy') : t('health.dialog.addAllergy')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="allergen">{t('health.fields.allergen')}</Label>
            <Input id="allergen" value={fields.allergen_name} onChange={(e) => set('allergen_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reaction">{t('health.fields.reaction')}</Label>
            <Input id="reaction" value={fields.reaction_type} onChange={(e) => set('reaction_type', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sev">{t('health.fields.severity')}</Label>
            <select
              id="sev"
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
              value={fields.severity}
              onChange={(e) => set('severity', e.target.value as AllergySeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`health.severity.allergy.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="treat">{t('health.fields.treatment')}</Label>
            <textarea
              id="treat"
              className="min-h-[72px] w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
              value={fields.treatment_protocol}
              onChange={(e) => set('treatment_protocol', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastd">{t('health.fields.lastReaction')}</Label>
            <Input id="lastd" type="date" value={fields.last_reaction_date} onChange={(e) => set('last_reaction_date', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isBusy || !fields.allergen_name.trim()}
            onClick={() =>
              onSubmit({
                allergen_name: fields.allergen_name.trim(),
                reaction_type: fields.reaction_type.trim() || null,
                severity: fields.severity,
                treatment_protocol: fields.treatment_protocol.trim() || null,
                last_reaction_date: fields.last_reaction_date || null,
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
