import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import type { AttentionItem } from './childHealth';
import { formatDay, goToSection, sectionId } from './healthFormat';

const ICONS: Record<AttentionItem['kind'], string> = {
  life_threatening_allergy: 'emergency',
  medication_expired: 'medication',
  medication_expiring: 'schedule',
  consent_missing: 'gpp_maybe',
  vaccination_overdue: 'vaccines',
  vaccination_due_soon: 'event_upcoming',
  no_emergency_contact: 'contact_emergency',
  no_pediatrician: 'stethoscope',
  enrollment_allergy_unrecorded: 'assignment_late',
  enrollment_condition_unrecorded: 'assignment_late',
};

/**
 * What needs dealing with on this child's record, the most serious first; each line leads to its
 * part of the page, and, for staff who may edit, the gaps from the enrollment form can be filled at once.
 */
export function HealthAttention({ items, onAdd }: { items: AttentionItem[]; onAdd?: (section: 'allergies' | 'conditions' | 'contacts') => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  if (!items.length) return null;
  const serious = items.some((i) => i.tone === 'error');

  return (
    <section
      aria-labelledby="health-attention-title"
      className={cn('rounded-2xl border p-4 sm:p-5', serious ? 'border-error/30 bg-error/5' : 'border-warning/30 bg-warning/5')}
      data-testid="health-attention"
    >
      <h2 id="health-attention-title" className="flex items-center gap-2 font-semibold text-on-surface">
        <MaterialSymbol name="priority_high" size="text-xl" className={serious ? 'text-error' : 'text-warning'} />
        {t('health.profile.attention.title')}
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', serious ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning')}>{items.length}</span>
      </h2>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((item) => {
          const fixable = onAdd && (item.kind === 'enrollment_allergy_unrecorded' || item.kind === 'enrollment_condition_unrecorded' || item.kind === 'no_pediatrician' || item.kind === 'no_emergency_contact');
          const textKey = item.subject || !item.kind.startsWith('enrollment_') ? item.kind : `${item.kind}_plain`;
          return (
            <li key={item.key} className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface p-3">
              <span
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.tone === 'error' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning')}
                aria-hidden
              >
                <MaterialSymbol name={ICONS[item.kind]} size="text-lg" />
              </span>
              <p className="min-w-0 flex-1 text-sm text-on-surface">
                {t(`health.profile.attention.${textKey}`, { subject: item.subject, date: formatDay(item.date, isArabic) })}
              </p>
              <Button
                type="button"
                size="sm"
                variant={fixable ? 'outline' : 'ghost'}
                className="shrink-0"
                onClick={() => (fixable ? onAdd(item.section as 'allergies' | 'conditions' | 'contacts') : goToSection(sectionId(item.section)))}
              >
                {fixable ? t(item.section === 'contacts' ? 'health.profile.attention.fill' : 'health.profile.attention.add') : t('health.profile.attention.view')}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
