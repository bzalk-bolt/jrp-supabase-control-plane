import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Database, ArrowLeftRight, AlertTriangle, RotateCcw, Trash2, X, ExternalLink, ScrollText } from 'lucide-react';
import { syncApi } from '../services';
import type { Environment, EnvironmentIdentity } from '../types/api';
import ResetConfirmModal from '../components/ResetConfirmModal';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';
import MigrationsPanel from '../components/MigrationsPanel';
import { useEnvironments } from '../contexts/EnvironmentsContext';

export default function EnvironmentDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { environments, meta } = useEnvironments();

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [identity, setIdentity] = useState<EnvironmentIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobLabel, setActiveJobLabel] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resetDirection, setResetDirection] = useState<'source' | 'destination' | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const sourceProject = identity?.projects.find(p => p.role === 'source');
  const targetProject = identity?.projects.find(p => p.role === 'target');
  const envMeta = name ? meta[name] : undefined;
  const localEnvironmentId = envMeta?.source === 'self-hosted' ? envMeta.localEnvironmentId : undefined;
  const fallbackEnvironment = name ? environments.find(e => e.name === name) : undefined;

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    setError('');
    setUsingFallback(false);

    const environmentRequest = localEnvironmentId
      ? syncApi.getEnvironmentFor(name, localEnvironmentId)
      : syncApi.getEnvironment(name);
    const identityRequest = localEnvironmentId
      ? syncApi.getEnvironmentIdentityFor(name, localEnvironmentId)
      : syncApi.getEnvironmentIdentity(name);

    Promise.all([
      environmentRequest.then(env => { setEnvironment(env); return env; }),
      identityRequest.then(id => { setIdentity(id); return id; }).catch(() => null),
    ])
      .catch(e => {
        if (fallbackEnvironment) {
          setEnvironment(fallbackEnvironment);
          setIdentity(null);
          setUsingFallback(true);
          setError(
            localEnvironmentId
              ? 'The self-hosted sync-api is not reachable or has not created this environment yet. Use the local environment page to repair SSL, reset the VPS, or pull the remote project into this server.'
              : e instanceof Error ? e.message : 'Failed to load',
          );
          return;
        }
        setEnvironment(null);
        setIdentity(null);
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [name, localEnvironmentId, fallbackEnvironment]);

  async function handleDelete() {
    if (!name) return;
    try {
      if (localEnvironmentId) {
        await syncApi.deleteEnvironmentFor(name, localEnvironmentId);
      } else {
        await syncApi.deleteEnvironment(name);
      }
      navigate('/environments');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleReset() {
    if (!name || !resetDirection) return;
    const confirmValue = resetDirection === 'destination' ? 'RESET DESTINATION' : 'RESET SOURCE';
    try {
      setResetLoading(true);
      setError('');
      const job = resetDirection === 'destination'
        ? await syncApi.resetDestination(name, { confirm: confirmValue }, localEnvironmentId)
        : await syncApi.resetSource(name, { confirm: confirmValue }, localEnvironmentId);
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

      {usingFallback && localEnvironmentId && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">Self-hosted sync-api unavailable</p>
              <p className="text-xs text-amber-100/70 mt-1">
                Environment details are being shown from the saved binding record. Server reset and SSL repair live on the local environment page.
              </p>
            </div>
          </div>
          <Link
            to={`/local-environments/${localEnvironmentId}`}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-100 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors whitespace-nowrap"
          >
            Open local environment
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">Configuration</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {sourceProject && (
            <ConfigRow label="Source Project" value={`${sourceProject.name}${sourceProject.organization_name ? ` (${sourceProject.organization_name})` : ''}`} />
          )}
          <ConfigRow label="Source Container" value={environment.source_container || '\u2014'} />
          <ConfigRow label="Source DB URL" value={environment.source_db_url || '\u2014'} mono />
          {targetProject && (
            <ConfigRow label="Target Project" value={`${targetProject.name}${targetProject.organization_name ? ` (${targetProject.organization_name})` : ''}`} />
          )}
          <ConfigRow label="Target Container" value={environment.target_container || '\u2014'} />
          <ConfigRow label="Target DB URL" value={environment.target_db_url || '\u2014'} mono />
          <ConfigRow label="Sync Storage Buckets" value={environment.sync_storage_buckets !== false ? 'Yes' : 'No'} />
        </div>
      </div>

      {!usingFallback && (
        <>
          {/* Migrations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-200">Migrations</h2>
            </div>
            <div className="p-4">
              <MigrationsPanel envName={name!} localEnvironmentId={localEnvironmentId} />
            </div>
          </div>

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
        </>
      )}

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

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm text-gray-200 max-w-sm truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
