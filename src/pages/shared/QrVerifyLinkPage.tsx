import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * Every attendance QR code holds a link to this page. Staff who open it (from a phone's own
 * camera app, or a link sent to them) go on to the scanner, which checks the code exactly as
 * if it had been scanned there. A parent who opens it is told what the link is for.
 */
export function QrVerifyLinkPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  // ProtectedRoute has already signed the user in and loaded this profile.
  if (!profile) return <PageSkeleton />;

  const isParent = profile.role === 'parent';
  if (token && !isParent) {
    const scanner = profile.role === 'teacher' ? '/teacher/scanner' : '/admin/scanner';
    return <Navigate to={`${scanner}?token=${encodeURIComponent(token)}`} replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-16">
      <section className="w-full rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MaterialSymbol name={token ? 'qr_code_2' : 'link_off'} size="text-3xl" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-on-surface">
          {t(token ? 'qr.linkPage.title' : 'qr.linkPage.missingTitle')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          {t(token ? 'qr.linkPage.parentBody' : 'qr.linkPage.missingBody')}
        </p>
        <Button asChild className="mt-6">
          <Link to={isParent ? '/parent/qr-code' : '/'}>{t(isParent ? 'qr.linkPage.openMyCodes' : 'errors.goHome')}</Link>
        </Button>
      </section>
    </div>
  );
}
