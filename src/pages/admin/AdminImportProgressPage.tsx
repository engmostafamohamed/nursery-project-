import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

interface ImportJob {
  id: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  error_log?: Array<{ row: number; message: string }>;
  file_name: string;
}

export function AdminImportProgressPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [progress, setProgress] = useState(0);

  const loadJobStatus = useCallback(async () => {
    if (!jobId) return;

    const { data } = await (supabase as any)
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (data) {
      setJob(data as ImportJob);
      const percent = data.total_rows > 0
        ? Math.round((data.processed_rows / data.total_rows) * 100)
        : 0;
      setProgress(percent);
    }
  }, [jobId]);

  useEffect(() => {
    loadJobStatus();
    const interval = setInterval(loadJobStatus, 1000);
    return () => clearInterval(interval);
  }, [loadJobStatus]);

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isComplete = job.status === 'completed';
  const hasFailed = job.status === 'failed';
  const isImporting = job.status === 'importing';

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="p-8">
        <div className="text-center mb-8">
          {isComplete ? (
            <>
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">Import Complete!</h1>
              <p className="text-foreground-secondary mt-2">
                Successfully imported from &quot;{job.file_name}&quot;
              </p>
            </>
          ) : hasFailed ? (
            <>
              <XCircle className="h-16 w-16 text-error mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">Import Failed</h1>
            </>
          ) : (
            <>
              <div className="h-16 w-16 mx-auto mb-4 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <h1 className="text-2xl font-bold text-foreground">
                Importing {job.total_rows} children...
              </h1>
            </>
          )}
        </div>

        {isImporting && (
          <div className="mb-8">
            <div className="w-full h-3 bg-surface-low rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-foreground-secondary">
              <span>Processing row {job.processed_rows} of {job.total_rows}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center p-4 rounded-lg bg-success/10">
            <p className="text-3xl font-bold text-success">{job.successful_rows}</p>
            <p className="text-sm text-foreground-secondary mt-1">Successful</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-error/10">
            <p className="text-3xl font-bold text-error">{job.failed_rows}</p>
            <p className="text-sm text-foreground-secondary mt-1">Failed</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-surface-high">
            <p className="text-3xl font-bold text-foreground">{job.processed_rows}</p>
            <p className="text-sm text-foreground-secondary mt-1">Processed</p>
          </div>
        </div>

        {job.error_log && job.error_log.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/40 max-h-64 overflow-y-auto">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-error shrink-0" />
              <p className="font-medium text-error">Errors:</p>
            </div>
            <ul className="text-sm text-error space-y-2">
              {job.error_log.map((err, i) => (
                <li key={i}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          {isComplete && (
            <>
              <Button onClick={() => navigate('/admin/children')}>
                View Children
              </Button>
              <Button variant="ghost" onClick={() => navigate('/admin/import')}>
                Import More
              </Button>
            </>
          )}
          {hasFailed && (
            <Button onClick={() => navigate('/admin/import')}>
              Try Again
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
