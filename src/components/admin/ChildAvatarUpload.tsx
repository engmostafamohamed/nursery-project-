import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type Props = {
  childId: string;
  nurseryId: string;
  fullNameForPlaceholder: string;
  avatarUrl: string | null;
};

export function ChildAvatarUpload({ childId, nurseryId, fullNameForPlaceholder, avatarUrl }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const placeholderSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullNameForPlaceholder)}&background=eceef0&color=191c1e`;

  const upload = async (file: File) => {
    const compressed = await compressImageForUpload(file);
    const path = `${nurseryId}/${childId}/avatar.jpg`;
    const { error: upErr } = await supabase.storage.from('child-avatars').upload(path, compressed, {
      upsert: true,
      contentType: compressed.type,
    });
    if (upErr) {
      toast.error(t('admin.children.avatarUploadFailed'), { description: upErr.message });
      return;
    }
    const { data: pub } = supabase.storage.from('child-avatars').getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    const { error: dbErr } = await supabase
      .from('children')
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() } as never)
      .eq('id', childId)
      .eq('nursery_id', nurseryId);
    if (dbErr) {
      toast.error(t('admin.children.avatarSaveFailed'), { description: dbErr.message });
      return;
    }
    await qc.invalidateQueries({ queryKey: ['admin-child-record'] });
    await qc.invalidateQueries({ queryKey: ['admin-children-list'] });
    toast.success(t('admin.children.avatarSaved'));
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      toast.error(t('admin.children.avatarInvalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('admin.children.avatarTooLarge'));
      return;
    }
    setUploading(true);
    try {
      await upload(file);
    } catch (err) {
      toast.error(t('admin.children.avatarUploadFailed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start xl:flex-col xl:text-center">
        <div className="relative shrink-0">
          <img
            src={avatarUrl ?? placeholderSrc}
            alt=""
            className={cn('h-28 w-28 rounded-xl object-cover ring-4 ring-surface-container-lowest', uploading && 'opacity-40')}
            loading="lazy"
            decoding="async"
          />
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
            </span>
          ) : null}
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <Label htmlFor="child-avatar-input" className="text-base font-semibold text-on-surface">
              {t('admin.children.avatarLabel')}
            </Label>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{t('admin.children.avatarHint')}</p>
          </div>
          <input
            ref={inputRef}
            id="child-avatar-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>{uploading ? 'hourglass_top' : 'upload'}</span>
            {uploading ? t('common.loading') : t('admin.children.avatarChoose')}
          </Button>
        </div>
      </div>
    </section>
  );
}
