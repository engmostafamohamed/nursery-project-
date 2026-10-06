import { useCallback } from 'react';
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
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useChildHealth } from '@/hooks/useChildHealth';
import {
  useAllergyMutations,
  useConditionMutations,
  useMedicationMutations,
  useUpdateHealthRecord,
  useVaccinationMutations,
} from '@/hooks/useChildHealthMutations';
import { fetchParentUserIdsForChild, notifyParentUsers } from '@/lib/healthNotifications';
import { formatQueryError } from '@/lib/utils';

export function AdminChildHealthProfilePage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const q = useChildHealth(childId);
  const updateRecord = useUpdateHealthRecord(childId ?? '');

  const allergyM = useAllergyMutations(childId ?? '');
  const condM = useConditionMutations(childId ?? '');
  const medM = useMedicationMutations(childId ?? '');
  const vacM = useVaccinationMutations(childId ?? '');

  const busy =
    allergyM.insert.isPending ||
    allergyM.update.isPending ||
    allergyM.remove.isPending ||
    condM.insert.isPending ||
    condM.update.isPending ||
    condM.remove.isPending ||
    medM.insert.isPending ||
    medM.update.isPending ||
    medM.remove.isPending ||
    vacM.insert.isPending ||
    vacM.update.isPending ||
    vacM.remove.isPending;

  const printSummary = useCallback(() => {
    window.print();
    toast.message(t('health.toast.printReady'));
  }, [t]);

  const shareWithParents = useCallback(async () => {
    if (!childId || !q.data?.child.nursery_id) return;
    try {
      const ids = await fetchParentUserIdsForChild(childId);
      if (!ids.length) {
        toast.error(t('health.toast.error'));
        return;
      }
      await notifyParentUsers({
        nurseryId: q.data.child.nursery_id,
        parentUserIds: ids,
        type: 'child_health_shared',
        actionLink: `/parent/children/${childId}/health`,
      });
      toast.success(t('health.toast.shareSent'));
    } catch {
      toast.error(t('health.toast.error'));
    }
  }, [childId, q.data?.child.nursery_id, t]);

  const saveOverview = useCallback(
    async (patch: Parameters<typeof updateRecord.mutateAsync>[0]) => {
      try {
        await updateRecord.mutateAsync(patch);
      } catch (e) {
        toast.error(`${t('health.toast.error')} ${formatQueryError(e)}`);
      }
    },
    [updateRecord, t],
  );

  if (q.isLoading) return <LoadingSkeleton />;
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon="medical_services"
        title={t('health.pageTitle')}
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
          backTo={`/admin/children/${bundle.child.id}`}
          actions={
            <>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                onClick={printSummary}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>print</span>
                {t('health.actions.printSummary')}
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                onClick={printSummary}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>picture_as_pdf</span>
                {t('health.actions.exportPdf')}
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-secondary bg-secondary px-3 text-sm text-on-secondary"
                onClick={() => void shareWithParents()}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>share</span>
                {t('health.actions.shareParent')}
              </button>
            </>
          }
        />

        <HealthOverviewCard
          record={bundle.record}
          readOnly={false}
          onSave={(patch) => void saveOverview(patch)}
          isSaving={updateRecord.isPending}
        />

        <HealthAllergiesSection
          items={bundle.allergies}
          readOnly={false}
          onAdd={(patch) =>
            void allergyM.insert.mutateAsync({
              child_id: bundle.child.id,
              nursery_id: nurseryId,
              allergen_name: patch.allergen_name ?? '',
              reaction_type: patch.reaction_type ?? null,
              severity: patch.severity ?? 'mild',
              treatment_protocol: patch.treatment_protocol ?? null,
              last_reaction_date: patch.last_reaction_date ?? null,
            })
          }
          onEdit={(id, patch) => void allergyM.update.mutateAsync({ id, patch })}
          onDelete={(id) => void allergyM.remove.mutateAsync(id)}
          isBusy={busy}
        />

        <HealthConditionsSection
          items={bundle.conditions}
          readOnly={false}
          onAdd={(patch) =>
            void condM.insert.mutateAsync({
              child_id: bundle.child.id,
              nursery_id: nurseryId,
              condition_name: patch.condition_name ?? '',
              diagnosis_date: patch.diagnosis_date ?? null,
              severity: patch.severity ?? null,
              treatment_protocol: patch.treatment_protocol ?? null,
              trigger_factors: patch.trigger_factors ?? null,
              emergency_response_plan: patch.emergency_response_plan ?? null,
            })
          }
          onEdit={(id, patch) => void condM.update.mutateAsync({ id, patch })}
          onDelete={(id) => void condM.remove.mutateAsync(id)}
          isBusy={busy}
        />

        <HealthMedicationsSection
          items={bundle.medications}
          readOnly={false}
          onAdd={(patch) =>
            void medM.insert.mutateAsync({
              child_id: bundle.child.id,
              nursery_id: nurseryId,
              name: patch.name ?? '',
              dosage: patch.dosage ?? null,
              administration_times: patch.administration_times ?? null,
              administration_method: patch.administration_method ?? 'oral',
              storage_requirements: patch.storage_requirements ?? null,
              expiry_date: patch.expiry_date ?? null,
              parent_consent_status: patch.parent_consent_status ?? 'pending',
            })
          }
          onEdit={(id, patch) => void medM.update.mutateAsync({ id, patch })}
          onDelete={(id) => void medM.remove.mutateAsync(id)}
          isBusy={busy}
        />

        <HealthVaccinationsSection
          items={bundle.vaccinations}
          readOnly={false}
          onAdd={(patch) =>
            void vacM.insert.mutateAsync({
              child_id: bundle.child.id,
              nursery_id: nurseryId,
              vaccine_name: patch.vaccine_name ?? '',
              dose_number: patch.dose_number ?? 1,
              date_administered: patch.date_administered ?? null,
              next_due_date: patch.next_due_date ?? null,
              administered_by: patch.administered_by ?? null,
              batch_number: patch.batch_number ?? null,
            })
          }
          onEdit={(id, patch) => void vacM.update.mutateAsync({ id, patch })}
          onDelete={(id) => void vacM.remove.mutateAsync(id)}
          isBusy={busy}
        />

        <HealthDocumentsSection childId={bundle.child.id} nurseryId={nurseryId} allowUpload={false} />
      </div>

      <div className="hidden print-area print:block">
        <HealthPrintableSummary bundle={bundle} />
      </div>
    </div>
  );
}
