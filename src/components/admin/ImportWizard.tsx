import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ColumnMapper } from '@/components/admin/ColumnMapper';
import { ImportReview } from '@/components/admin/ImportReview';
import { Button } from '@/components/ui/button';
import { useBulkImport } from '@/hooks/useBulkImport';

type Props = {
  nurseryId: string;
  importedBy?: string;
};

export function ImportWizard({ nurseryId, importedBy }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [result, setResult] = useState<{ childrenCreated: number; parentsCreated: number; skipped: number; reportCsv: string } | null>(null);
  const importer = useBulkImport(nurseryId, importedBy);

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="grid grid-cols-3 gap-2">
        {([1, 2, 3] as const).map((s) => <div key={s} className={`rounded-lg px-2 py-1 text-center text-xs ${step >= s ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}>{t(`import.steps.${s}`)}</div>)}
      </div>

      {step === 1 ? (
        <div className="space-y-2">
          <input type="file" accept=".csv,.xlsx" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void importer.parseFile(file).then(() => {
              toast.success(t('import.fileParsed'));
              setStep(2);
            });
          }} />
          <Button
            variant="outline"
            onClick={() => {
              const blob = new Blob([importer.templateCsv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'xo-bulk-import-template.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('import.downloadTemplate')}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <ColumnMapper headers={importer.headers} mapping={importer.mapping} onChange={importer.setMapping} />
          <Button onClick={() => setStep(3)}>{t('common.next')}</Button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <ImportReview validCount={importer.validation.validRows.length} invalidRows={importer.validation.invalidRows} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>{t('common.previous')}</Button>
            <Button
              onClick={() => void importer.importRows({ skipInvalid: true }).then((res) => {
                setResult(res);
                toast.success(t('import.importDone'));
              })}
            >
              {t('import.importValidOnly')}
            </Button>
          </div>
          {result ? (
            <div className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">
              <p>{t('import.childrenImported')}: {result.childrenCreated}</p>
              <p>{t('import.parentsCreated')}: {result.parentsCreated}</p>
              <p>{t('import.rowsSkipped')}: {result.skipped}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob([result.reportCsv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `import-report-${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t('import.downloadReport')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
