import { useTranslation } from 'react-i18next';

import type { ChildHealthBundle } from '@/hooks/useChildHealth';
import { todayYmdLocal } from '@/lib/healthAlertsCompute';

type Props = {
  bundle: ChildHealthBundle;
};

export function HealthPrintableSummary({ bundle }: Props) {
  const { t, i18n } = useTranslation();
  const { child, record, allergies, conditions, medications, vaccinations } = bundle;
  const today = todayYmdLocal();
  const name =
    i18n.language === 'ar'
      ? child.full_name_ar || child.full_name_en
      : child.full_name_en || child.full_name_ar;

  return (
    <div className="space-y-4 p-4 text-on-surface">
      <header>
        <h1 className="text-lg font-bold">{t('health.pageTitle')}</h1>
        <p className="text-base">{name}</p>
      </header>

      <section>
        <h2 className="text-base font-semibold">{t('health.sections.overview')}</h2>
        <ul className="text-sm">
          <li>
            {t('health.fields.bloodType')}: {record.blood_type ?? '—'}
          </li>
          <li>
            {t('health.fields.pediatricianName')}: {record.pediatrician_name ?? '—'}
          </li>
          <li>
            {t('health.fields.pediatricianPhone')}: {record.pediatrician_phone ?? '—'}
          </li>
          <li>
            {t('health.fields.emergencyContactName')}: {record.emergency_contact_name ?? '—'}
          </li>
          <li>
            {t('health.fields.emergencyContactPhone')}: {record.emergency_contact_phone ?? '—'}
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">{t('health.sections.allergies')}</h2>
        {allergies.length === 0 ? (
          <p className="text-sm">{t('health.empty.allergies')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {allergies.map((a) => (
              <li key={a.id}>
                <strong>{a.allergen_name}</strong> — {t(`health.severity.allergy.${a.severity}`)} — {a.treatment_protocol ?? '—'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">{t('health.sections.conditions')}</h2>
        {conditions.length === 0 ? (
          <p className="text-sm">{t('health.empty.conditions')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {conditions.map((c) => (
              <li key={c.id}>
                <strong>{c.condition_name}</strong> — {c.emergency_response_plan ?? '—'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">{t('health.sections.medications')}</h2>
        {medications.length === 0 ? (
          <p className="text-sm">{t('health.empty.medications')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {medications.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong> — {m.dosage ?? '—'} — {t(`health.method.${m.administration_method}`)}
                {m.expiry_date && m.expiry_date < today ? ` (${t('health.alerts.medicationExpired')})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">{t('health.sections.vaccinations')}</h2>
        {vaccinations.length === 0 ? (
          <p className="text-sm">{t('health.empty.vaccinations')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {vaccinations.map((v) => (
              <li key={v.id}>
                <strong>{v.vaccine_name}</strong> — {t('health.fields.nextDue')}: {v.next_due_date ?? '—'}
                {v.next_due_date && v.next_due_date < today ? ` (${t('health.alerts.vaccineOverdue')})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
