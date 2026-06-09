import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Database, ArrowLeftRight, AlertTriangle, RotateCcw, Trash2, X, ExternalLink } from 'lucide-react';
import { syncApi } from '../services';
import type { Environment, EnvironmentIdentity } from '../types/api';
import { useEnvironments } from '../contexts/EnvironmentsContext';
import ResetConfirmModal from '../components/ResetConfirmModal';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';

export default function EnvironmentDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { meta } = useEnvironments();

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [identity, setIdentity] = useState<EnvironmentIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobLabel, setActiveJobLabel] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resetDirection, setResetDirection] = useState<'source' | 'destination' | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const sourceProject = identity?.projects.find(p => p.role === 'source');
  const targetProject = identity?.projects.find(p => p.role === 'target');

  function getLocalEnvId(): string | undefined {
    if (!name) return undefined;
    const envMeta = meta[name];
    return envMeta?.source === 'self-hosted' && envMeta.localEnvironmentId
      ? envMeta.localEnvironmentId
      : undefined;
  }

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    const localEnvId = getLocalEnvId();
    Promise.all([
      syncApi.getEnvironment(name, localEnvId).then(env => { setEnvironment(env); return env; }),
      syncApi.getEnvironmentIdentity(name, localEnvId).then(id => { setIdentity(id); return id; }).catch(() => null),
    ])
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [name, meta]);

  async function handleDelete() {
    if (!name) return;
    try {
      await syncApi.deleteEnvironment(name, getLocalEnvId());
      navigate('/environments');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleReset() {
    if (!name || !resetDirection) return;
    const confirmValue = resetDirection === 'destination' ? 'RESET DESTINATION' : 'RESET SOURCE';
    const localEnvId = getLocalEnvId();
    try {
      setResetLoading(true);
      setError('');
      const job = resetDirection === 'destination'
        ? await syncApi.resetDestination(name, { confirm: confirmValue }, localEnvId)
        : await syncApi.resetSource(name, { confirm: confirmValue }, localEnvId);
      setResetDirection(null);
      setActiveJobId(job.id);
      setActiveJobLabel(`Reset ${resetDirection}`);

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
      setResetDirection(null);
    } finally {
      setResetLoading(false);
    }
  }

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  if (error && !environment) {
    return (
      <div className="space-y-4">
        <Link to="/environments" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Environments
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!environment) return null;

  const sourceName = sourceProject?.name || environment.source_env || 'source';
  const targetName = targetProject?.name || environment.target_env || 'target';

  return (
    <div className="space-y-6">
      <Link to="/environments" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Environments
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Database className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{environment.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              <span className="font-mono">{environment.source_env}</span>
              <span className="mx-2 text-gray-600">&rarr;</span>
              <span className="font-mono">{environment.target_env}</span>
            </p>
          </div>
        </div>
        <Link
          to={`/compare/${name}`}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Compare
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {activeJobId && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-emerald-400">
              Job running: {activeJobLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/logs/${activeJobId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View Job
            </Link>
            <button
              onClick={() => setActiveJobId(null)}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Source</h2>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">{environment.source_env}</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {sourceProject && (
              <>
                <ConfigRow label="Project" value={sourceProject.name} />
                {sourceProject.organization_name && (
                  <ConfigRow label="Organization" value={sourceProject.organization_name} />
                )}
                {sourceProject.project_ref && (
                  <ConfigRow label="Project Ref" value={sourceProject.project_ref} mono />
                )}
                {sourceProject.project_ref && (
                  <ConfigRow
                    label="Supabase URL"
                    value={`https://${sourceProject.project_ref}.supabase.co`}
                    mono
                    href={`https://supabase.com/dashboard/project/${sourceProject.project_ref}`}
                  />
                )}
              </>
            )}
            {environment.source_container && (
              <ConfigRow label="Container" value={environment.source_container} mono />
            )}
            {environment.source_db_url && (
              <ConfigRow label="DB Connection" value={environment.source_db_url} mono />
            )}
          </div>
        </div>

        {/* Target */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Target</h2>
            <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{environment.target_env}</span>
          </div>
          <div className="divide-y divide-gray-800/60">
            {targetProject && (
              <>
                <ConfigRow label="Project" value={targetProject.name} />
                {targetProject.organization_name && (
                  <ConfigRow label="Organization" value={targetProject.organization_name} />
                )}
                {targetProject.project_ref && (
                  <ConfigRow label="Project Ref" value={targetProject.project_ref} mono />
                )}
                {targetProject.project_ref && (
                  <ConfigRow
                    label="Supabase URL"
                    value={`https://${targetProject.project_ref}.supabase.co`}
                    mono
                    href={`https://supabase.com/dashboard/project/${targetProject.project_ref}`}
                  />
                )}
              </>
            )}
            {environment.target_container && (
              <ConfigRow label="Container" value={environment.target_container} mono />
            )}
            {environment.target_db_url && (
              <ConfigRow label="DB Connection" value={environment.target_db_url} mono />
            )}
          </div>
        </div>
      </div>

      {/* Sync Settings */}
      {environment.sync_storage_buckets !== undefined && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sync Settings</h2>
          </div>
          <div className="divide-y divide-gray-800/60">
            <ConfigRow label="Storage Buckets" value={environment.sync_storage_buckets !== false ? 'Enabled' : 'Disabled'} />
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-gray-900 border border-red-500/30 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-300">Danger Zone</h2>
          </div>
        </div>
        <div className="divide-y divide-gray-800">
          {/* Reset Destination */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex-1 mr-4">
              <p className="text-sm font-medium text-gray-200">Reset destination from source</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Overwrite all data in <span className="font-mono text-gray-300">{targetName}</span> with data from <span className="font-mono text-gray-300">{sourceName}</span>.
                This is non-recoverable.
              </p>
            </div>
            <button
              onClick={() => setResetDirection('destination')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-transparent hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Destination
            </button>
          </div>

          {/* Reset Source */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex-1 mr-4">
              <p className="text-sm font-medium text-gray-200">Reset source from destination</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Overwrite all data in <span className="font-mono text-gray-300">{sourceName}</span> with data from <span className="font-mono text-gray-300">{targetName}</span>.
                This is non-recoverable.
              </p>
            </div>
            <button
              onClick={() => setResetDirection('source')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-transparent hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Source
            </button>
          </div>

          {/* Delete Environment */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex-1 mr-4">
              <p className="text-sm font-medium text-gray-200">Delete this environment</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Remove the environment configuration. This does not affect the underlying databases.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-transparent hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Environment
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {resetDirection && (
        <ResetConfirmModal
          isOpen={!!resetDirection}
          onClose={() => setResetDirection(null)}
          onConfirm={handleReset}
          direction={resetDirection}
          sourceName={sourceName}
          targetName={targetName}
          loading={resetLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Environment</h3>
            <p className="text-sm text-gray-400 mb-5">
              Are you sure you want to delete <span className="font-mono text-gray-200">{name}</span>? This cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 border border-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm text-blue-400 hover:text-blue-300 truncate transition-colors ${mono ? 'font-mono text-xs' : ''}`}
          title={value}
        >
          {value}
        </a>
      ) : (
        <span className={`text-sm text-gray-200 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</span>
      )}
    </div>
  );
}
