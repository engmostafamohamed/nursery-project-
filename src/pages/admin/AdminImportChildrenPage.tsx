import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export function AdminImportChildrenPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];

    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Invalid file type. Please upload .xlsx, .xls, or .csv files only.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setFile(selectedFile);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData.length) {
        throw new Error('Excel file is empty');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-import-mapper`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            fileData: jsonData,
            fileName: file.name,
          }),
        }
      );

      if (!response.ok) {
        const responseText = await response.text();
        let errorData: { error?: string } = {};
        try {
          errorData = JSON.parse(responseText) as { error?: string };
        } catch {
          errorData = { error: responseText || 'Failed to process file' };
        }
        throw new Error(errorData.error || 'Failed to process file');
      }

      const result = await response.json();
      navigate(`/admin/import/review/${result.importJobId}`);

    } catch (err: unknown) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('admin.import.title', 'Import Children from Excel')}
        </h1>
        <p className="text-foreground-secondary">
          {t('admin.import.subtitle', 'Upload standard Egyptian nursery enrollment Excel file')}
        </p>
      </div>

      <Card className="p-8">
        <div className="mb-6">
          <label
            htmlFor="file-upload"
            className={`
              relative block border-2 border-dashed rounded-xl p-12 
              text-center cursor-pointer transition-colors
              ${file
                ? 'border-primary bg-primary/5'
                : 'border-border-default bg-surface hover:bg-surface-high hover:border-primary/50'
              }
            `}
          >
            <input
              id="file-upload"
              type="file"
              className="sr-only"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={uploading}
            />

            <div className="flex flex-col items-center gap-4">
              {file ? (
                <>
                  <FileSpreadsheet className="h-12 w-12 text-primary" />
                  <div>
                    <p className="text-lg font-medium text-foreground">{file.name}</p>
                    <p className="text-sm text-foreground-secondary mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-foreground-tertiary" />
                  <div>
                    <p className="text-lg font-medium text-foreground">
                      Drag Excel file here or click to browse
                    </p>
                    <p className="text-sm text-foreground-secondary mt-2">
                      Supports: .xlsx, .xls, .csv (Max 10MB)
                    </p>
                  </div>
                </>
              )}
            </div>
          </label>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/40 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        <div className="mb-6 p-4 rounded-lg bg-info/10 border border-info/40">
          <p className="text-sm text-info">
            ℹ️ <strong>Tip:</strong> This feature uses AI to automatically map your Excel columns
            to our database. The standard Egyptian nursery enrollment format (64 columns)
            is fully supported.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/children')}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="min-w-[120px]"
          >
            {uploading ? 'Processing...' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
