import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import type { MyAbsences } from './staffAbsence';

/** Tells a backup teacher which classes they look after today, and for whom. */
export function CoverBanner({ covering }: { covering: MyAbsences['covering'] }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  if (!covering.length) return null;
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="cover-banner">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden>
        <MaterialSymbol name="swap_horiz" size="text-xl" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-on-surface">{t('staffAbsence.banner.title', { count: covering.length })}</h2>
        <ul className="mt-1 space-y-0.5 text-sm text-on-surface">
          {covering.map((c) => {
            const lead = isArabic ? c.leadAr || c.leadEn : c.leadEn || c.leadAr;
            return (
              <li key={c.classId}>
                {lead
                  ? t('staffAbsence.banner.classFor', { class: isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr, lead })
                  : t('staffAbsence.banner.class', { class: isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr })}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-on-surface-variant">{t('staffAbsence.banner.hint')}</p>
      </div>
      <Link to="/teacher/classes" className="shrink-0 self-center text-sm font-medium text-primary hover:underline">
        {t('staffAbsence.banner.open')}
      </Link>
    </section>
  );
}
