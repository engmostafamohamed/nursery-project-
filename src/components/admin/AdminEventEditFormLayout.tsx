import { ChevronRight } from 'lucide-react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { EventFormFields, type EventChildPickerRow, type EventClassRow } from '@/components/admin/EventFormFields';
import { Button } from '@/components/ui/button';

type Props = {
  qs: string;
  headerTitle: string;
  form: UseFormReturn<FieldValues>;
  showAr: boolean;
  showEn: boolean;
  classes: EventClassRow[];
  classesLoading: boolean;
  nurseryChildren: EventChildPickerRow[];
  childrenLoading: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export function AdminEventEditFormLayout({
  qs,
  headerTitle,
  form,
  showAr,
  showEn,
  classes,
  classesLoading,
  nurseryChildren,
  childrenLoading,
  onSubmit,
  isSubmitting,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 pb-8">
      <nav className="text-sm text-on-surface-variant" aria-label={t('admin.events.edit.breadcrumbLabel')}>
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link className="text-secondary underline hover:no-underline" to={`/admin/events${qs}`}>
              {t('admin.events.edit.breadcrumbEvents')}
            </Link>
          </li>
          <li aria-hidden className="flex text-on-surface-variant">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </li>
          <li className="text-on-surface">{t('admin.events.edit.breadcrumbEdit')}</li>
        </ol>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-on-surface">
          {t('admin.events.edit.title', { title: headerTitle || '—' })}
        </h1>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to={`/admin/events${qs}`}>{t('admin.events.back')}</Link>
        </Button>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
        onSubmit={onSubmit}
        noValidate
      >
        <EventFormFields
          form={form}
          showAr={showAr}
          showEn={showEn}
          showStatusSelect
          classes={classes}
          classesLoading={classesLoading}
          nurseryChildren={nurseryChildren}
          childrenLoading={childrenLoading}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => navigate(`/admin/events${qs}`)}>
            {t('admin.events.edit.cancel')}
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {t('admin.events.edit.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
