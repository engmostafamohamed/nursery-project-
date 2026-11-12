import { useTranslation } from 'react-i18next';

import { Drop3D } from '@/components/daily-reports/Shapes3D';
import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import {
  addToiletVisit,
  parseToiletType,
  removeToiletVisit,
  setToiletVisitType,
  TOILET_MAX,
  TOILET_TYPES,
  type DailyReportAnswers,
} from '@/lib/dailyReport';
import { TOILET_TONE, toiletTypeName } from '@/lib/dailyReportLabels';
import { cn } from '@/lib/utils';

type Toilet = DailyReportAnswers['toilet'];

/**
 * The toilet question: each visit (or diaper change) of the day, with its type chosen from a list —
 * urine or stool. "None today" is an answer too. A visit without its type keeps the question open,
 * so the report is not sent until every visit has one.
 */
export function ToiletVisits({ value, onChange, readOnly }: { value: Toilet; onChange: (value: Toilet) => void; readOnly: boolean }) {
  const { t } = useTranslation();
  const visits = value.visits;
  const untyped = !readOnly && (visits ?? []).some((v) => v.type === null);

  return (
    <div className="space-y-3">
      {visits?.length ? (
        <ol className="space-y-2" aria-label={t('dailyReport.editor.toiletVisits')}>
          {visits.map((visit, i) => {
            const n = i + 1;
            const missingType = !readOnly && visit.type === null;
            return (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-2" data-testid="toilet-visit">
                <Drop3D size={24} tone={visit.type ? TOILET_TONE[visit.type] : 'neutral'} />
                <span className="w-16 shrink-0 text-sm font-semibold text-on-surface">{t('dailyReport.editor.toiletVisit', { n })}</span>
                <Select
                  aria-label={t('dailyReport.editor.toiletTypeLabel', { n })}
                  value={visit.type ?? ''}
                  aria-invalid={missingType}
                  className={cn('h-11 min-w-0 flex-1', missingType && invalidFieldClass)}
                  onChange={(e) => onChange({ ...value, visits: setToiletVisitType(visits, i, parseToiletType(e.target.value)) })}
                >
                  <option value="" disabled>{t('dailyReport.editor.toiletChooseType')}</option>
                  {TOILET_TYPES.map((type) => (
                    <option key={type} value={type}>{toiletTypeName(t, type)}</option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('dailyReport.editor.toiletRemoveVisit', { n })}
                  onClick={() => onChange({ ...value, visits: removeToiletVisit(visits, i) })}
                >
                  <MaterialSymbol name="close" />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <FieldError message={untyped ? t('dailyReport.editor.toiletTypeNeeded') : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={(visits?.length ?? 0) >= TOILET_MAX} onClick={() => onChange({ ...value, visits: addToiletVisit(visits) })}>
          <MaterialSymbol name="add" className="me-1 text-base" />
          {t('dailyReport.editor.toiletAddVisit')}
        </Button>
        <Button type="button" variant={visits?.length === 0 ? 'default' : 'outline'} onClick={() => onChange({ ...value, visits: [] })}>
          {t('dailyReport.editor.toiletNone')}
        </Button>
      </div>
    </div>
  );
}
