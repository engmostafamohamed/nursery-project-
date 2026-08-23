import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChildHealthRecordsRow } from '@/types/tables/child_health';

type Props = {
  record: ChildHealthRecordsRow;
  readOnly: boolean;
  onSave: (patch: Partial<ChildHealthRecordsRow>) => void;
  isSaving: boolean;
};

export function HealthOverviewCard({ record, readOnly, onSave, isSaving }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => mapRecord(record));

  useEffect(() => {
    setForm(mapRecord(record));
  }, [record]);

  const apply = () => {
    onSave({
      blood_type: emptyToNull(form.blood_type),
      pediatrician_name: emptyToNull(form.pediatrician_name),
      pediatrician_phone: emptyToNull(form.pediatrician_phone),
      pediatrician_clinic: emptyToNull(form.pediatrician_clinic),
      emergency_contact_name: emptyToNull(form.emergency_contact_name),
      emergency_contact_phone: emptyToNull(form.emergency_contact_phone),
      insurance_provider: emptyToNull(form.insurance_provider),
      insurance_policy_number: emptyToNull(form.insurance_policy_number),
      insurance_notes: emptyToNull(form.insurance_notes),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('health.sections.overview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="blood">{t('health.fields.bloodType')}</Label>
            <Input
              id="blood"
              value={form.blood_type}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, blood_type: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-name">{t('health.fields.pediatricianName')}</Label>
            <Input
              id="ped-name"
              value={form.pediatrician_name}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, pediatrician_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-phone">{t('health.fields.pediatricianPhone')}</Label>
            <Input
              id="ped-phone"
              value={form.pediatrician_phone}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, pediatrician_phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-clinic">{t('health.fields.pediatricianClinic')}</Label>
            <Input
              id="ped-clinic"
              value={form.pediatrician_clinic}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, pediatrician_clinic: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-name">{t('health.fields.emergencyContactName')}</Label>
            <Input
              id="em-name"
              value={form.emergency_contact_name}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, emergency_contact_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-phone">{t('health.fields.emergencyContactPhone')}</Label>
            <Input
              id="em-phone"
              value={form.emergency_contact_phone}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, emergency_contact_phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-p">{t('health.fields.insuranceProvider')}</Label>
            <Input
              id="ins-p"
              value={form.insurance_provider}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, insurance_provider: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-n">{t('health.fields.insurancePolicy')}</Label>
            <Input
              id="ins-n"
              value={form.insurance_policy_number}
              readOnly={readOnly}
              onChange={(e) => setForm((s) => ({ ...s, insurance_policy_number: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="insurance-notes">{t('health.fields.insuranceNotes')}</Label>
          <textarea
            id="insurance-notes"
            disabled={readOnly}
            className="min-h-[80px] w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
            value={form.insurance_notes}
            onChange={(e) => setForm((s) => ({ ...s, insurance_notes: e.target.value }))}
          />
        </div>
        {!readOnly && (
          <Button type="button" onClick={apply} disabled={isSaving}>
            {t('health.actions.saveOverview')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function emptyToNull(v: string): string | null {
  return v.trim() === '' ? null : v;
}

function mapRecord(record: ChildHealthRecordsRow) {
  return {
    blood_type: record.blood_type ?? '',
    pediatrician_name: record.pediatrician_name ?? '',
    pediatrician_phone: record.pediatrician_phone ?? '',
    pediatrician_clinic: record.pediatrician_clinic ?? '',
    emergency_contact_name: record.emergency_contact_name ?? '',
    emergency_contact_phone: record.emergency_contact_phone ?? '',
    insurance_provider: record.insurance_provider ?? '',
    insurance_policy_number: record.insurance_policy_number ?? '',
    insurance_notes: record.insurance_notes ?? '',
  };
}
