import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Layers, RefreshCw, Terminal } from 'lucide-react';
import { syncApi } from '../services';
import type { Job } from '../types/api';
import { saveJob, loadJobById } from '../services/jobHistoryService';
import StatusBadge from '../components/StatusBadge';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const outputRef = useRef<HTMLPreElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevOutputLen = useRef(0);

  async function load() {
    if (!id) return;
    try {
      const data = await syncApi.getJob(id);
      setJob(data);
      setError('');
      saveJob(data);
    } catch {
      const local = await loadJobById(id);
      if (local) {
        setJob(local);
        setError('');
      } else {
        setError('Job not found');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!job || job.status === 'succeeded' || job.status === 'failed') return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [job?.status]);

  useEffect(() => {
    const outputLen = job?.output?.length || 0;
    if (outputLen <= prevOutputLen.current && prevOutputLen.current > 0) {
      prevOutputLen.current = outputLen;
      return;
    }
    prevOutputLen.current = outputLen;

    if (!shouldAutoScroll.current) return;

    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
    if (outputContainerRef.current) {
      outputContainerRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [job?.output]);

  function handleOutputScroll() {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
  }

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  if (error && !job) {
    return (
      <div className="space-y-4">
        <Link to="/logs" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Logs
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!job) return null;

  const isActive = job.status === 'queued' || job.status === 'running';

  return (
    <div className="space-y-6">
      <Link to="/logs" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Logs
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
            <Layers className="w-6 h-6 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight capitalize">{job.kind}</h1>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm font-mono text-gray-500 mt-0.5">{job.id}</p>
          </div>
        </div>
        {isActive && (
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Details</h2>
        </div>
        <div className="divide-y divide-gray-800">
          <DetailRow label="Environment">
            <Link to={`/environments/${job.environment}`} className="text-emerald-400 hover:text-emerald-300 transition-colors">
              {job.environment}
            </Link>
          </DetailRow>
          <DetailRow label="Kind">
            <span className="capitalize">{job.kind}</span>
          </DetailRow>
          <DetailRow label="Status">
            <StatusBadge status={job.status} />
          </DetailRow>
          {job.exit_code !== undefined && job.exit_code !== null && (
            <DetailRow label="Exit Code">
              <span className={`font-mono ${job.exit_code === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {job.exit_code}
              </span>
            </DetailRow>
          )}
          {job.created_at_ms && (
            <DetailRow label="Created">{new Date(job.created_at_ms).toLocaleString()}</DetailRow>
          )}
          {job.started_at_ms && (
            <DetailRow label="Started">{new Date(job.started_at_ms).toLocaleString()}</DetailRow>
          )}
          {job.finished_at_ms && (
            <DetailRow label="Finished">{new Date(job.finished_at_ms).toLocaleString()}</DetailRow>
          )}
          {job.command && job.command.length > 0 && (
            <DetailRow label="Command">
              <code className="text-xs font-mono text-gray-300 bg-gray-800 px-2 py-1 rounded">
                {job.command.join(' ')}
              </code>
            </DetailRow>
          )}
        </div>
      </div>

      <div ref={outputContainerRef} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <Terminal className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Output</h2>
          {isActive && (
            <span className="ml-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Live</span>
          )}
        </div>
        <div className="p-5">
          {job.output ? (
            <pre
              ref={outputRef}
              onScroll={handleOutputScroll}
              className="p-4 bg-gray-950 border border-gray-800 rounded-lg text-xs text-gray-300 font-mono overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed"
            >
              {job.output}
            </pre>
          ) : (
            <div className="text-center py-8 text-sm text-gray-500">
              {isActive ? 'Waiting for output...' : 'No output'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-200">{children}</span>
    </div>
  );
}
