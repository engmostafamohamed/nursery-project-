import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

interface ColumnMapping {
  excelColumn: string;
  dbTable: string;
  dbColumn: string;
  confidence: number;
  transformLogic?: string;
}

interface ImportJob {
  id: string;
  file_name: string;
  total_rows: number;
  ai_detected_format: {
    mappings: ColumnMapping[];
    warnings: string[];
    suggestions: string[];
  };
  ai_confidence_score: number;
}

export function AdminImportReviewPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadImportJob();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const loadImportJob = async () => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      setJob(data as ImportJob);
    } catch (err) {
      console.error('Failed to load import job:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 95) {
      return <Badge className="bg-success/10 text-success border-success/20">✓ {confidence}%</Badge>;
    } else if (confidence >= 80) {
      return <Badge className="bg-warning/10 text-warning border-warning/20">⚠ {confidence}%</Badge>;
    } else {
      return <Badge className="bg-error/10 text-error border-error/20">✗ {confidence}%</Badge>;
    }
  };

  const handleConfirmImport = async () => {
    if (!job) return;

    setConfirming(true);
    try {
      if (!jobId) throw new Error('Missing import job id');

      await (supabase as any)
        .from('import_jobs')
        .update({
          user_confirmed_mapping: {
            mappings: job.ai_detected_format.mappings,
            confirmedAt: new Date().toISOString(),
          },
        })
        .eq('id', jobId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ importJobId: jobId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      navigate(`/admin/import/progress/${jobId}`);

    } catch (err) {
      console.error('Import confirmation error:', err);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8 text-center">
          <p className="text-foreground-secondary">Import job not found</p>
        </Card>
      </div>
    );
  }

  const mappings = job.ai_detected_format.mappings;
  const warnings = job.ai_detected_format.warnings;
  const needsReview = mappings.filter(m => m.confidence < 90).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Review AI Mapping
        </h1>
        <p className="text-foreground-secondary">
          AI detected {mappings.length} columns from &quot;{job.file_name}&quot;.
          Review mappings below before importing.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-foreground-secondary mb-1">Total Rows</p>
          <p className="text-2xl font-bold text-foreground">{job.total_rows}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-foreground-secondary mb-1">Columns Mapped</p>
          <p className="text-2xl font-bold text-success">{mappings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-foreground-secondary mb-1">Needs Review</p>
          <p className="text-2xl font-bold text-warning">{needsReview}</p>
        </Card>
      </div>

      {warnings.length > 0 && (
        <Card className="p-4 mb-6 bg-warning/10 border-warning/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning mb-2">Warnings:</p>
              <ul className="text-sm text-warning space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-high border-b border-border-default">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                  Excel Column
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-foreground">
                  →
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                  Database Field
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {mappings.map((mapping, idx) => (
                <tr key={idx} className="hover:bg-surface-low transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground">
                    {mapping.excelColumn}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground-tertiary text-center">
                    →
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-mono text-primary">
                        {mapping.dbTable}.{mapping.dbColumn}
                      </p>
                      {mapping.transformLogic && (
                        <p className="text-xs text-foreground-tertiary mt-1">
                          Transform: {mapping.transformLogic}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {getConfidenceBadge(mapping.confidence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={() => navigate('/admin/import')}>
          Cancel
        </Button>
        <Button onClick={handleConfirmImport} disabled={confirming}>
          {confirming ? 'Starting Import...' : `Confirm & Import (${job.total_rows} rows)`}
        </Button>
      </div>
    </div>
  );
}
