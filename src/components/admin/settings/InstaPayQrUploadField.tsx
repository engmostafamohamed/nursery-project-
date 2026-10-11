import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';

type Props = {
  value: string;
  onChange: (url: string) => void;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function InstaPayQrUploadField({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadQrImage = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t('settings.fields.instapay_qr_image_url.invalidType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t('settings.fields.instapay_qr_image_url.tooLarge'));
      return;
    }
    if (!user?.id) {
      toast.error(t('settings.fields.instapay_qr_image_url.uploadFailed'));
      return;
    }

    setUploading(true);
    try {
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
      const path = `${user.id}/payment-qr/instapay-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from('nursery-logos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;

      const { data } = supabase.storage.from('nursery-logos').getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success(t('settings.fields.instapay_qr_image_url.uploaded'));
    } catch (error) {
      toast.error(t('settings.fields.instapay_qr_image_url.uploadFailed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={t('settings.fields.instapay_qr_image_url.label')}
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadQrImage(file);
          }}
        />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <MaterialSymbol name={uploading ? 'progress_activity' : 'upload'} className={uploading ? 'animate-spin' : undefined} size="text-base" />
          {uploading
            ? t('settings.fields.instapay_qr_image_url.uploading')
            : t(value ? 'settings.fields.instapay_qr_image_url.replace' : 'settings.fields.instapay_qr_image_url.upload')}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" disabled={uploading} onClick={() => onChange('')}>
            {t('settings.fields.instapay_qr_image_url.remove')}
          </Button>
        ) : null}
      </div>
      {value ? (
        <img
          src={value}
          alt={t('settings.fields.instapay_qr_image_url.previewAlt')}
          className="h-40 w-40 rounded-xl border border-outline-variant bg-white object-contain p-2"
        />
      ) : null}
      <p className="text-xs text-on-surface-variant">{t('settings.fields.instapay_qr_image_url.helper')}</p>
    </div>
  );
}
