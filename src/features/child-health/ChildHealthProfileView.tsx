import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { fetchParentUserIdsForChild, notifyParentUsers } from '@/lib/healthNotifications';

import { attentionItems, type Allergy, type ChildHealthProfile, type Condition, type Medication, type Vaccination } from './childHealth';
import { deleteHealthItem, healthErrorKey, type HealthItemKind } from './childHealthApi';
import { HealthAttention } from './HealthAttention';
import { AllergyDialog, ConditionDialog, MedicationDialog, OverviewDialog, VaccinationDialog } from './HealthDialogs';
import { HealthDocumentsCard, ParentRequestCard } from './HealthDocumentsCard';
import { AllergiesCard, ConditionsCard, MedicationsCard, VaccinationsCard } from './HealthItemCards';
import { HealthPrintSummary } from './HealthPrintSummary';
import { HealthProfileHero } from './HealthProfileHero';
import { CareContactsCard, DoctorInsuranceCard, EnrollmentNotesCard } from './HealthSideCards';
import { useChildHealthChange } from './useChildHealthProfile';

type Open =
  | { kind: 'overview' }
  | { kind: 'allergy'; item: Allergy | null }
  | { kind: 'condition'; item: Condition | null }
  | { kind: 'medication'; item: Medication | null }
  | { kind: 'vaccination'; item: Vaccination | null }
  | null;

const CONFIRM_KEYS: Record<HealthItemKind, string> = { allergy: 'Allergy', condition: 'Condition', medication: 'Medication', vaccination: 'Vaccination' };

/**
 * The whole health profile, for the nursery and for the parents: the child at a glance, what needs
 * attention, the four lists, who to call, the doctor and insurance, what the parents wrote at
 * enrollment, and the documents. Staff who may edit change it in place; parents ask for changes.
 */
export function ChildHealthProfileView({ profile, back, highlightAllergy }: { profile: ChildHealthProfile; back: { to: string; label: string }; highlightAllergy?: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Open>(null);
  const [sharing, setSharing] = useState(false);
  const { canEdit, viewer } = profile;
  const childId = profile.child.id;
  const remove = useChildHealthChange(childId, ({ kind, id }: { kind: HealthItemKind; id: string }) => deleteHealthItem(kind, id));

  const askDelete = async (kind: HealthItemKind, id: string) => {
    const ok = await confirm({
      title: t(`health.confirm.delete${CONFIRM_KEYS[kind]}Title`),
      description: t(`health.confirm.delete${CONFIRM_KEYS[kind]}Body`),
      confirmText: t('common.delete'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync({ kind, id });
      toast.success(t(`health.profile.deleted.${kind}`));
    } catch (error) {
      toast.error(t(healthErrorKey(error)));
    }
  };

  const share = async () => {
    setSharing(true);
    try {
      const ids = await fetchParentUserIdsForChild(childId);
      if (!ids.length) {
        toast.error(t('health.profile.actions.noParents'));
        return;
      }
      await notifyParentUsers({ nurseryId: profile.child.nurseryId, parentUserIds: ids, type: 'child_health_shared', actionLink: `/parent/children/${childId}/health` });
      toast.success(t('health.toast.shareSent'));
    } catch (error) {
      toast.error(t(healthErrorKey(error)));
    } finally {
      setSharing(false);
    }
  };

  const actions = (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
        <MaterialSymbol name="print" size="text-base" className="me-1" />
        {viewer === 'parent' ? t('health.actions.downloadSummary') : t('health.actions.printSummary')}
      </Button>
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void share()} disabled={sharing}>
          <MaterialSymbol name="share" size="text-base" className="me-1" />
          {t('health.actions.shareParent')}
        </Button>
      ) : null}
    </>
  );

  const editing = <T extends { id: string }>(kind: Exclude<HealthItemKind, never>, openWith: (item: T | null) => Open) => ({
    canEdit,
    onAdd: () => setOpen(openWith(null)),
    onEdit: (item: T) => setOpen(openWith(item)),
    onDelete: (item: T) => void askDelete(kind, item.id),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-24">
      <div className="no-print space-y-5">
        <HealthProfileHero profile={profile} back={back} actions={actions} />
        <HealthAttention
          items={attentionItems(profile)}
          onAdd={canEdit ? (section) => setOpen(section === 'allergies' ? { kind: 'allergy', item: null } : section === 'conditions' ? { kind: 'condition', item: null } : { kind: 'overview' }) : undefined}
        />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
          <div className="min-w-0 space-y-5">
            <AllergiesCard allergies={profile.allergies} viewer={viewer} highlight={highlightAllergy} {...editing<Allergy>('allergy', (item) => ({ kind: 'allergy', item }))} />
            <ConditionsCard conditions={profile.conditions} viewer={viewer} {...editing<Condition>('condition', (item) => ({ kind: 'condition', item }))} />
            <MedicationsCard medications={profile.medications} today={profile.today} tz={profile.tz} viewer={viewer} {...editing<Medication>('medication', (item) => ({ kind: 'medication', item }))} />
            <VaccinationsCard vaccinations={profile.vaccinations} today={profile.today} viewer={viewer} {...editing<Vaccination>('vaccination', (item) => ({ kind: 'vaccination', item }))} />
          </div>
          <aside className="min-w-0 space-y-5">
            <CareContactsCard profile={profile} />
            <DoctorInsuranceCard profile={profile} onEdit={canEdit ? () => setOpen({ kind: 'overview' }) : undefined} />
            {viewer === 'parent' ? <ParentRequestCard profile={profile} /> : null}
            <EnrollmentNotesCard profile={profile} />
            <HealthDocumentsCard profile={profile} />
          </aside>
        </div>
      </div>

      <div className="hidden print-area print:block">
        <HealthPrintSummary profile={profile} />
      </div>

      {open?.kind === 'overview' ? <OverviewDialog profile={profile} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'allergy' ? <AllergyDialog profile={profile} item={open.item} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'condition' ? <ConditionDialog profile={profile} item={open.item} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'medication' ? <MedicationDialog profile={profile} item={open.item} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'vaccination' ? <VaccinationDialog profile={profile} item={open.item} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
