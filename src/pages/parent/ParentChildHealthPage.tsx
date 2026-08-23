import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { HealthAllergiesSection } from '@/components/health/HealthAllergiesSection';
import { HealthChildHeader } from '@/components/health/HealthChildHeader';
import { HealthConditionsSection } from '@/components/health/HealthConditionsSection';
import { HealthDocumentsSection } from '@/components/health/HealthDocumentsSection';
import { HealthMedicationsSection } from '@/components/health/HealthMedicationsSection';
import { HealthOverviewCard } from '@/components/health/HealthOverviewCard';
import { HealthPrintableSummary } from '@/components/health/HealthPrintableSummary';
import { HealthVaccinationsSection } from '@/components/health/HealthVaccinationsSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useChildHealth } from '@/hooks/useChildHealth';
import { useRequestHealthUpdate } from '@/hooks/useParentHealthActions';
import { todayYmdLocal } from '@/lib/healthAlertsCompute';
import { formatQueryError } from '@/lib/utils';

export function ParentChildHealthPage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const q = useChildHealth(childId);
  const requestUpdate = useRequestHealthUpdate();
  const [notes, setNotes] = useState('');

  const vaccineDue = useMemo(() => {
    const today = todayYmdLocal();
    const vacs = q.data?.vaccinations ?? [];
    return vacs.some((v) => v.next_due_date && v.next_due_date < today);
  }, [q.data?.vaccinations]);

  const printSummary = useCallback(() => {
    window.print();
    toast.message(t('health.toast.printReady'));
  }, [t]);

  const submitRequest = useCallback(async () => {
    if (!childId || !q.data?.child.nursery_id) return;
    try {
      await requestUpdate.mutateAsync({
        childId,
        nurseryId: q.data.child.nursery_id,
        notes: notes.trim(),
      });
      setNotes('');
      toast.success(t('health.parent.requestSent'));
    } catch (e) {
      toast.error(`${t('health.toast.error')} ${formatQueryError(e)}`);
    }
  }, [childId, q.data?.child.nursery_id, notes, requestUpdate, t]);

  if (q.isLoading) return <LoadingSkeleton />;
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon="medical_services"
        title={t('health.pageTitleParent')}
        description={q.isError ? formatQueryError(q.error) : t('health.toast.error')}
      />
    );
  }

  const bundle = q.data;
  const nurseryId = bundle.child.nursery_id;

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <HealthChildHeader
          child={bundle.child}
          backTo="/parent/profile"
          actions={
            <>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                onClick={printSummary}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>download</span>
                {t('health.actions.downloadSummary')}
              </button>
            </>
          }
        />

        {vaccineDue && (
          <div className="rounded-xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined" aria-hidden>
                event_busy
              </span>
              <span>{t('health.parent.vaccineDueBanner')}</span>
            </div>
          </div>
        )}

        <HealthOverviewCard record={bundle.record} readOnly onSave={() => {}} isSaving={false} />

        <HealthAllergiesSection
          items={bundle.allergies}
          readOnly
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          isBusy={false}
        />

        <HealthConditionsSection
          items={bundle.conditions}
          readOnly
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          isBusy={false}
        />

        <HealthMedicationsSection
          items={bundle.medications}
          readOnly
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          isBusy={false}
        />

        <HealthVaccinationsSection
          items={bundle.vaccinations}
          readOnly
          onAdd={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          isBusy={false}
        />

        <HealthDocumentsSection childId={bundle.child.id} nurseryId={nurseryId} allowUpload />

        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="text-base font-semibold">{t('health.actions.requestUpdate')}</h3>
          <div className="mt-3 space-y-2">
            <Label htmlFor="req-notes">{t('health.parent.requestNotesLabel')}</Label>
            <textarea
              id="req-notes"
              className="min-h-[88px] w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
              value={notes}
              placeholder={t('health.parent.requestNotesPlaceholder')}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button className="mt-3" type="button" disabled={requestUpdate.isPending || !notes.trim()} onClick={() => void submitRequest()}>
            {t('health.parent.requestSubmit')}
          </Button>
        </div>
      </div>

      <div className="hidden print-area print:block">
        <HealthPrintableSummary bundle={bundle} />
      </div>
    </div>
  );
}
