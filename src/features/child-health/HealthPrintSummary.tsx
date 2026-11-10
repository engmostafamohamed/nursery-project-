import { useTranslation } from 'react-i18next';

import { localName } from '@/lib/bilingualName';

import { ageOn, carePeople, medicationState, vaccinationState, type ChildHealthProfile } from './childHealth';
import { formatDay } from './healthFormat';

/** One printable page with what a doctor or a carer needs in an emergency. */
export function HealthPrintSummary({ profile }: { profile: ChildHealthProfile }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { child, record, today } = profile;
  const age = ageOn(child.dob, today);
  const people = carePeople(profile).filter((p) => p.phone);
  const row = (label: string, value: string | null | undefined) => (
    <tr>
      <th className="w-44 py-1 pe-3 text-start align-top font-semibold">{label}</th>
      <td className="py-1 align-top">{value || '—'}</td>
    </tr>
  );

  return (
    <div className="space-y-5 p-6 text-sm text-black">
      <header className="border-b border-black pb-3">
        <p className="text-xs uppercase">{t('health.profile.print.title')}</p>
        <h1 className="text-2xl font-bold">{localName(child.nameAr, child.nameEn, isArabic)}</h1>
        <p>
          {[localName(child.classNameAr, child.classNameEn, isArabic), child.dob ? formatDay(child.dob, isArabic) : null, age ? t('health.profile.age.years', { count: age.years }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="text-xs">{t('health.profile.print.printed', { date: formatDay(today, isArabic) })}</p>
      </header>

      <table className="w-full">
        <tbody>
          {row(t('health.fields.bloodType'), child.bloodType)}
          {row(t('health.profile.doctor.pediatrician'), [record.pediatricianName, record.pediatricianClinic, record.pediatricianPhone].filter(Boolean).join(' · '))}
          {row(t('health.profile.doctor.insurance'), [record.insuranceProvider, record.insurancePolicyNumber].filter(Boolean).join(' · '))}
        </tbody>
      </table>

      <section>
        <h2 className="mb-1 text-base font-bold">{t('health.profile.sections.contacts')}</h2>
        {people.length ? (
          <ul>
            {people.map((p) => (
              <li key={p.key}>
                {localName(p.nameAr, p.nameEn, isArabic)} — <span dir="ltr">{p.phone}</span>
                {p.tags.includes('emergency') ? ` (${t('health.profile.contacts.tags.emergency')})` : ''}
              </li>
            ))}
          </ul>
        ) : <p>—</p>}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold">{t('health.profile.sections.allergies')}</h2>
        {profile.allergies.length ? (
          <ul className="space-y-1">
            {profile.allergies.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong> — {t(`health.severity.allergy.${a.severity}`)}
                {a.reaction ? ` · ${a.reaction}` : ''}
                {a.treatment ? ` · ${t('health.profile.allergy.treatment')}: ${a.treatment}` : ''}
              </li>
            ))}
          </ul>
        ) : <p>{t('health.empty.allergies')}</p>}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold">{t('health.profile.sections.conditions')}</h2>
        {profile.conditions.length ? (
          <ul className="space-y-1">
            {profile.conditions.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                {c.emergencyPlan ? ` — ${t('health.profile.condition.plan')}: ${c.emergencyPlan}` : ''}
              </li>
            ))}
          </ul>
        ) : <p>{t('health.empty.conditions')}</p>}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold">{t('health.profile.sections.medications')}</h2>
        {profile.medications.length ? (
          <ul className="space-y-1">
            {profile.medications.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>
                {[m.dosage, m.times, t(`health.method.${m.method}`)].filter(Boolean).map((v) => ` · ${v}`).join('')}
                {medicationState(m, today) === 'expired' ? ` (${t('health.alerts.medicationExpired')})` : ''}
              </li>
            ))}
          </ul>
        ) : <p>{t('health.empty.medications')}</p>}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold">{t('health.profile.sections.vaccinations')}</h2>
        {profile.vaccinations.length ? (
          <ul className="space-y-1">
            {profile.vaccinations.map((v) => (
              <li key={v.id}>
                <strong>{v.name}</strong> · {t('health.profile.vaccination.dose', { dose: v.dose })}
                {v.givenOn ? ` · ${formatDay(v.givenOn, isArabic)}` : ''}
                {v.nextDue ? ` · ${t('health.profile.vaccination.nextDue')}: ${formatDay(v.nextDue, isArabic)}` : ''}
                {vaccinationState(v, today) === 'overdue' ? ` (${t('health.alerts.vaccineOverdue')})` : ''}
              </li>
            ))}
          </ul>
        ) : <p>{t('health.empty.vaccinations')}</p>}
      </section>
    </div>
  );
}
