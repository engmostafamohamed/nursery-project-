import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeatures, useCreateFeature, useDeleteFeature } from '@/hooks/useFeatures';

const CATEGORY_OPTIONS = ['operations', 'finance', 'hr', 'comms', 'admissions', 'media', 'admin'];

export function AdminFeaturesPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const isXo = profile?.role === 'xo_super_admin';

  const features = useFeatures();
  const createFeat = useCreateFeature();
  const deleteFeat = useDeleteFeature();

  const [id, setId] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [category, setCategory] = useState<string>('operations');

  const handleCreate = async () => {
    if (!id || !nameEn || !nameAr) {
      toast.error('All fields are required');
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      toast.error('Key must be lowercase snake_case (e.g. daily_standup)');
      return;
    }
    try {
      await createFeat.mutateAsync({ id, name_en: nameEn, name_ar: nameAr, category });
      toast.success('Feature created');
      setId('');
      setNameEn('');
      setNameAr('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create feature');
    }
  };

  const handleDelete = async (featureId: string, isSeed: boolean) => {
    if (isSeed) {
      toast.error('Seed features cannot be deleted');
      return;
    }
    if (!(await confirm({ description: 'Delete this feature?', variant: 'danger' }))) return;
    try {
      await deleteFeat.mutateAsync(featureId);
      toast.success('Feature deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  if (!isXo) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Features</h1>
        <p className="text-sm text-error">Only Super Admin can manage features.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="extension" className="text-primary" size="text-2xl" />
          Features
        </h1>
        <p className="text-sm text-on-surface-variant">
          The catalogue of feature keys that roles can grant. Platform-wide. Adding a feature here
          doesn't expose it to anyone — you also need to tick it on at least one role.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
        <h2 className="text-sm font-semibold">Create new feature</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="feat-id">Key (snake_case, e.g. daily_standup)</Label>
            <Input id="feat-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="daily_standup" />
          </div>
          <div>
            <Label htmlFor="feat-cat">Category</Label>
            <Select id="feat-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="feat-name-en">Name (English)</Label>
            <Input id="feat-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Daily Standup" />
          </div>
          <div>
            <Label htmlFor="feat-name-ar">Name (Arabic)</Label>
            <Input id="feat-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="الاجتماع اليومي" />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={createFeat.isPending}>
          {createFeat.isPending ? 'Creating…' : 'Create feature'}
        </Button>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Existing features ({features.data?.length ?? 0})</h2>
        {features.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container">
                <tr className="text-left">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(features.data ?? []).map((f) => (
                  <tr key={f.id} className="border-t border-outline-variant">
                    <td className="px-3 py-2 font-medium">{lang === 'ar' ? f.name_ar : f.name_en}</td>
                    <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">{f.id}</td>
                    <td className="px-3 py-2">{f.category ?? '—'}</td>
                    <td className="px-3 py-2">
                      {f.is_seed ? (
                        <span className="rounded bg-info/10 px-2 py-0.5 text-xs text-info">Seed</span>
                      ) : (
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Custom</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!f.is_seed ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(f.id, f.is_seed)}>
                          <MaterialSymbol name="delete" size="text-base" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
