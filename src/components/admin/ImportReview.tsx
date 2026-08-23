import { useTranslation } from 'react-i18next';

type Props = {
  validCount: number;
  invalidRows: Array<{ row: Record<string, string>; errors: string[] }>;
};

export function ImportReview({ validCount, invalidRows }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">{t('import.validRows')}: <strong>{validCount}</strong></div>
        <div className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">{t('import.invalidRows')}: <strong>{invalidRows.length}</strong></div>
      </div>
      {!!invalidRows.length && (
        <div className="overflow-x-auto rounded-lg border border-outline-variant">
          <table className="w-full min-w-[700px] text-xs">
            <thead><tr className="bg-surface-container text-on-surface-variant"><th className="px-2 py-2 text-start">{t('import.parentEmail')}</th><th className="px-2 py-2 text-start">{t('import.childName')}</th><th className="px-2 py-2 text-start">{t('import.errors')}</th></tr></thead>
            <tbody>
              {invalidRows.slice(0, 20).map((r, i) => (
                <tr key={`${r.row.parent_email}-${i}`} className="border-t border-outline-variant">
                  <td className="px-2 py-2">{r.row.parent_email}</td>
                  <td className="px-2 py-2">{r.row.child_name}</td>
                  <td className="px-2 py-2">{r.errors.map((e) => t(`import.validation.${e}`)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
