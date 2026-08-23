import { supabase } from '@/lib/supabase';

function ageInYears(dob: string) {
  return Math.max(0, (Date.now() - +new Date(dob)) / (365.25 * 24 * 3600 * 1000));
}

async function pickClassByAgeOrPreferred(params: { nurseryId: string; preferredClass?: string; dob?: string }) {
  const classesRes = await supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', params.nurseryId);
  if (classesRes.error) throw classesRes.error;
  const classes = (classesRes.data ?? []) as Array<{ id: string; name_ar?: string | null; name_en?: string | null }>;
  if (!classes.length) return null;
  if (params.preferredClass) {
    const matched = classes.find((c) => `${c.name_ar ?? ''} ${c.name_en ?? ''}`.toLowerCase().includes(params.preferredClass!.toLowerCase()));
    if (matched) return matched.id;
  }
  if (params.dob) {
    const age = ageInYears(params.dob);
    // Simple fallback until class-age matrix is configured.
    if (age < 2 && classes[0]) return classes[0].id;
    if (age < 4 && classes[1]) return classes[1].id;
  }
  return classes[0].id;
}

export async function activateEnrollment(params: {
  applicationId: string;
  nurseryId: string;
  reviewerId?: string;
  autoGenerateFirstInvoice?: boolean;
}) {
  const appRes = await supabase.from('applications').select('*').eq('id', params.applicationId).single();
  if (appRes.error) throw appRes.error;
  const app = appRes.data as Record<string, unknown>;
  const parentInfo = (app.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const childInfo = (app.child_info_json as Record<string, unknown> | undefined) ?? {};

  let parentId = app.parent_id ? String(app.parent_id) : '';
  if (!parentId) {
    const email = String(parentInfo.email ?? '');
    if (email) {
      const existing = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      if (!existing.error && existing.data) parentId = String((existing.data as { id: string }).id);
      if (!parentId) {
        await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: 'parent_account_invite',
            recipient_email: email,
            language: 'ar',
            nursery_id: params.nurseryId,
            data: { application_id: params.applicationId },
          },
        });
      }
    }
  }

  let childId = app.child_id ? String(app.child_id) : '';
  if (!childId) {
    const classId = await pickClassByAgeOrPreferred({
      nurseryId: params.nurseryId,
      preferredClass: String(childInfo.preferred_class ?? ''),
      dob: String(childInfo.dob ?? ''),
    });
    const childRes = await supabase.from('children').insert({
      nursery_id: params.nurseryId,
      full_name_ar: String(childInfo.full_name ?? 'طفل جديد'),
      full_name_en: String(childInfo.full_name ?? 'New Child'),
      dob: String(childInfo.dob ?? new Date().toISOString().slice(0, 10)),
      class_id: classId,
      enrollment_date: new Date().toISOString().slice(0, 10),
      status: 'active',
      photo_privacy_restricted: Boolean(childInfo.photo_privacy),
    } as never).select('id, class_id').single();
    if (childRes.error) throw childRes.error;
    childId = String((childRes.data as { id: string }).id);
  } else {
    // Parent signup already created the child, as 'pending', and put its id on the
    // application — so the insert above is skipped and nothing else would ever
    // activate it. The parent's dashboard only lists children with status 'active',
    // so without this the child stays invisible to them after approval.
    const activateRes = await supabase
      .from('children')
      .update({ status: 'active' } as never)
      .eq('id', childId)
      .eq('status', 'pending');
    if (activateRes.error) throw activateRes.error;
  }

  if (parentId && childId) {
    const linkRes = await supabase.from('parent_children').insert({ parent_id: parentId, child_id: childId } as never);
    if (linkRes.error && !String(linkRes.error.message).toLowerCase().includes('duplicate')) throw linkRes.error;
  }

  const shouldGenerateInvoice = params.autoGenerateFirstInvoice ?? true; // TODO: replace with settings.auto_generate_first_invoice when available
  if (shouldGenerateInvoice && parentId) {
    await supabase.from('invoices').insert({
      nursery_id: params.nurseryId,
      parent_id: parentId,
      child_id: childId,
      amount: 0,
      status: 'pending',
      invoice_type: 'other',
      due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      line_items_json: { items: [{ description: 'Enrollment fee (placeholder)', quantity: 1, unit_price: 0, total: 0 }] },
    } as never);
  }

  const updateRes = await supabase.from('applications').update({
    status: 'enrolled',
    reviewed_by: params.reviewerId ?? null,
    reviewed_at: new Date().toISOString(),
    parent_id: parentId || null,
    child_id: childId || null,
  } as never).eq('id', params.applicationId);
  if (updateRes.error) throw updateRes.error;

  const parentEmail = String(parentInfo.email ?? '');
  if (parentEmail) {
    await supabase.functions.invoke('email-dispatch', {
      body: {
        trigger_type: 'enrollment_welcome',
        recipient_email: parentEmail,
        language: 'ar',
        nursery_id: params.nurseryId,
        data: {
          child_name: childInfo.full_name ?? '',
          start_date: childInfo.start_date ?? new Date().toISOString().slice(0, 10),
          application_id: params.applicationId,
        },
      },
    });
  }

  return { childId, parentId };
}
