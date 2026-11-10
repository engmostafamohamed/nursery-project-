import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { compressImageForUpload } from '@/lib/imageCompression';
import { cn } from '@/lib/utils';

import { MENU_FILE_MAX_BYTES, MENU_IMAGE_TARGET_MB, menuFilePath, menuFileProblem } from './menuFile';
import { menuErrorKey } from './menuErrors';
import { menuFileUrl, removeMenuFile, replaceMenuFile } from './menuFileApi';
import type { Menu } from './menuApi';
import { useMenuChange } from './useMenu';

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * The menu as a photo or PDF (for its week or month): open it, and for editors add, replace or remove it. A problem
 * with the chosen file shows under the field at once; a photo is made smaller before upload.
 */
export function MenuFileCard({ nurseryId, menu }: { nurseryId: string; menu: Menu }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const file = menu.info?.file ?? null;
  const replace = useMenuChange(nurseryId, (picked: File) =>
    replaceMenuFile({ nurseryId, day: menu.startsOn, path: menuFilePath(nurseryId, menu.startsOn, picked.type), file: picked }),
  );
  const remove = useMenuChange(nurseryId, () => removeMenuFile(nurseryId, menu.startsOn));
  const busy = replace.isPending || remove.isPending;

  if (!file && !menu.canEdit) return null;

  const choose = async (picked: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!picked) return;
    const first = menuFileProblem(picked);
    if (first) {
      setProblem(t(`fnb.file.errors.${first}`, { max: mb(MENU_FILE_MAX_BYTES) }));
      return;
    }
    const prepared = picked.type === 'application/pdf' ? picked : await compressImageForUpload(picked, MENU_IMAGE_TARGET_MB);
    if (prepared.size > MENU_FILE_MAX_BYTES) {
      setProblem(t('fnb.file.errors.too_large', { max: mb(MENU_FILE_MAX_BYTES) }));
      return;
    }
    setProblem(null);
    try {
      await replace.mutateAsync(prepared);
      toast.success(t('fnb.file.saved'));
    } catch (error) {
      setProblem(t(menuErrorKey(error)));
    }
  };

  const open = async () => {
    if (!file) return;
    setOpening(true);
    try {
      window.open(await menuFileUrl(file.path), '_blank', 'noopener');
    } catch {
      toast.error(t('fnb.file.openFailed'));
    } finally {
      setOpening(false);
    }
  };

  const drop = async () => {
    const ok = await confirm({ title: t('fnb.file.removeTitle'), description: t('fnb.file.removeBody'), confirmText: t('fnb.file.remove'), icon: 'delete' });
    if (!ok) return;
    try {
      await remove.mutateAsync(undefined);
    } catch (error) {
      toast.error(t(menuErrorKey(error)));
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm" aria-labelledby="menu-file-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MaterialSymbol name={file?.type === 'application/pdf' ? 'picture_as_pdf' : 'image'} size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="menu-file-title" className="text-sm font-semibold text-on-surface">{t('fnb.file.title')}</h2>
          <p className="truncate text-xs text-on-surface-variant" data-testid="menu-file-name">
            {file ? `${file.name} · ${mb(file.size)} MB` : t('fnb.file.none')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {file ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void open()} disabled={opening}>
              <MaterialSymbol name="open_in_new" size="text-base" className="me-1" />
              {t('fnb.file.open')}
            </Button>
          ) : null}
          {menu.canEdit ? (
            <>
              <Button type="button" size="sm" variant={file ? 'outline' : 'default'} onClick={() => inputRef.current?.click()} disabled={busy} aria-busy={replace.isPending}>
                <MaterialSymbol name={replace.isPending ? 'progress_activity' : 'upload'} size="text-base" className={cn('me-1', replace.isPending && 'animate-spin')} />
                {replace.isPending ? t('fnb.file.uploading') : file ? t('fnb.file.replace') : t('fnb.file.add')}
              </Button>
              {file ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => void drop()} disabled={busy}>
                  {t('fnb.file.remove')}
                </Button>
              ) : null}
              <input
                ref={inputRef}
                id="menu-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                aria-label={t('fnb.file.add')}
                aria-describedby={problem ? 'menu-file-error' : undefined}
                onChange={(e) => void choose(e.target.files?.[0])}
              />
            </>
          ) : null}
        </div>
      </div>
      {problem ? (
        <p id="menu-file-error" role="alert" className="mt-2 text-xs text-error">
          {problem}
        </p>
      ) : menu.canEdit ? (
        <p className="mt-2 text-xs text-on-surface-variant">{t('fnb.file.hint', { max: mb(MENU_FILE_MAX_BYTES) })}</p>
      ) : null}
    </section>
  );
}
