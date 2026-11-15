import { useTranslation } from 'react-i18next';

import { Select } from '@/components/ui/select';
import { FormField } from '@/features/child-application/ApplicationField';
import { PanelHeader } from '@/features/child-application/ApplicationPanelHeader';
import { stepCardClassName } from '@/features/child-application/applicationStyles';
import { useNurseryClasses } from '@/hooks/useClassStaff';
import { localName } from '@/lib/bilingualName';

/**
 * The last step: the class the child joins (or later, from the children's page), with what happens
 * on saving — the child is added to the family, the family is told, and the class's teachers too.
 */
export function EnrollmentClassStep({ title, nurseryId, childName, familyLabel, classId, onClassChange }: {
  title: string;
  nurseryId: string;
  childName: string;
  familyLabel: string;
  classId: string;
  onClassChange: (classId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const classes = useNurseryClasses(nurseryId);

  return (
    <div className={stepCardClassName()} data-testid="enrollment-class">
      <PanelHeader icon="how_to_reg" title={title} body={t('childEnrollment.class.hint')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs text-on-surface-variant">{t('childEnrollment.class.child')}</p>
          <p className="mt-1 font-semibold text-on-surface">{childName || '—'}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs text-on-surface-variant">{t('childEnrollment.class.family')}</p>
          <p className="mt-1 font-semibold text-on-surface">{familyLabel || '—'}</p>
        </div>
      </div>
      <FormField label={t('childEnrollment.class.label')} hint={t('childEnrollment.class.later')}>
        <Select id="enrollment-class" value={classId} onChange={(e) => onClassChange(e.target.value)} disabled={classes.isPending}>
          <option value="">{t('childEnrollment.class.none')}</option>
          {(classes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {localName(c.name_ar, c.name_en, isAr)}
              {c.capacity ? ` · ${t('childEnrollment.class.seats', { count: c.child_count, capacity: c.capacity })}` : ''}
            </option>
          ))}
        </Select>
      </FormField>
      <ul className="space-y-2 rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
        {['linked', 'told', 'teachers'].map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span className="material-symbols-outlined text-base text-success" aria-hidden>check_circle</span>
            {t(`childEnrollment.class.after.${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
