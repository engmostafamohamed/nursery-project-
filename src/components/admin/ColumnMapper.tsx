import type { FieldMapping } from '@/hooks/useBulkImport';

type Props = {
  headers: string[];
  mapping: FieldMapping;
  onChange: (next: FieldMapping) => void;
};

const fields: Array<keyof FieldMapping> = [
  'parent_name',
  'parent_email',
  'parent_phone',
  'child_name',
  'child_dob',
  'child_gender',
  'class_name',
  'medical_conditions',
  'allergies',
  'address',
];

export function ColumnMapper({ headers, mapping, onChange }: Props) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {fields.map((f) => (
        <label key={f} className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-xs">
          <span>{f}</span>
          <select
            className="h-8 rounded border border-outline-variant px-2"
            value={mapping[f]}
            onChange={(e) => onChange({ ...mapping, [f]: e.target.value })}
          >
            <option value="">--</option>
            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
