import { useMemo, useState } from 'react';
import { Calendar, CircleAlert, MessageCircle, Receipt, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useNotificationsCenter } from '@/hooks/useNotificationsCenter';
import { supabase } from '@/lib/supabase';

type Role = 'admin' | 'parent' | 'teacher';
type Filter = 'all' | 'attendance' | 'messages' | 'financial' | 'system';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  role: Role;
}

function mapTypeFilter(type: string): Filter {
  if (type.includes('attendance')) return 'attendance';
  if (type.includes('message')) return 'messages';
  if (type.includes('invoice') || type.includes('payment') || type.includes('financial')) return 'financial';
  return 'system';
}

function iconForType(type: string) {
  const filter = mapTypeFilter(type);
  if (filter === 'attendance') return <UserRound className="h-4 w-4" />;
  if (filter === 'messages') return <MessageCircle className="h-4 w-4" />;
  if (filter === 'financial') return <Receipt className="h-4 w-4" />;
  if (type.includes('event')) return <Calendar className="h-4 w-4" />;
  return <CircleAlert className="h-4 w-4" />;
}

function routeForType(type: string, role: Role): string {
  if (type.includes('attendance')) return role === 'teacher' ? '/teacher/attendance' : '/parent';
  if (type.includes('message')) return role === 'admin' ? '/admin/messages' : role === 'teacher' ? '/teacher/messages' : '/parent/messages';
  if (type.includes('event')) return '/parent/events';
  if (type.includes('invoice') || type.includes('financial') || type.includes('payment')) return '/parent';
  return role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher' : '/parent';
}

function relativeFrom(sentAt: string, lang: string): string {
  const diff = Math.round((Date.now() - new Date(sentAt).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return rtf.format(-diff, 'second');
  const mins = Math.round(diff / 60);
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(-days, 'day');
}

export function NotificationCenterDrawer({ open, onOpenChange, userId, role }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data = [] } = useNotificationsCenter(userId);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return data;
    return data.filter((n) => mapTypeFilter(n.type) === filter);
  }, [data, filter]);

  const markAllAsRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true } as never).eq('user_id', userId).eq('read', false);
  };

  const onRowClick = async (id: string, type: string) => {
    await supabase.from('notifications').update({ read: true } as never).eq('id', id);
    onOpenChange(false);
    navigate(routeForType(type, role));
  };

  return (
    <>
      {open ? <button className="fixed inset-0 z-40 bg-black/30" onClick={() => onOpenChange(false)} /> : null}
      <aside className={`fixed inset-y-0 end-0 z-50 w-[92vw] max-w-md transform bg-surface-container-lowest p-4 shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'}`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-on-surface">{t('notifications.title')}</h3>
          <Button variant="ghost" size="sm" onClick={() => void markAllAsRead()}>{t('notifications.markAllRead')}</Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {(['all', 'attendance', 'messages', 'financial', 'system'] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-full px-3 py-1 text-xs ${filter === key ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}
              onClick={() => setFilter(key)}
            >
              {t(`notifications.filters.${key}`)}
            </button>
          ))}
        </div>

        <div className="space-y-2 overflow-y-auto pb-10">
          {filtered.map((item) => {
            const title = i18n.language === 'ar' ? item.title_ar : item.title_en;
            const body = i18n.language === 'ar' ? item.body_ar : item.body_en;
            return (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-xl border p-3 text-start ${item.read ? 'bg-surface-container border-outline-variant' : 'bg-surface-container-lowest border-outline-variant'}`}
                onClick={() => void onRowClick(item.id, item.type)}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-on-surface-variant">{iconForType(item.type)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-on-surface">{title}</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{body}</p>
                    <p className="mt-1 text-[11px] text-on-surface-variant">{relativeFrom(item.sent_at, i18n.language)}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container p-4 text-center text-xs text-on-surface-variant">
              {t('notifications.empty')}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
