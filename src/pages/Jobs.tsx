import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollText, RefreshCw } from 'lucide-react';
import { syncApi } from '../services';
import type { JobSummary } from '../types/api';
import { saveJob, mergeWithApiJobs, subscribeToJobChanges } from '../services/jobHistoryService';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import EnvironmentSelector from '../components/EnvironmentSelector';
import { useEnvironments } from '../contexts/EnvironmentsContext';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';

const LAST_ENV_KEY = 'syncdb_logs_last_env';

export default function Logs() {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEnv, setSelectedEnv] = useState<string | null>(localStorage.getItem(LAST_ENV_KEY));

  async function loadJobs() {
    try {
      setLoading(true);
      let apiJobs: JobSummary[] = [];
      try {
        apiJobs = await syncApi.listJobs();
      } catch {
        // API might be unavailable; still show local history
      }
      const merged = await mergeWithApiJobs(apiJobs);
      setJobs(merged);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunningJobs = jobs.some(j => j.status === 'queued' || j.status === 'running');

  useEffect(() => {
    if (hasRunningJobs) {
      tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
      pollRef.current = setInterval(async () => {
        const running = jobs.filter(j => j.status === 'queued' || j.status === 'running');
        for (const j of running) {
          try {
            const fresh = await syncApi.getJob(j.id);
            if (fresh.status !== j.status) {
              await saveJob(fresh);
              setJobs(prev => prev.map(p => p.id === fresh.id ? {
                ...p,
                status: fresh.status,
                finished_at_ms: fresh.finished_at_ms,
                exit_code: fresh.exit_code,
              } : p));
            }
          } catch {
            // API unavailable, skip
          }
        }
      }, 3000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasRunningJobs]);

  useEffect(() => {
    if (!selectedEnv && environments.length > 0) {
      const last = localStorage.getItem(LAST_ENV_KEY);
      const pick = last && environments.find(e => e.name === last) ? last : environments[0].name;
      setSelectedEnv(pick);
    }
  }, [environments]);

  useEffect(() => {
    loadJobs();

    const channel = subscribeToJobChanges((updatedJob) => {
      setJobs(prev => {
        const exists = prev.find(j => j.id === updatedJob.id);
        if (exists) {
          return prev.map(j => j.id === updatedJob.id ? updatedJob : j);
        }
        return [updatedJob, ...prev];
      });
    });

    return () => { channel.unsubscribe(); };
  }, []);

  function handleEnvSelect(name: string) {
    setSelectedEnv(name);
    localStorage.setItem(LAST_ENV_KEY, name);
  }

  function formatTime(ms?: number | null) {
    if (!ms) return '\u2014';
    return new Date(ms).toLocaleString();
  }

  function formatDuration(start?: number | null, end?: number | null, _tick?: number) {
    if (!start) return '\u2014';
    const endMs = end || Date.now();
    const diff = endMs - start;
    if (diff < 1000) return `${diff}ms`;
    if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
    return `${(diff / 60000).toFixed(1)}m`;
  }

  const filteredJobs = selectedEnv
    ? jobs.filter(j => j.environment === selectedEnv)
    : jobs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Logs</h1>
        <p className="text-sm text-gray-400 mt-1">Job history and execution logs.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <EnvironmentSelector
            environments={environments}
            selected={selectedEnv}
            onSelect={handleEnvSelect}
          />
          <button
            onClick={loadJobs}
            className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <AppLoadingSkeleton />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No logs"
          description="Job logs will appear here when actions are executed."
        />
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Job</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Environment</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Started</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredJobs.map(job => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/logs/${job.id}`)}
                    className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                          <ScrollText className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200">{job.kind}</div>
                          <div className="text-xs font-mono text-gray-500 truncate max-w-[180px]">{job.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-300 font-mono">{job.environment}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">
                      {formatTime(job.started_at_ms)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400 font-mono">
                      {formatDuration(job.started_at_ms, job.finished_at_ms, tick)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
