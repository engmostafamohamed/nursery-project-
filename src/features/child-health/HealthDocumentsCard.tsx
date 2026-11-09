import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { getSignedUrlForHealthDocument, useRequestHealthUpdate, useUploadChildHealthDocument } from '@/hooks/useParentHealthActions';
import { cn } from '@/lib/utils';

import { DOCUMENT_TYPES, documentIssue, NOTES_MAX, TEXT_MAX, type ChildHealthProfile } from './childHealth';
import { healthErrorKey } from './childHealthApi';
import { formatDay, sectionId } from './healthFormat';
import { EmptyNote, FormField, FormProblem, HealthCard } from './HealthUi';

/** The child's medical documents; parents upload new ones here and the nursery is told. */
export function HealthDocumentsCard({ profile }: { profile: ChildHealthProfile }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const upload = useUploadChildHealthDocument();
  const canUpload = profile.viewer === 'parent';
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const issue = documentIssue(name, file);
  const shown = tried || (file !== null && issue?.field === 'file') ? issue : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || !file) return;
    setProblem(null);
    try {
      await upload.mutateAsync({ childId: profile.child.id, nurseryId: profile.child.nurseryId, file, labelAr: name.trim(), labelEn: name.trim() });
      toast.success(t('health.parent.docUploadSuccess'));
      setName('');
      setFile(null);
      setTried(false);
      if (fileInput.current) fileInput.current.value = '';
    } catch (error) {
      setProblem(t(healthErrorKey(error)));
    }
  };

  const open = async (path: string) => {
    const url = await getSignedUrlForHealthDocument(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error(t('health.profile.documents.openFailed'));
  };

  return (
    <HealthCard id={sectionId('documents')} icon="folder_open" title={t('health.profile.sections.documents')} hint={t('health.profile.hints.documents')} count={profile.documents.length} tone="neutral">
      <div className="space-y-4">
        {profile.documents.length === 0 ? (
          <EmptyNote icon="description" text={t('health.empty.documents')} />
        ) : (
          <ul className="space-y-2" data-testid="health-documents">
            {profile.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-outline-variant p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-high text-on-surface-variant" aria-hidden>
                  <MaterialSymbol name={d.storagePath.endsWith('.pdf') ? 'picture_as_pdf' : 'image'} size="text-lg" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{(isArabic ? d.labelAr : d.labelEn) || d.labelAr || d.labelEn}</p>
                  <p className="text-xs text-on-surface-variant">{formatDay(d.createdAt, isArabic)}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void open(d.storagePath)}>
                  {t('health.parent.openDoc')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {canUpload ? (
          <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3 rounded-xl border border-dashed border-outline-variant p-3.5" data-testid="health-document-upload">
            <p className="text-sm font-semibold text-on-surface">{t('health.actions.uploadDocument')}</p>
            <FormField id="doc-name" label={t('health.profile.documents.name')} error={shown?.field === 'name' ? t(`health.profile.issues.${shown.issue}`, { max: TEXT_MAX }) : null}>
              <Input id="doc-name" value={name} placeholder={t('health.profile.placeholders.document')} onChange={(e) => setName(e.target.value)} className={cn(shown?.field === 'name' && invalidFieldClass)} />
            </FormField>
            <FormField
              id="doc-file"
              label={t('health.profile.documents.file')}
              hint={t('health.profile.documents.fileHint')}
              error={shown?.field === 'file' ? t(`health.profile.issues.${shown.issue}`) : null}
            >
              <Input
                id="doc-file"
                ref={fileInput}
                type="file"
                accept={DOCUMENT_TYPES.join(',')}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={cn('cursor-pointer text-sm', shown?.field === 'file' && invalidFieldClass)}
              />
            </FormField>
            <FormProblem message={problem} />
            <Button type="submit" disabled={upload.isPending}>
              <MaterialSymbol name="upload" size="text-base" className="me-1" />
              {upload.isPending ? t('health.profile.documents.uploading') : t('health.actions.uploadDocument')}
            </Button>
          </form>
        ) : null}
      </div>
    </HealthCard>
  );
}

/** Parents ask the nursery to change something on the record; the nursery's admins are told. */
export function ParentRequestCard({ profile }: { profile: ChildHealthProfile }) {
  const { t } = useTranslation();
  const request = useRequestHealthUpdate();
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const issue = !notes.trim() ? 'request_required' : notes.trim().length > NOTES_MAX ? 'too_long' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue) return;
    setProblem(null);
    try {
      await request.mutateAsync({ childId: profile.child.id, nurseryId: profile.child.nurseryId, notes: notes.trim() });
      setNotes('');
      setTried(false);
      setSent(true);
      toast.success(t('health.parent.requestSent'));
    } catch (error) {
      setProblem(t(healthErrorKey(error)));
    }
  };

  return (
    <HealthCard id={sectionId('request')} icon="edit_note" title={t('health.profile.request.title')} hint={t('health.profile.request.hint')} tone="primary">
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3" data-testid="health-request">
        <FormField id="request-notes" label={t('health.parent.requestNotesLabel')} error={tried && issue ? t(`health.profile.issues.${issue}`, { max: NOTES_MAX }) : null}>
          <Textarea
            id="request-notes"
            className={cn('min-h-24 text-sm', tried && issue && invalidFieldClass)}
            value={notes}
            placeholder={t('health.profile.request.placeholder')}
            onChange={(e) => {
              setNotes(e.target.value);
              setSent(false);
            }}
          />
        </FormField>
        <FormProblem message={problem} />
        {sent ? (
          <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
            <MaterialSymbol name="check_circle" size="text-base" />
            {t('health.parent.requestSent')}
          </p>
        ) : null}
        <Button type="submit" disabled={request.isPending}>
          <MaterialSymbol name="send" size="text-base" className="me-1 rtl:rotate-180" />
          {t('health.parent.requestSubmit')}
        </Button>
      </form>
    </HealthCard>
  );
}
