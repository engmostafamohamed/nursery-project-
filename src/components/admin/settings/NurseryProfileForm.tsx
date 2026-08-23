import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNurseryDetail, useUpdateNursery, useUploadNurseryLogo } from '@/hooks/useNurseryDetail';

type Props = {
  nurseryId: string;
};

type NurseryProfileDraft = {
  name_ar: string;
  name_en: string;
  city: string;
  phone: string;
  address_ar: string;
  address_en: string;
  about_ar: string;
  about_en: string;
  website_url: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
};

const EMPTY_DRAFT: NurseryProfileDraft = {
  name_ar: '',
  name_en: '',
  city: '',
  phone: '',
  address_ar: '',
  address_en: '',
  about_ar: '',
  about_en: '',
  website_url: '',
  facebook_url: '',
  instagram_url: '',
  tiktok_url: '',
};

function isValidUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function NurseryProfileForm({ nurseryId }: Props) {
  const { t } = useTranslation();
  const { data: nursery, isLoading } = useNurseryDetail(nurseryId);
  const updateNursery = useUpdateNursery();
  const uploadLogo = useUploadNurseryLogo();
  const [draft, setDraft] = useState<NurseryProfileDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!nursery) return;
    setDraft({
      name_ar: nursery.name_ar ?? '',
      name_en: nursery.name_en ?? '',
      city: nursery.city ?? '',
      phone: nursery.phone ?? '',
      address_ar: typeof nursery.address_ar === 'string' ? nursery.address_ar : '',
      address_en: typeof nursery.address_en === 'string' ? nursery.address_en : '',
      about_ar: typeof nursery.about_ar === 'string' ? nursery.about_ar : '',
      about_en: typeof nursery.about_en === 'string' ? nursery.about_en : '',
      website_url: typeof nursery.website_url === 'string' ? nursery.website_url : '',
      facebook_url: typeof nursery.facebook_url === 'string' ? nursery.facebook_url : '',
      instagram_url: typeof nursery.instagram_url === 'string' ? nursery.instagram_url : '',
      tiktok_url: typeof nursery.tiktok_url === 'string' ? nursery.tiktok_url : '',
    });
  }, [nursery]);

  const isBusy = updateNursery.isPending || uploadLogo.isPending;
  const logoUrl = nursery?.logo_url ?? '';
  const hasInvalidLinks = useMemo(
    () =>
      !isValidUrl(draft.website_url) ||
      !isValidUrl(draft.facebook_url) ||
      !isValidUrl(draft.instagram_url) ||
      !isValidUrl(draft.tiktok_url),
    [draft],
  );

  const onSave = async () => {
    if (hasInvalidLinks) {
      toast.error(t('settings.profile.messages.invalidUrl'));
      return;
    }
    try {
      await updateNursery.mutateAsync({
        id: nurseryId,
        updates: {
          name_ar: draft.name_ar.trim(),
          name_en: draft.name_en.trim(),
          city: draft.city.trim() || null,
          phone: draft.phone.trim() || null,
          address_ar: draft.address_ar.trim() || null,
          address_en: draft.address_en.trim() || null,
          about_ar: draft.about_ar.trim() || null,
          about_en: draft.about_en.trim() || null,
          website_url: draft.website_url.trim() || null,
          facebook_url: draft.facebook_url.trim() || null,
          instagram_url: draft.instagram_url.trim() || null,
          tiktok_url: draft.tiktok_url.trim() || null,
        },
      });
      toast.success(t('settings.profile.messages.saved'));
    } catch {
      toast.error(t('settings.profile.messages.saveError'));
    }
  };

  const onLogoChange = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.profile.messages.logoTypeError'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('settings.profile.messages.logoSizeError'));
      return;
    }

    try {
      await uploadLogo.mutateAsync({ nurseryId, file });
      toast.success(t('settings.profile.messages.logoSaved'));
    } catch {
      toast.error(t('settings.profile.messages.saveError'));
    }
  };

  if (isLoading) {
    return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div>
        <h2 className="text-base font-semibold text-on-surface">{t('settings.profile.title')}</h2>
        <p className="text-xs text-on-surface-variant">{t('settings.profile.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
        <div className="space-y-2">
          <Label>{t('settings.profile.logo')}</Label>
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-outline-variant bg-surface">
            {logoUrl ? (
              <img src={logoUrl} alt={t('settings.profile.logoAlt')} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-on-surface-variant">{t('settings.profile.noLogo')}</span>
            )}
          </div>
          <Input
            type="file"
            accept="image/*"
            disabled={isBusy}
            onChange={(e) => {
              void onLogoChange(e.target.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('settings.profile.nameAr')}</Label>
            <Input value={draft.name_ar} onChange={(e) => setDraft((p) => ({ ...p, name_ar: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profile.nameEn')}</Label>
            <Input value={draft.name_en} onChange={(e) => setDraft((p) => ({ ...p, name_en: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profile.city')}</Label>
            <Input value={draft.city} onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profile.phone')}</Label>
            <Input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profile.addressAr')}</Label>
            <Input value={draft.address_ar} onChange={(e) => setDraft((p) => ({ ...p, address_ar: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profile.addressEn')}</Label>
            <Input value={draft.address_en} onChange={(e) => setDraft((p) => ({ ...p, address_en: e.target.value }))} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('settings.profile.aboutAr')}</Label>
            <Textarea
              rows={3}
              value={draft.about_ar}
              onChange={(e) => setDraft((p) => ({ ...p, about_ar: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('settings.profile.aboutEn')}</Label>
            <Textarea
              rows={3}
              value={draft.about_en}
              onChange={(e) => setDraft((p) => ({ ...p, about_en: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('settings.profile.website')}</Label>
          <Input
            placeholder="https://"
            value={draft.website_url}
            onChange={(e) => setDraft((p) => ({ ...p, website_url: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.profile.facebook')}</Label>
          <Input
            placeholder="https://facebook.com/..."
            value={draft.facebook_url}
            onChange={(e) => setDraft((p) => ({ ...p, facebook_url: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.profile.instagram')}</Label>
          <Input
            placeholder="https://instagram.com/..."
            value={draft.instagram_url}
            onChange={(e) => setDraft((p) => ({ ...p, instagram_url: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.profile.tiktok')}</Label>
          <Input
            placeholder="https://tiktok.com/@..."
            value={draft.tiktok_url}
            onChange={(e) => setDraft((p) => ({ ...p, tiktok_url: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={isBusy || hasInvalidLinks} onClick={() => void onSave()}>
          {isBusy ? t('common.loading') : t('settings.profile.save')}
        </Button>
      </div>
    </section>
  );
}

