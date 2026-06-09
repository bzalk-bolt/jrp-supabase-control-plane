import { useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  ExternalLink, ChevronDown, Play,
} from 'lucide-react';
import { syncApi, settingsService } from '../services';
import type { LocalEnvironment, LocalEnvironmentBinding, Job } from '../types/api';

interface Props {
  env: LocalEnvironment;
  binding: LocalEnvironmentBinding;
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export default function SyncOperationsPanel({ env, binding }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'succeeded' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const envName = `${env.name || env.apex_domain}-main`;

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function handlePullLatest() {
    setShowConfirm(false);
    setStatus('starting');
    setError('');
    setJob(null);
    setShowOutput(false);

    try {
      // Ensure Supabase PAT is loaded into cache if not already
      if (!syncApi.getSupabaseAccessTokenCache()) {
        try {
          const info = await settingsService.getSupabaseAccessToken();
          if (info.token) {
            syncApi.setSupabaseAccessTokenCache(info.token);
          }
        } catch {
          // non-fatal; proceed anyway
        }
      }

      // Ensure environment exists on local sync-api
      try {
        await syncApi.createEnvironmentFor({
          name: envName,
          source_env: 'production',
          target_env: 'local',
          source_project_ref: binding.remote_project_ref,
          source_project_name: '',
          source_organization_name: binding.remote_organization_name || '',
          target_container: 'supabase-db',
          sync_storage_buckets: true,
        }, env.id);
      } catch (envErr: unknown) {
        const msg = envErr instanceof Error ? envErr.message : '';
        if (!msg.toLowerCase().includes('already exists') && !msg.includes('409')) {
          throw envErr;
        }
      }

      const newJob = await syncApi.resetDestination(
        envName,
        { confirm: 'RESET DESTINATION', reset_database: true },
        env.id,
      );

      setJob(newJob);
      setStatus('running');

      pollRef.current = setInterval(async () => {
        try {
          const updated = await syncApi.getJob(newJob.id, env.id);
          setJob(updated);
          if (updated.status === 'succeeded') {
            stopPolling();
            setStatus('succeeded');
          } else if (updated.status === 'failed') {
            stopPolling();
            setStatus('failed');
            setError(updated.output || 'Job failed');
          }
        } catch {
          // transient polling error
        }
      }, 4000);
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'Failed to start sync');
    }
  }

  const modeLabel = binding.database_mode === 'schema-and-data' ? 'schema + data' : 'schema';

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <RefreshCw className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-1">
          Sync Operations
        </h2>
        <span className="text-xs text-gray-500 font-mono mr-2">
          {job?.finished_at_ms ? new Date(job.finished_at_ms).toLocaleDateString() : 'never synced'}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Action buttons */}
          <div className="flex items-center justify-end">
            {status === 'idle' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Pull Latest
              </button>
            )}
            {status === 'succeeded' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Pull Again
              </button>
            )}
            {status === 'failed' && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>

          {/* Status content */}
          <div>
        {status === 'idle' && (
          <div className="text-sm text-gray-400">
            No sync has been run yet. Click "Pull Latest" to import {modeLabel} from the remote project.
          </div>
        )}

        {(status === 'starting' || status === 'running') && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-200">
                  {status === 'starting' ? 'Starting sync job...' : 'Pulling from remote...'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Importing {modeLabel} from the hosted project into your local environment.
                </p>
              </div>
            </div>
            {job?.progress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{job.progress.message || job.progress.phase}</span>
                  <span className="text-gray-500">{Math.round(job.progress.percent)}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${job.progress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'succeeded' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-300">Sync completed</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Successfully pulled {modeLabel} from the remote project.
                </p>
              </div>
            </div>
            {job?.output && (
              <OutputSection output={job.output} expanded={showOutput} onToggle={() => setShowOutput(e => !e)} />
            )}
          </div>
        )}

        {status === 'failed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-300">Sync failed</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  The import job encountered an error. Check the output for details.
                </p>
              </div>
            </div>
            {(error || job?.output) && (
              <OutputSection output={job?.output || error} expanded={true} onToggle={() => setShowOutput(e => !e)} />
            )}
          </div>
        )}

        {job && (status === 'succeeded' || status === 'failed') && (
          <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500">
            <span>Job: <span className="font-mono text-gray-400">{job.id.slice(0, 8)}</span></span>
            {job.started_at_ms && (
              <span>Started: {new Date(job.started_at_ms).toLocaleTimeString()}</span>
            )}
            {job.finished_at_ms && (
              <span>Finished: {new Date(job.finished_at_ms).toLocaleTimeString()}</span>
            )}
          </div>
        )}
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">Pull Latest from Remote</h3>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              This will overwrite the local database with {modeLabel} from the hosted project.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Any local changes that haven't been promoted will be lost.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePullLatest}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Pull Latest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutputSection({ output, expanded, onToggle }: { output: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-800/40 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-medium text-gray-400 flex-1">Job Output</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-500 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-4 pb-3 max-h-64 overflow-y-auto">
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">{output}</pre>
        </div>
      )}
    </div>
  );
}
