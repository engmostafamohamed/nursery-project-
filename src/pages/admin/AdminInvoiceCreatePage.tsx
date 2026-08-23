import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceLineItemsBuilder, type BuilderLineItem } from '@/components/admin/InvoiceLineItemsBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import { isValidIsoDate } from '@/lib/onboardingDateBounds';
import { useSettings } from '@/lib/useSettings';
import { supabase } from '@/lib/supabase';

type ParentOption = { id: string; name: string; email: string | null; language: 'ar' | 'en' };

export function AdminInvoiceCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { settings, nurseryId } = useSettings();
  const { user } = useAuthSession();
  const [parentId, setParentId] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [invoiceType, setInvoiceType] = useState<'monthly' | 'extra_hours' | 'other'>('monthly');
  const [dueDate, setDueDate] = useState(() => {
    const d = Number(settings.invoice_due_days ?? 7);
    return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<BuilderLineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const parentsQuery = useQuery({
    queryKey: ['invoice-parent-options', nurseryId],
    queryFn: async (): Promise<ParentOption[]> => {
      if (!nurseryId) return [];
      const res = await supabase
        .from('users')
        .select('id, name_ar, name_en, email, language_pref')
        .eq('nursery_id', nurseryId)
        .eq('role', 'parent');
      if (res.error) throw res.error;
      return ((res.data ?? []) as {
        id: string;
        name_ar: string | null;
        name_en: string | null;
        email: string | null;
        language_pref: string | null;
      }[]).map((row) => ({
        id: row.id,
        name: row.name_ar || row.name_en || 'Parent',
        email: row.email,
        language: row.language_pref === 'en' ? 'en' : 'ar',
      }));
    },
    enabled: Boolean(nurseryId),
  });

  const total = useMemo(() => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [lineItems]);
  const filteredParents = useMemo(
    () => (parentsQuery.data ?? []).filter((p) => p.name.toLowerCase().includes(parentSearch.trim().toLowerCase())),
    [parentSearch, parentsQuery.data],
  );

  useEffect(() => {
    const d = Number(settings.invoice_due_days ?? 7);
    setDueDate(new Date(Date.now() + d * 86400000).toISOString().slice(0, 10));
  }, [settings.invoice_due_days]);

  const validate = () => {
    if (!parentId) return 'invoice.create.validation.parentRequired';
    if (!dueDate.trim()) return 'invoice.create.validation.dueDateRequired';
    if (!isValidIsoDate(dueDate)) return 'invoice.create.validation.dueDateInvalid';
    if (dueDate < today) return 'invoice.create.validation.dueDatePast';
    if (!lineItems.length) return 'invoice.create.validation.lineItemsRequired';
    for (const item of lineItems) {
      if (!item.description.trim()) return 'invoice.create.validation.lineItemsRequired';
      if (item.quantity <= 0 || item.unitPrice <= 0) return 'invoice.create.validation.lineItemsPositive';
    }
    if (total <= 0) return 'invoice.create.validation.totalPositive';
    return null;
  };

  const onSubmit = async () => {
    const errKey = validate();
    if (errKey) {
      toast.error(t(errKey));
      return;
    }
    if (!nurseryId) return;
    setIsSubmitting(true);
    try {
      const parent = (parentsQuery.data ?? []).find((row) => row.id === parentId);
      const payload = {
        nursery_id: nurseryId,
        parent_id: parentId,
        amount: total.toFixed(2),
        due_date: dueDate,
        status: 'pending',
        invoice_type: invoiceType,
        line_items_json: { items: lineItems, notes },
      };
      const createdRes = await supabase.from('invoices').insert(payload as never).select('id').single();
      if (createdRes.error) throw createdRes.error;
      const invoiceId = (createdRes.data as { id: string }).id;

      await supabase.from('notifications').insert({
        nursery_id: nurseryId,
        user_id: parentId,
        type: 'invoice_ready',
        title_ar: 'تم إنشاء فاتورة جديدة',
        title_en: 'New invoice generated',
        body_ar: `تم إنشاء فاتورة بقيمة ${total.toFixed(2)} جنيه.`,
        body_en: `A new invoice of EGP ${total.toFixed(2)} has been created.`,
        channel: 'push',
        read: false,
        sent_at: new Date().toISOString(),
      } as never);

      if (parent?.email) {
        await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: 'invoice',
            recipient_email: parent.email,
            language: parent.language,
            nursery_id: nurseryId,
            user_id: parentId,
            data: { amount: total.toFixed(2), name: parent.name },
          },
        });
      }

      toast.success(t('invoice.create.success'));
      navigate(`/admin/invoices/${invoiceId}${qs}`);
    } catch {
      toast.error(t('invoice.create.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('invoice.create.title')}</h1>
        <Button asChild variant="outline"><Link to={`/admin/invoices${qs}`}>{t('invoice.create.back')}</Link></Button>
      </div>

      <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label>{t('invoice.create.parent')}</Label>
            <Input
              value={parentSearch}
              onChange={(e) => setParentSearch(e.target.value)}
              placeholder={t('invoice.create.searchParent')}
            />
            <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('invoice.create.selectParent')}</option>
              {filteredParents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('invoice.create.type')}</Label>
            <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as 'monthly' | 'extra_hours' | 'other')}>
              {(['monthly', 'extra_hours', 'other'] as const).map((type) => <option key={type} value={type}>{t(`invoice.types.${type}`)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('invoice.create.dueDate')}</Label>
            <Input type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('invoice.create.total')}</Label>
            <Input value={total.toFixed(2)} readOnly />
          </div>
        </div>

        <InvoiceLineItemsBuilder items={lineItems} onChange={setLineItems} />

        <div className="space-y-2">
          <Label>{t('invoice.create.notes')}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void onSubmit()} disabled={isSubmitting || !user || Boolean(validate())}>
            {t('invoice.create.submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
