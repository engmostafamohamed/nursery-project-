import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, IconAction, StatusPill, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import type { useContentLibrary } from '@/hooks/useContentLibrary';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/lib/datetime';

type Library = ReturnType<typeof useContentLibrary>;

/** Only web links open from the library (a typed `javascript:` or other scheme is not linked). */
function webLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const CATEGORY_TONE: Record<string, PillTone> = { parenting_tips: 'primary', activities: 'success', recipes: 'warning', health: 'error' };

/**
 * The content library as a table with a pager: one row per item (title and a line of its text,
 * category, date, its media link). A row opens the full text under it.
 */
export function ContentLibraryTable({ library, resetKey }: { library: Library; resetKey?: unknown }) {
  const { t } = useTranslation();
  const pager = usePagination(library.items, 10, `${resetKey ?? ''}-${library.items.length}`);
  const [openId, setOpenId] = useState<string | null>(null);

  if (library.isLoading) return <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm"><TableLoading rows={4} /></div>;
  if (!library.items.length) {
    return (
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <TableEmpty icon="menu_book" title={t('library.table.emptyTitle')} description={t('library.table.emptyDescription')} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <DataTable minWidth={760}>
        <THead>
          <Th>{t('library.table.item')}</Th>
          <Th>{t('library.table.category')}</Th>
          <Th>{t('library.table.date')}</Th>
          <Th align="end">{t('library.table.actions')}</Th>
        </THead>
        <TBody>
          {pager.pageItems.map((item) => {
            const id = String(item.id);
            const category = String(item.category);
            const open = openId === id;
            const media = webLink(item.media_url);
            return (
              <Fragment key={id}>
                <Tr onClick={() => setOpenId(open ? null : id)} data-testid="library-item">
                  <Td className="min-w-[16rem] max-w-[30rem]">
                    <span className="block font-semibold text-on-surface">{String(item.title)}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-on-surface-variant">{String(item.content)}</span>
                  </Td>
                  <Td>
                    <StatusPill tone={CATEGORY_TONE[category] ?? 'neutral'}>{t(`library.categories.${category}`)}</StatusPill>
                  </Td>
                  <Td className="whitespace-nowrap text-on-surface-variant">{item.created_at ? formatDate(String(item.created_at)) : '—'}</Td>
                  <Td align="end">
                    <span className="flex items-center justify-end gap-0.5">
                      <IconAction icon={open ? 'expand_less' : 'expand_more'} label={t('library.table.read')} onClick={() => setOpenId(open ? null : id)} />
                      {media ? (
                        <a
                          href={media}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('library.openMedia')}
                          title={t('library.openMedia')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-high hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-lg" aria-hidden>open_in_new</span>
                        </a>
                      ) : null}
                    </span>
                  </Td>
                </Tr>
                {open ? (
                  <tr className="bg-surface-container-lowest">
                    <td colSpan={4} className="whitespace-pre-line px-4 py-3 text-sm text-on-surface">
                      {String(item.content)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
    </div>
  );
}
