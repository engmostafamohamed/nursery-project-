import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { DataTable, StatusPill, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

export type InboxTableItem = {
  id: string;
  /** The material symbol for this kind of message. */
  icon: string;
  /** The kind's label, already translated. */
  kindLabel: string;
  title: string;
  preview: string;
  sentAt: string;
  unread: boolean;
  actionLink: string;
};

/** "5 minutes ago" in the viewer's language. */
function relativeTime(iso: string, lang: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, 'second');
  const mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(-days, 'day');
}

/**
 * An inbox as a table with a pager: one row per message (kind, title and first line, when),
 * unread rows bold with a dot. The row opens where the message leads.
 */
export function InboxTable({ items }: { items: InboxTableItem[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pager = usePagination(items, 10, items.length);

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <DataTable minWidth={720}>
        <THead>
          <Th>{t('common.inboxTable.kind')}</Th>
          <Th>{t('common.inboxTable.message')}</Th>
          <Th>{t('common.inboxTable.when')}</Th>
          <Th align="end"><span className="sr-only">{t('common.inboxTable.open')}</span></Th>
        </THead>
        <TBody>
          {pager.pageItems.map((it) => (
            <Tr key={it.id} onClick={() => navigate(it.actionLink)} className={cn(it.unread && 'bg-primary/5')} data-testid="inbox-row">
              <Td>
                <StatusPill tone={it.unread ? 'primary' : 'neutral'} icon={it.icon}>{it.kindLabel}</StatusPill>
              </Td>
              <Td className="min-w-[16rem] max-w-[28rem]">
                <span className="flex items-center gap-2">
                  {it.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
                  <span className={cn('truncate', it.unread ? 'font-semibold text-on-surface' : 'font-medium text-on-surface')}>{it.title}</span>
                </span>
                <span className="mt-0.5 line-clamp-1 block text-xs text-on-surface-variant">{it.preview}</span>
              </Td>
              <Td className="whitespace-nowrap text-on-surface-variant">{relativeTime(it.sentAt, i18n.language)}</Td>
              <Td align="end">
                <MaterialSymbol name="chevron_right" size="text-xl" className="text-primary rtl:rotate-180" />
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
    </div>
  );
}
