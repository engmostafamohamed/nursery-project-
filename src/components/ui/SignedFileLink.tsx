import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * A link to a private file (a payment proof, a partner proof), signed for a few minutes when it
 * shows. A full address, or a file the app itself serves (/…), opens as it is; a file that cannot be
 * opened says so in place.
 */
export function SignedFileLink({ bucket, path, label, className }: { bucket: string; path: string; label: string; className?: string }) {
  const { t } = useTranslation();
  const direct = path.startsWith('http') || path.startsWith('/');
  const [signed, setSigned] = useState<{ path: string; href: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (direct) return;
    let active = true;
    void supabase.storage.from(bucket).createSignedUrl(path, 10 * 60).then(({ data, error }) => {
      if (active) setSigned({ path, href: data?.signedUrl ?? null, failed: Boolean(error) || !data?.signedUrl });
    });
    return () => {
      active = false;
    };
  }, [bucket, direct, path]);

  const href = direct ? path : signed?.path === path ? signed.href : null;
  const failed = !direct && signed?.path === path && signed.failed;

  if (failed) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-error', className)}>
        <MaterialSymbol name="error" size="text-sm" />
        {t('common.fileUnavailable')}
      </span>
    );
  }
  if (!href) {
    return <span className={cn('inline-flex items-center gap-1 text-xs text-on-surface-variant', className)}>{t('common.loading')}</span>;
  }
  return (
    <a
      className={cn('inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline', className)}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <MaterialSymbol name="attach_file" size="text-sm" />
      {label}
    </a>
  );
}
