import { useState } from 'react';
import {
  Cloud, Database, RefreshCw, GitCompare, ArrowUpRight,
  Unlink, Loader2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { localEnvironmentsService, syncApi } from '../services';
import type { LocalEnvironment, LocalEnvironmentBinding } from '../types/api';

interface Props {
  env: LocalEnvironment;
  binding: LocalEnvironmentBinding;
  onDisconnected: () => void;
}

export default function ConnectedProjectCard({ env, binding, onDisconnected }: Props) {
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');

  async function handleDisconnect() {
    setDisconnecting(true);
    setError('');
    try {
      await localEnvironmentsService.deleteBinding(binding.id);
      await localEnvironmentsService.setConnectionMode(env.id, null);
      onDisconnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
      setDisconnecting(false);
    }
  }

  async function handlePullLatest() {
    setPulling(true);
    setPullStatus('running');
    setError('');
    try {
      const envName = `${env.name || env.apex_domain}-main`;

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
      } catch {
        // may already exist
      }

      const job = await syncApi.resetDestination(
        envName,
        { confirm: 'RESET DESTINATION', reset_database: true },
        env.id,
      );

      const poll = setInterval(async () => {
        try {
          const updated = await syncApi.getJob(job.id, env.id);
          if (updated.status === 'succeeded') {
            clearInterval(poll);
            setPulling(false);
            setPullStatus('completed');
            setTimeout(() => setPullStatus('idle'), 5000);
          } else if (updated.status === 'failed') {
            clearInterval(poll);
            setPulling(false);
            setPullStatus('failed');
            setError(updated.output || 'Pull failed');
          }
        } catch {}
      }, 4000);
    } catch (e) {
      setPulling(false);
      setPullStatus('failed');
      setError(e instanceof Error ? e.message : 'Failed to start pull');
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Cloud className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white">Connected Remote Project</h3>
          <p className="text-xs text-gray-500">This local environment is linked to a hosted Supabase project</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
          <CheckCircle2 className="w-3 h-3" />
          Connected
        </span>
      </div>

      <div className="p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoCard label="Organization" value={binding.remote_organization_name || '—'} icon={<Cloud className="w-3.5 h-3.5 text-blue-400" />} />
          <InfoCard label="Project Ref" value={binding.remote_project_ref} mono icon={<Database className="w-3.5 h-3.5 text-emerald-400" />} />
          <InfoCard label="Import Mode" value={binding.database_mode === 'schema-and-data' ? 'Schema + Data' : 'Schema Only'} />
          <InfoCard label="Connected" value={new Date(binding.bound_at).toLocaleDateString()} />
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={handlePullLatest}
            disabled={pulling}
            title="Sync latest schema from remote"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 bg-gray-800/60 border border-gray-700/50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 hover:text-gray-300 hover:border-gray-600"
          >
            {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             pullStatus === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
             <RefreshCw className="w-3.5 h-3.5" />}
            {pulling ? 'Pulling...' : pullStatus === 'completed' ? 'Pulled' : 'Pull Latest'}
          </button>
          <ActionButton icon={<GitCompare className="w-3.5 h-3.5" />} label="Compare" disabled hint="Compare local vs remote" />
          <ActionButton icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Promote" disabled hint="Push migrations to remote" />
          <div className="flex-1" />
          <button
            onClick={() => setShowDisconnect(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/30 rounded-lg transition-colors"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {showDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Unlink className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">Disconnect Project</h3>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              This will remove the connection between this local environment and the remote Supabase project.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Your local data will not be deleted. You can reconnect or connect to a different project later.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDisconnect(false)}
                disabled={disconnecting}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-sm text-gray-200 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function ActionButton({ icon, label, disabled, hint }: { icon: React.ReactNode; label: string; disabled?: boolean; hint?: string }) {
  return (
    <button
      disabled={disabled}
      title={hint}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-400 bg-gray-800/60 border border-gray-700/50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 hover:text-gray-300 hover:border-gray-600"
    >
      {icon}
      {label}
    </button>
  );
}
