import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInquiries } from '@/hooks/useInquiries';

type Props = {
  nurseryId: string;
};

const egyptPhone = /^(\+20|0)?1[0-2,5]{1}[0-9]{8}$/;

export function InquiryForm({ nurseryId }: Props) {
  const { t } = useTranslation();
  const { classes, submitPublicInquiry } = useInquiries(nurseryId);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    child_name: '',
    child_dob: '',
    preferred_class: '',
    preferred_start_date: '',
    source: 'website' as 'website' | 'referral' | 'walk_in' | 'social_media' | 'other',
    message: '',
  });
  const preferredClassOptions = useMemo(
    () => classes.map((c) => ({ id: String(c.id), name: String(c.name_ar ?? c.name_en ?? '-') })),
    [classes],
  );

  if (done) {
    return (
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 text-center">
        <h2 className="text-lg font-semibold text-on-surface">{t('admissions.public.successTitle')}</h2>
        <p className="mt-2 text-sm text-on-surface-variant">{t('admissions.public.successDescription')}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.parent_name || !form.parent_email || !form.parent_phone || !form.child_name || !form.child_dob) {
          toast.error(t('admissions.public.validationRequired'));
          return;
        }
        if (!/^\S+@\S+\.\S+$/.test(form.parent_email)) {
          toast.error(t('admissions.public.invalidEmail'));
          return;
        }
        if (!egyptPhone.test(form.parent_phone)) {
          toast.error(t('admissions.public.invalidPhone'));
          return;
        }
        void submitPublicInquiry({
          nursery_id: nurseryId,
          ...form,
        }).then(() => {
          setDone(true);
          toast.success(t('admissions.public.successTitle'));
        }).catch(() => toast.error(t('admissions.public.submitError')));
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2"><Label>{t('admissions.parentName')}</Label><Input value={form.parent_name} onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))} /></div>
        <div className="space-y-2"><Label>{t('admissions.parentEmail')}</Label><Input type="email" value={form.parent_email} onChange={(e) => setForm((p) => ({ ...p, parent_email: e.target.value }))} /></div>
        <div className="space-y-2"><Label>{t('admissions.parentPhone')}</Label><Input value={form.parent_phone} onChange={(e) => setForm((p) => ({ ...p, parent_phone: e.target.value }))} /></div>
        <div className="space-y-2"><Label>{t('admissions.childName')}</Label><Input value={form.child_name} onChange={(e) => setForm((p) => ({ ...p, child_name: e.target.value }))} /></div>
        <div className="space-y-2"><Label>{t('admissions.childDob')}</Label><Input type="date" value={form.child_dob} onChange={(e) => setForm((p) => ({ ...p, child_dob: e.target.value }))} /></div>
        <div className="space-y-2">
          <Label>{t('admissions.preferredClass')}</Label>
          <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={form.preferred_class} onChange={(e) => setForm((p) => ({ ...p, preferred_class: e.target.value }))}>
            <option value="">{t('admissions.selectClass')}</option>
            {preferredClassOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label>{t('admissions.preferredStartDate')}</Label><Input type="date" value={form.preferred_start_date} onChange={(e) => setForm((p) => ({ ...p, preferred_start_date: e.target.value }))} /></div>
        <div className="space-y-2">
          <Label>{t('admissions.source')}</Label>
          <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value as typeof p.source }))}>
            {(['website', 'referral', 'walk_in', 'social_media', 'other'] as const).map((s) => <option key={s} value={s}>{t(`admissions.sources.${s}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('admissions.message')}</Label>
        <textarea className="min-h-[100px] w-full rounded-lg border border-outline-variant bg-surface text-foreground p-3 text-sm outline-none" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} />
      </div>
      <Button type="submit" className="w-full">{t('admissions.public.submit')}</Button>
    </form>
  );
}
