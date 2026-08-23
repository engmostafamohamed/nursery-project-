import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedTable = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export async function parseImportFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = (parsed.data ?? []).map((row: Record<string, string>) => {
      const obj: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => {
        obj[normalizeHeader(k)] = String(v ?? '').trim();
      });
      return obj;
    });
    const headers = Object.keys(rows[0] ?? {});
    return { headers, rows };
  }

  if (name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const first = wb.SheetNames[0];
    const ws = wb.Sheets[first];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const rows = json.map((r) => {
      const obj: Record<string, string> = {};
      Object.entries(r).forEach(([k, v]) => {
        obj[normalizeHeader(k)] = String(v ?? '').trim();
      });
      return obj;
    });
    return { headers: Object.keys(rows[0] ?? {}), rows };
  }

  throw new Error('Unsupported file type');
}

export function createImportTemplateCsv() {
  return [
    'parent_name,parent_email,parent_phone,child_name,child_dob,child_gender,class_name,medical_conditions,allergies,address',
    'Sara Ali,sara@example.com,+201012345678,Adam Ali,2021-05-10,male,KG1,None,Peanuts,Nasr City Cairo',
  ].join('\n');
}
