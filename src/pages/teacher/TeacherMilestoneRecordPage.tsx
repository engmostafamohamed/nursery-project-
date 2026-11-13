import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MilestoneForm } from '@/components/teacher/MilestoneForm';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { blankMilestone, draftOf, milestoneProblems } from '@/features/milestones/milestoneDraft';
import { milestoneErrorKey, type MilestoneDraft } from '@/features/milestones/milestonesApi';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones } from '@/hooks/useMilestones';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

/** Records a child's milestone, or changes one (?edit=<id>); ?child=<id> picks the child. */
export function TeacherMilestoneRecordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const milestones = useMilestones({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined, role: 'teacher' });
  const today = getNurseryCalendarDateString();
  const [form, setForm] = useState<MilestoneDraft>(() => blankMilestone(params.get('child') ?? '', today));
  const [loaded, setLoaded] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  // The milestone being changed fills the form once, when it arrives.
  const editing = editId ? milestones.milestones.find((m) => m.id === editId) : undefined;
  useEffect(() => {
    if (editing && loaded !== editing.id) {
      setForm(draftOf(editing));
      setLoaded(editing.id);
    }
  }, [editing, loaded]);

  const kids = useMemo(
    () => milestones.children.map((c) => ({ id: c.id, name: (i18n.language === 'ar' ? c.full_name_ar : c.full_name_en) || c.full_name_en })),
    [milestones.children, i18n.language],
  );
  const problems = milestoneProblems(form, today);

  const onSubmit = async () => {
    setTried(true);
    if (problems.length) return;
    setSaving(true);
    try {
      await milestones.saveMilestone({ id: editId, draft: form });
      toast.success(t(editId ? 'milestones.updated' : 'milestones.saved'));
      navigate('/teacher/milestones');
    } catch (error) {
      toast.error(t(milestoneErrorKey(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-28">
      <PageHeader
        icon="emoji_events"
        title={t(editId ? 'milestones.editTitle' : 'milestones.recordTitle')}
        description={t('milestones.form.description')}
        actions={
          <Button asChild variant="outline">
            <Link to="/teacher/milestones">
              <MaterialSymbol name="arrow_back" size="text-base" className="me-1 rtl:rotate-180" />
              {t('milestones.listTitle')}
            </Link>
          </Button>
        }
      />
      <MilestoneForm
        value={form}
        onChange={setForm}
        kids={kids}
        childLocked={Boolean(editId)}
        childAge={form.childId ? milestones.childAgeMap.get(form.childId) : undefined}
        nurseryId={profile?.nursery_id ?? ''}
        today={today}
        saving={saving}
        problems={tried ? problems : []}
        onSubmit={() => void onSubmit()}
        onCancel={() => navigate('/teacher/milestones')}
      />
    </div>
  );
}
