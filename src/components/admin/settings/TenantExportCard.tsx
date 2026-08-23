import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenantExports } from '@/hooks/useTenantExports';

type TenantExportCardProps = {
  enabled: boolean;
};

export function TenantExportCard({ enabled }: TenantExportCardProps) {
  const { t, i18n } = useTranslation();
  const { jobs, isLoading, isRequestingExport, requestExport, refetch, isRefreshing } = useTenantExports(enabled);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short', hour12: true,
      }),
    [i18n.language],
  );

  const onRequest = async () => {
    try {
      await requestExport();
      toast.success(t('tenantExport.messages.requested'));
    } catch {
      toast.error(t('tenantExport.messages.requestError'));
    }
  };

  return (
    <Card className="border border-outline-variant bg-surface-container-lowest">
      <CardHeader className="space-y-2">
        <CardTitle>{t('tenantExport.title')}</CardTitle>
        <CardDescription>{t('tenantExport.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onRequest()} disabled={!enabled || isRequestingExport}>
            {isRequestingExport ? t('tenantExport.actions.requesting') : t('tenantExport.actions.request')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void refetch()} disabled={isRefreshing || !enabled}>
            {t('tenantExport.actions.refresh')}
          </Button>
        </div>

        {isLoading ? <p className="text-sm text-on-surface-variant">{t('common.loading')}</p> : null}
        {!isLoading && jobs.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('tenantExport.empty')}</p>
        ) : null}

        {jobs.length > 0 ? (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-md border border-outline-variant p-3 text-sm">
                <p className="font-medium text-on-surface">
                  {t('tenantExport.statusLabel')} {t(`tenantExport.status.${job.status}`)}
                </p>
                <p className="text-on-surface-variant">
                  {t('tenantExport.createdAt')} {dateFormatter.format(new Date(job.created_at))}
                </p>
                {job.error_message ? <p className="text-error">{job.error_message}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
