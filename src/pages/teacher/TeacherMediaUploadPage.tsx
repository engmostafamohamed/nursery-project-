import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MediaPreviewGrid } from '@/components/teacher/MediaPreviewGrid';
import { MediaUploadZone } from '@/components/teacher/MediaUploadZone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { MEDIA_ACTIVITY_KEYS } from '@/constants/mediaActivities';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { MAX_FILES_PER_BATCH, validateMediaFile } from '@/lib/mediaStorage';
import { useUserProfile } from '@/hooks/useUserProfile';

export function TeacherMediaUploadPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const upload = useMediaUpload({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined });

  const [files, setFiles] = useState<File[]>([]);
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [activityType, setActivityType] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'all_class' | 'tagged_only'>('all_class');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [customActivity, setCustomActivity] = useState('');

  const filteredChildren = useMemo(
    () => upload.children.filter((child) => !classId || child.class_id === classId),
    [classId, upload.children],
  );
  const restrictedTaggedCount = useMemo(
    () => filteredChildren.filter((child) => childIds.includes(child.id) && child.photo_privacy_restricted).length,
    [childIds, filteredChildren],
  );

  const addFiles = (nextFiles: File[]) => {
    const combined = [...files, ...nextFiles].slice(0, MAX_FILES_PER_BATCH);
    const invalid = combined.map(validateMediaFile).find((r) => !r.ok);
    if (invalid) {
      toast.error(t(invalid.message ?? 'media.validation.invalidType'));
      return;
    }
    setFiles(combined);
  };

  const onUpload = async () => {
    if (!files.length) {
      toast.error(t('media.upload.validation.filesRequired'));
      return;
    }
    if (!classId) {
      toast.error(t('media.upload.validation.classRequired'));
      return;
    }
    if (visibility === 'tagged_only' && childIds.length === 0) {
      toast.error(t('media.upload.validation.taggedChildrenRequired'));
      return;
    }
    if (restrictedTaggedCount > 0 && !consentConfirmed) {
      toast.error(t('media.upload.validation.consentRequired'));
      return;
    }
    try {
      await upload.uploadBatch({
        files,
        metadata: {
          capturedAt,
          classId,
          childIds,
          activityType: activityType === 'custom' ? customActivity.trim() || null : activityType || null,
          caption: caption.slice(0, 500),
          visibility,
          consentConfirmed,
        },
      });
      toast.success(t('media.upload.success'));
      navigate(`/teacher/media${qs}`);
    } catch {
      toast.error(t('media.upload.error'));
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-none space-y-4 pb-28">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
        <MaterialSymbol name="add_photo_alternate" className="text-primary" size="text-2xl" />
        {t('media.upload.title')}
      </h1>

      <MediaUploadZone onFilesSelected={addFiles} />
      <MediaPreviewGrid files={files} progressByFile={upload.progressByFile} onRemove={(idx) => setFiles(files.filter((_, i) => i !== idx))} />

      <section className="space-y-3 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('media.upload.capturedAt')}</Label>
            <Input type="date" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('media.upload.class')}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">{t('media.upload.selectClass')}</option>
              {upload.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {i18n.language === 'ar' ? c.name_ar : c.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('media.upload.childrenTags')}</Label>
          <div className="max-h-36 overflow-auto rounded-lg border border-outline-variant p-2">
            {filteredChildren.map((child) => (
              <label key={child.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={childIds.includes(child.id)}
                  onChange={(e) =>
                    setChildIds(e.target.checked ? [...childIds, child.id] : childIds.filter((id) => id !== child.id))
                  }
                />
                <span>{i18n.language === 'ar' ? child.full_name_ar : child.full_name_en}</span>
              </label>
            ))}
          </div>
        </div>

        {restrictedTaggedCount > 0 ? (
          <div className="flex gap-2 rounded-lg border border-error/40 bg-error-container p-3 text-sm text-on-surface">
            <MaterialSymbol name="warning" className="shrink-0 text-error" />
            <div>
              <p>{t('media.upload.privacyWarning', { count: restrictedTaggedCount })}</p>
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} />
                {t('media.upload.confirmConsent')}
              </label>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('media.upload.activity')}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              <option value="">{t('media.upload.optional')}</option>
              {MEDIA_ACTIVITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`media.activity.${k}`)}
                </option>
              ))}
            </select>
          </div>
          {activityType === 'custom' ? (
            <div className="space-y-2">
              <Label>{t('media.activity.custom')}</Label>
              <Input value={customActivity} onChange={(e) => setCustomActivity(e.target.value)} />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{t('media.upload.caption')}</Label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm"
            maxLength={500}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('media.upload.visibility')}</Label>
          <div className="space-y-1 text-sm">
            {(['all_class', 'tagged_only'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
                {t(`media.visibility.${v}`)}
              </label>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{t('media.upload.visibilityHint')}</p>
          {visibility === 'tagged_only' ? <p className="text-xs text-on-surface-variant">{t('media.upload.taggedOnlyHint')}</p> : null}
        </div>
      </section>

      <Button className="w-full gap-2" onClick={() => void onUpload()} disabled={upload.isUploading}>
        <MaterialSymbol name="cloud_upload" size="text-lg" />
        {t('media.upload.submit')}
      </Button>
    </div>
  );
}
