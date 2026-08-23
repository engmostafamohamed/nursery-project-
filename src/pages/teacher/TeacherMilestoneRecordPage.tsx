import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { MilestoneForm, type MilestoneFormValue } from '@/components/teacher/MilestoneForm';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMilestones } from '@/hooks/useMilestones';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export function TeacherMilestoneRecordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const milestones = useMilestones({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined, role: 'teacher' });
  const [childId, setChildId] = useState('');
  const [form, setForm] = useState<MilestoneFormValue>({
    childId: '',
    category: 'motor_skills',
    milestoneText: '',
    achievedAt: new Date().toISOString().slice(0, 10),
    notes: '',
    photoUrl: '',
    sharedWithParent: true,
  });

  const childAge = useMemo(() => (childId ? milestones.childAgeMap.get(childId) : undefined), [childId, milestones.childAgeMap]);

  const onSubmit = async () => {
    if (!profile?.nursery_id || !user?.id || !form.childId || !form.milestoneText.trim()) {
      toast.error(t('milestones.validationRequired'));
      return;
    }
    await milestones.saveMilestone({
      nursery_id: profile.nursery_id,
      child_id: form.childId,
      teacher_id: user.id,
      category: form.category,
      milestone_text: form.milestoneText.trim(),
      achieved_at: form.achievedAt,
      notes: form.notes.trim() || null,
      photo_url: form.photoUrl.trim() || null,
      shared_with_parent: form.sharedWithParent,
    });
    if (form.sharedWithParent) {
      const links = await supabase.from('parent_children').select('parent_id').eq('child_id', form.childId);
      if (!links.error) {
        const childName = milestones.children.find((c) => c.id === form.childId);
        const notifications = ((links.data ?? []) as { parent_id: string }[]).map((l) => ({
          nursery_id: profile.nursery_id,
          user_id: l.parent_id,
          type: 'milestone_shared',
          title_ar: 'إنجاز جديد',
          title_en: 'New milestone',
          body_ar: `🎯 ${childName?.full_name_ar ?? childName?.full_name_en ?? 'Child'}: ${form.milestoneText}`,
          body_en: `🎯 New milestone: ${childName?.full_name_en ?? childName?.full_name_ar ?? 'Child'} - ${form.milestoneText}`,
          channel: 'push',
          read: false,
          sent_at: new Date().toISOString(),
        }));
        if (notifications.length) await supabase.from('notifications').insert(notifications as never);
      }
    }
    toast.success(t('milestones.saved'));
    navigate('/teacher/milestones');
  };

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-none space-y-4 pb-28">
      <h1 className="text-lg font-semibold text-on-surface">{t('milestones.recordTitle')}</h1>
      <div className="space-y-2 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <label className="text-sm">{t('milestones.child')}</label>
        <select
          className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={childId}
          onChange={(e) => {
            setChildId(e.target.value);
            setForm((prev) => ({ ...prev, childId: e.target.value }));
          }}
        >
          <option value="">{t('milestones.selectChild')}</option>
          {milestones.children.map((c) => <option key={c.id} value={c.id}>{i18n.language === 'ar' ? c.full_name_ar : c.full_name_en}</option>)}
        </select>
      </div>
      <MilestoneForm value={form} childAge={childAge} onChange={setForm} onSubmit={onSubmit} />
    </div>
  );
}
