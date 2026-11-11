import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterChips } from '@/components/ui/FilterChips';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMyClassChildren, useMyClasses, useSendFamilyMessage, useSentFamilyMessages } from '@/hooks/useFamilyMessages';
import { localName } from '@/lib/bilingualName';
import { childrenOf, FAMILY_MESSAGE_MAX, familyMessageErrorKey } from '@/lib/familyMessages';
import { audienceChildren, familiesOf, filterClassChildren, NO_CHILDREN_FILTERS, type FamilyAudience, type MyClassChild } from '@/lib/teacherClasses';
import { cn } from '@/lib/utils';

type Tab = 'compose' | 'sent';
/** How the teacher picks the children: a preset group, or by hand. */
type Pick = 'class' | 'absent_today' | 'extra_hours_now' | 'choose';
type T = ReturnType<typeof useTranslation>['t'];

function audienceLabel(t: T, audience: FamilyAudience | Pick): string {
  switch (audience) {
    case 'class':
      return t('familyMessages.audience.class');
    case 'absent_today':
      return t('familyMessages.audience.absent_today');
    case 'extra_hours_now':
      return t('familyMessages.audience.extra_hours_now');
    case 'child':
      return t('familyMessages.audience.child');
    case 'children':
    case 'choose':
      return t('familyMessages.audience.children');
  }
}

/**
 * Messages to families: write to the parents of one child, chosen children, a whole class, today's
 * absent children or the children still in extra hours, and see what was sent and who read it.
 * Conversations stay in Chat.
 */
export function TeacherFamilyMessagesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'compose';
  const setTab = (next: Tab) => {
    const copy = new URLSearchParams(params);
    copy.set('tab', next);
    setParams(copy, { replace: true });
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="outgoing_mail" title={t('familyMessages.title')} description={t('familyMessages.description')}>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChips
            value={tab}
            onChange={setTab}
            label={t('familyMessages.tabs.label')}
            options={[
              { value: 'compose', label: t('familyMessages.tabs.compose') },
              { value: 'sent', label: t('familyMessages.tabs.sent') },
            ]}
          />
          <Button asChild variant="outline" size="sm">
            <Link to="/teacher/chat">
              <MaterialSymbol name="forum" className="me-1 text-base" />
              {t('familyMessages.openChat')}
            </Link>
          </Button>
        </div>
      </PageHeader>
      {tab === 'compose' ? (
        <Compose initialChild={params.get('child')} initialClass={params.get('class')} onSent={() => setTab('sent')} />
      ) : (
        <Sent />
      )}
    </div>
  );
}

function Compose({ initialChild, initialClass, onSent }: { initialChild: string | null; initialClass: string | null; onSent: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const id = useId();
  const { user } = useAuthSession();
  const classes = useMyClasses(user?.id);
  const childrenQuery = useMyClassChildren(user?.id);
  const send = useSendFamilyMessage(user?.id);

  const [pick, setPick] = useState<Pick>(initialChild ? 'choose' : 'class');
  const [classId, setClassId] = useState(initialClass ?? 'all');
  const [search, setSearch] = useState('');
  // The children ticked by hand; null while the preset group is used as it is.
  const [chosen, setChosen] = useState<Set<string> | null>(initialChild ? new Set([initialChild]) : null);
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState({ body: false, children: false });

  const all = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const group = useMemo(
    () => (pick === 'choose' ? all.filter((c) => c.day_status !== 'not_enrolled' && (classId === 'all' || c.class_id === classId)) : audienceChildren(all, pick, classId)),
    [all, pick, classId],
  );
  const selectedIds = useMemo(() => {
    if (chosen) return new Set([...chosen].filter((childId) => all.some((c) => c.child_id === childId)));
    return pick === 'choose' ? new Set<string>() : new Set(group.map((c) => c.child_id));
  }, [chosen, group, pick, all]);
  const selected = useMemo(() => all.filter((c) => selectedIds.has(c.child_id)), [all, selectedIds]);
  const shown = useMemo(() => filterClassChildren(group, { ...NO_CHILDREN_FILTERS, search }), [group, search]);
  const families = familiesOf(selected);

  const bodyLength = body.trim().length;
  const bodyError = !bodyLength ? t('familyMessages.compose.errors.bodyRequired') : bodyLength > FAMILY_MESSAGE_MAX ? t('familyMessages.compose.errors.bodyTooLong', { max: FAMILY_MESSAGE_MAX }) : null;
  const childrenError = selected.length === 0 ? t('familyMessages.compose.errors.noChildren') : families === 0 ? t('familyMessages.compose.errors.noParents') : null;
  const name = (c: MyClassChild) => (localName(c.full_name_ar, c.full_name_en, lang.startsWith('ar'))) || '—';

  const choosePick = (next: Pick) => {
    setPick(next);
    setChosen(null);
    setTouched((s) => ({ ...s, children: false }));
  };
  const toggle = (childId: string) => {
    const next = new Set(selectedIds);
    if (next.has(childId)) next.delete(childId);
    else next.add(childId);
    setChosen(next);
    setTouched((s) => ({ ...s, children: true }));
  };
  const setAll = (on: boolean) => {
    setChosen(on ? new Set(shown.map((c) => c.child_id)) : new Set());
    setTouched((s) => ({ ...s, children: true }));
  };

  const submit = async () => {
    setTouched({ body: true, children: true });
    if (bodyError || childrenError) return;
    const audience: FamilyAudience = pick === 'choose' ? (selected.length === 1 ? 'child' : 'children') : pick;
    const ok = await confirm({
      title: t('familyMessages.compose.confirmTitle'),
      description: t('familyMessages.compose.confirmBody', { children: selected.length, families }),
      confirmText: t('familyMessages.compose.send'),
      icon: 'send',
    });
    if (!ok) return;
    try {
      const result = await send.mutateAsync({ childIds: selected.map((c) => c.child_id), body: body.trim(), audience, classId: classId === 'all' ? null : classId });
      toast.success(t('familyMessages.compose.sent', { families: result.parents }));
      setBody('');
      setChosen(null);
      setTouched({ body: false, children: false });
      onSent();
    } catch (error) {
      toast.error(t(`familyMessages.errors.${familyMessageErrorKey(error)}`));
    }
  };

  if (childrenQuery.isPending || classes.isPending) return <TableLoading rows={6} />;
  if (!(classes.data ?? []).length) return <TableEmpty icon="school" title={t('familyMessages.compose.noClasses')} />;

  const picks: Pick[] = ['class', 'absent_today', 'extra_hours_now', 'choose'];
  const counts: Record<Pick, number> = {
    class: audienceChildren(all, 'class', classId).length,
    absent_today: audienceChildren(all, 'absent_today', classId).length,
    extra_hours_now: audienceChildren(all, 'extra_hours_now', classId).length,
    choose: selected.length,
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
      <TableCard
        title={t('familyMessages.compose.whoTitle')}
        count={t('familyMessages.compose.selectedCount', { children: selected.length, families })}
        filters={
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${id}-class`}>{t('familyMessages.compose.class')}</Label>
                <Select id={`${id}-class`} className="h-10 min-w-[12rem] text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setChosen(null); }}>
                  <option value="all">{t('familyMessages.compose.allMyClasses')}</option>
                  {(classes.data ?? []).map((c) => (
                    <option key={c.class_id} value={c.class_id}>
                      {localName(c.name_ar, c.name_en, lang.startsWith('ar')) || '—'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[14rem] flex-1 space-y-1">
                <Label htmlFor={`${id}-search`}>{t('familyMessages.compose.search')}</Label>
                <Input id={`${id}-search`} type="search" className="h-10" value={search} placeholder={t('familyMessages.compose.searchPlaceholder')} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <FilterChips
              value={pick}
              onChange={choosePick}
              label={t('familyMessages.compose.whoTitle')}
              options={picks.map((value) => ({ value, label: audienceLabel(t, value), count: value === 'choose' ? undefined : counts[value] }))}
            />
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-2 text-xs sm:px-5">
          <span className="text-on-surface-variant">{t('familyMessages.compose.tickHint')}</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAll(true)} disabled={!shown.length}>
              {t('familyMessages.compose.selectAll')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAll(false)} disabled={!selected.length}>
              {t('familyMessages.compose.selectNone')}
            </Button>
          </span>
        </div>
        {shown.length ? (
          <ul className="max-h-[32rem] divide-y divide-outline-variant overflow-y-auto">
            {shown.map((child) => {
              const checked = selectedIds.has(child.child_id);
              const parents = child.parents.map((p) => (localName(p.name_ar, p.name_en, lang.startsWith('ar')))).filter(Boolean).join(lang.startsWith('ar') ? '، ' : ', ');
              return (
                <li key={child.child_id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-lowest sm:px-5', checked && 'bg-primary/5')}>
                    <Checkbox checked={checked} onCheckedChange={() => toggle(child.child_id)} aria-label={name(child)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-on-surface">{name(child)}</span>
                      <span className="block truncate text-xs text-on-surface-variant">
                        {child.child_code ? <span className="font-mono" dir="ltr">{child.child_code}</span> : null}
                        {child.child_code ? ' · ' : ''}
                        {parents || t('familyMessages.compose.noParentsShort')}
                      </span>
                    </span>
                    <ChildState child={child} />
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <TableEmpty icon="group_off" title={t('familyMessages.compose.noneInGroup')} />
        )}
        <FieldError className="px-4 pb-3 sm:px-5" message={touched.children ? childrenError : null} />
      </TableCard>

      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5 xl:sticky xl:top-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <MaterialSymbol name="edit_note" className="text-primary" />
          {t('familyMessages.compose.messageTitle')}
        </h2>
        <div className="space-y-1">
          <Label htmlFor={`${id}-body`}>{t('familyMessages.compose.message')}</Label>
          <Textarea
            id={`${id}-body`}
            rows={8}
            value={body}
            placeholder={t('familyMessages.compose.messagePlaceholder')}
            aria-invalid={touched.body && Boolean(bodyError)}
            aria-describedby={`${id}-body-error`}
            className={cn(touched.body && bodyError && invalidFieldClass)}
            onChange={(e) => {
              setBody(e.target.value);
              setTouched((s) => ({ ...s, body: true }));
            }}
          />
          <div className="flex items-start justify-between gap-2">
            <FieldError id={`${id}-body-error`} message={touched.body ? bodyError : null} />
            <span className={cn('ms-auto text-xs tabular-nums', bodyLength > FAMILY_MESSAGE_MAX ? 'text-error' : 'text-on-surface-variant')}>
              {bodyLength}/{FAMILY_MESSAGE_MAX}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-surface-container-lowest p-3 text-sm text-on-surface-variant">
          <p className="flex items-center gap-2 font-medium text-on-surface">
            <MaterialSymbol name="groups" className="text-base text-primary" />
            {t('familyMessages.compose.reaches', { children: selected.length, families })}
          </p>
          <p className="mt-1 text-xs">{t('familyMessages.compose.senderNote')}</p>
        </div>
        <Button type="button" className="w-full" disabled={send.isPending} onClick={() => void submit()}>
          <MaterialSymbol name="send" className="me-2 text-base" />
          {send.isPending ? t('familyMessages.compose.sending') : t('familyMessages.compose.send')}
        </Button>
      </section>
    </div>
  );
}

function ChildState({ child }: { child: MyClassChild }) {
  const { t } = useTranslation();
  if (child.late_now) return <StatusPill tone="error" icon="schedule">{t('familyMessages.state.extraNow')}</StatusPill>;
  if (child.day_status === 'in_nursery') return <StatusPill tone="primary" icon="home_work">{t('familyMessages.state.here')}</StatusPill>;
  if (child.day_status === 'picked_up') return <StatusPill tone="success" icon="logout">{t('familyMessages.state.pickedUp')}</StatusPill>;
  if (child.day_status === 'excused') return <StatusPill tone="warning" icon="mark_email_read">{t('familyMessages.state.excused')}</StatusPill>;
  if (child.day_status === 'absent') return <StatusPill tone="error" icon="event_busy">{t('familyMessages.state.absent')}</StatusPill>;
  return <StatusPill tone="neutral" icon="weekend">{t('familyMessages.state.off')}</StatusPill>;
}

function Sent() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const { user } = useAuthSession();
  const sent = useSentFamilyMessages(user?.id);
  const rows = sent.data ?? [];

  return (
    <TableCard title={t('familyMessages.tabs.sent')} count={t('familyMessages.sent.count', { count: rows.length })}>
      {sent.isPending ? (
        <TableLoading />
      ) : !rows.length ? (
        <TableEmpty icon="outgoing_mail" title={t('familyMessages.sent.empty')} />
      ) : (
        <ul className="divide-y divide-outline-variant">
          {rows.map((m) => {
            const share = m.parents_count > 0 ? Math.round((m.read_count / m.parents_count) * 100) : 0;
            return (
              <li key={m.message_id} className="space-y-2 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  <time dateTime={m.created_at} className="font-medium text-on-surface">
                    {new Date(m.created_at).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </time>
                  <StatusPill tone="primary">{audienceLabel(t, m.audience)}</StatusPill>
                  {localName(m.sender_class_names_ar, m.sender_class_names_en, lang.startsWith('ar'))}
                </div>
                <p className="whitespace-pre-line text-sm text-on-surface">{m.body}</p>
                <p className="line-clamp-1 text-xs text-on-surface-variant">{t('familyMessages.sent.to', { children: childrenOf(m, lang) })}</p>
                <div className="flex items-center gap-3">
                  <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-high" aria-hidden>
                    <span className="block h-full rounded-full bg-success" style={{ width: `${share}%` }} />
                  </span>
                  <span className="text-xs text-on-surface-variant">{t('familyMessages.sent.readBy', { read: m.read_count, families: m.parents_count })}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </TableCard>
  );
}
