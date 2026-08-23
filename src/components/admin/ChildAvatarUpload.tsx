import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';

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

  const placeholderSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullNameForPlaceholder)}&background=eceef0&color=191c1e`;

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

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <img
        src={avatarUrl ?? placeholderSrc}
        alt=""
        className="h-24 w-24 rounded-full object-cover ring-2 ring-outline-variant"
        loading="lazy"
        decoding="async"
      />
      <div className="space-y-2">
        <Label htmlFor="child-avatar-input">{t('admin.children.avatarLabel')}</Label>
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
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {t('admin.children.avatarChoose')}
        </Button>
        <p className="text-xs text-on-surface-variant">{t('admin.children.avatarHint')}</p>
      </div>
    </div>
  );
}
