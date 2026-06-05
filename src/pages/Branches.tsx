import { useEffect, useState, useRef } from 'react';
import { GitBranch, Plus, Save, ArrowRightLeft, RotateCcw, Trash2, HardDrive, Database, Terminal, ChevronDown, X, ScrollText, GitMerge, Shield, Eye, Play, Loader2 } from 'lucide-react';
import { syncApi } from '../services';
import type { Branch, BranchesResponse, Job, EnvironmentIdentity } from '../types/api';
import { useEnvironments } from '../contexts/EnvironmentsContext';
import EnvironmentSelector from '../components/EnvironmentSelector';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';
import EmptyState from '../components/EmptyState';
import CreateBranchModal from '../components/CreateBranchModal';
import MigrationsPanel from '../components/MigrationsPanel';

const LAST_ENV_KEY = 'syncdb_branches_last_env';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Branches() {
  const { environments, meta } = useEnvironments();
  const [selectedEnv, setSelectedEnv] = useState<string | null>(localStorage.getItem(LAST_ENV_KEY));
  const [branchData, setBranchData] = useState<BranchesResponse | null>(null);
  const [identity, setIdentity] = useState<EnvironmentIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Job progress state
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [jobLabel, setJobLabel] = useState('');
  const [showJobOutput, setShowJobOutput] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Confirmation modals
  const [switchTarget, setSwitchTarget] = useState<Branch | null>(null);
  const [resetTarget, setResetTarget] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [resetSource, setResetSource] = useState('');

  // Migration actions
  const [migrationLoading, setMigrationLoading] = useState<'plan' | 'up' | null>(null);

  const sourceProject = identity?.projects.find(p => p.role === 'source');
  const targetProject = identity?.projects.find(p => p.role === 'target');
  const isBusy = activeJob !== null && (activeJob.status === 'queued' || activeJob.status === 'running');

  useEffect(() => {
    if (!selectedEnv && environments.length > 0) {
      const last = localStorage.getItem(LAST_ENV_KEY);
      const pick = last && environments.find(e => e.name === last) ? last : environments[0].name;
      handleSelectEnv(pick);
    } else if (selectedEnv) {
      loadBranches();
    }
  }, [environments, selectedEnv]);

  function handleSelectEnv(name: string) {
    setSelectedEnv(name);
    localStorage.setItem(LAST_ENV_KEY, name);
    setBranchData(null);
    setIdentity(null);
    setLoading(true);
  }

  async function loadBranches() {
    if (!selectedEnv) return;
    try {
      setError('');
      const [data] = await Promise.all([
        syncApi.listBranches(selectedEnv),
        syncApi.getEnvironmentIdentity(selectedEnv).then(setIdentity).catch(() => setIdentity(null)),
      ]);
      setBranchData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }

  function startJobPoll(job: Job, label: string) {
    setActiveJob(job);
    setJobLabel(label);
    setShowJobOutput(true);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await syncApi.getJob(job.id);
        setActiveJob(fresh);
        if (fresh.status === 'succeeded' || fresh.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (fresh.status === 'succeeded') {
            loadBranches();
          }
        }
      } catch {
        // API unavailable
      }
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSave(branchName: string) {
    try {
      setError('');
      const job = await syncApi.saveBranch(branchName);
      startJobPoll(job, `Saving "${branchName}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save branch');
    }
  }

  async function handleSwitch(branch: Branch) {
    try {
      setError('');
      setSwitchTarget(null);
      const job = await syncApi.switchBranch(branch.name, { autosave: true });
      startJobPoll(job, `Switching to "${branch.name}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch branch');
    }
  }

  async function handleReset(target: Branch, source: string) {
    try {
      setError('');
      setResetTarget(null);
      const job = await syncApi.resetBranch(target.name, { from: source });
      startJobPoll(job, `Resetting "${target.name}" from "${source}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset branch');
    }
  }

  async function handleDelete(branch: Branch) {
    try {
      setError('');
      setDeleteTarget(null);
      await syncApi.deleteBranch(branch.name);
      loadBranches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete branch');
    }
  }

  async function handleMerge(branch: Branch) {
    try {
      setError('');
      setShowMerge(false);
      const job = await syncApi.mergeBranch(branch.name, { target_branch: 'main', autosave: true, activate: true });
      startJobPoll(job, `Merging "${branch.name}" into main`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to merge branch');
    }
  }

  async function handleMigrationAction(action: 'plan' | 'up') {
    if (!selectedEnv) return;
    try {
      setError('');
      setMigrationLoading(action);
      let job: Job;
      if (action === 'plan') {
        job = await syncApi.planMigrations(selectedEnv);
      } else {
        job = await syncApi.applyMigrations(selectedEnv);
      }
      startJobPoll(job, action === 'plan' ? `Planning migrations for "${selectedEnv}"` : `Applying migrations to "${selectedEnv}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} migrations`);
    } finally {
      setMigrationLoading(null);
    }
  }

  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-4">
          <GitBranch className="w-6 h-6 text-gray-500" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">No environments configured</h2>
        <p className="text-sm text-gray-400 max-w-sm mb-6">Create an environment first to manage branches.</p>
        <a href="/environments" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">
          Go to Environments
        </a>
      </div>
    );
  }

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  const branches = branchData?.branches || [];
  const activeBranch = branches.find(b => b.active);
  const inactiveBranches = branches.filter(b => !b.active);
  const selectedEnvironment = environments.find(e => e.name === selectedEnv) || null;
  const isProtected = selectedEnvironment?.protected === true;
  const canPromote = !isProtected || activeBranch?.name === 'main';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Branches</h1>
          <p className="text-sm text-gray-400 mt-1">Source database state snapshots.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={isBusy}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          New Branch
        </button>
      </div>

      {/* Environment selector with active branch switcher */}
      <div className="flex items-center gap-3">
        <EnvironmentSelector
          environments={environments}
          selected={selectedEnv}
          onSelect={handleSelectEnv}
          loading={false}
          sourceLabel={sourceProject?.name}
          targetLabel={targetProject?.name}
          meta={meta}
        />
        {branches.length > 0 && (
          <BranchSwitcher
            branches={branches}
            activeBranch={activeBranch || null}
            disabled={isBusy}
            onSwitch={(b) => setSwitchTarget(b)}
          />
        )}
      </div>

      {/* Job Progress */}
      {activeJob && (
        <JobProgressPanel
          job={activeJob}
          label={jobLabel}
          expanded={showJobOutput}
          onToggle={() => setShowJobOutput(!showJobOutput)}
          onDismiss={() => { setActiveJob(null); setShowJobOutput(false); }}
        />
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Empty state */}
      {branches.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No branches yet"
          description="Create your first branch to snapshot the current database state."
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Branch
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Active branch card */}
          {activeBranch && (
            <ActiveBranchCard
              branch={activeBranch}
              onSave={() => handleSave(activeBranch.name)}
              onMerge={activeBranch.name !== 'main' ? () => setShowMerge(true) : undefined}
              disabled={isBusy}
            />
          )}

          {/* Migrations for active branch against selected environment */}
          {selectedEnv && activeBranch && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-200">Migrations</h3>
                  {isProtected && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Shield className="w-2.5 h-2.5" />
                      Protected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">
                    <span className="font-mono text-teal-400">{activeBranch.name}</span>
                    <span className="mx-1.5">&rarr;</span>
                    <span className="font-mono text-gray-300">{selectedEnv}</span>
                  </span>
                  <button
                    onClick={() => handleMigrationAction('plan')}
                    disabled={isBusy || migrationLoading !== null}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {migrationLoading === 'plan' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                    Plan
                  </button>
                  <button
                    onClick={() => handleMigrationAction('up')}
                    disabled={isBusy || migrationLoading !== null || !canPromote}
                    title={!canPromote ? 'Production can only be promoted from main' : undefined}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-900/20"
                  >
                    {migrationLoading === 'up' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Apply Up
                  </button>
                </div>
              </div>
              {!canPromote && (
                <div className="px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">
                    Production can only be promoted from main. Merge this branch into main first.
                  </p>
                </div>
              )}
              <div className="p-4">
                <MigrationsPanel envName={selectedEnv} compact />
              </div>
            </div>
          )}

          {/* Inactive branches */}
          {inactiveBranches.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                Other Branches ({inactiveBranches.length})
              </h3>
              <div className="grid gap-2">
                {inactiveBranches.map(branch => (
                  <BranchRow
                    key={branch.name}
                    branch={branch}
                    disabled={isBusy}
                    onSwitch={() => setSwitchTarget(branch)}
                    onSave={() => handleSave(branch.name)}
                    onReset={() => setResetTarget(branch)}
                    onDelete={() => setDeleteTarget(branch)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateBranchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadBranches(); }}
        />
      )}

      {switchTarget && (
        <SwitchConfirmModal
          branch={switchTarget}
          onConfirm={() => handleSwitch(switchTarget)}
          onClose={() => setSwitchTarget(null)}
        />
      )}

      {resetTarget && (
        <ResetBranchModal
          target={resetTarget}
          branches={branches}
          source={resetSource}
          onSourceChange={setResetSource}
          onConfirm={() => handleReset(resetTarget, resetSource)}
          onClose={() => { setResetTarget(null); setResetSource(''); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          branch={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {showMerge && activeBranch && (
        <MergeConfirmModal
          branch={activeBranch}
          onConfirm={() => handleMerge(activeBranch)}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}


// --- Sub-components ---

function ActiveBranchCard({ branch, onSave, onMerge, disabled }: { branch: Branch; onSave: () => void; onMerge?: () => void; disabled: boolean }) {
  return (
    <div className="bg-gray-900 border border-emerald-600/30 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-base font-semibold text-white">{branch.name}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-600/15 text-emerald-400 border border-emerald-600/20">
                Active
              </span>
              <ModeBadge mode={branch.mode} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              {branch.source_branch && (
                <span className="flex items-center gap-1 text-gray-400">
                  from <span className="font-mono text-teal-400">{branch.source_branch}</span>
                </span>
              )}
              {branch.notes && <span className="text-gray-400">{branch.notes}</span>}
              <span>Updated {formatRelativeTime(branch.updated_at)}</span>
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {formatBytes(branch.dump_size_bytes)}
              </span>
              {branch.includes_storage_files && (
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {formatBytes(branch.storage_size_bytes)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onMerge && (
            <button
              onClick={onMerge}
              disabled={disabled}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Merge into main
            </button>
          )}
          <button
            onClick={onSave}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
      {branch.schemas && branch.schemas[0] !== '*' && (
        <div className="mt-3 pt-3 border-t border-gray-800/50 flex items-center gap-2">
          <span className="text-xs text-gray-500">Schemas:</span>
          {branch.schemas.map(s => (
            <span key={s} className="text-xs font-mono text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BranchRow({ branch, disabled, onSwitch, onSave, onReset, onDelete }: {
  branch: Branch;
  disabled: boolean;
  onSwitch: () => void;
  onSave: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMain = branch.name === 'main';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-4 h-4 text-gray-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-200 truncate">{branch.name}</span>
              <ModeBadge mode={branch.mode} />
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              {branch.source_branch && (
                <span className="flex items-center gap-1 text-gray-400">
                  from <span className="font-mono text-teal-400">{branch.source_branch}</span>
                </span>
              )}
              {branch.notes && <span className="text-gray-400 truncate max-w-[200px]">{branch.notes}</span>}
              <span>Updated {formatRelativeTime(branch.updated_at)}</span>
              <span>{formatBytes(branch.dump_size_bytes)}</span>
              {branch.includes_storage_files && (
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {formatBytes(branch.storage_size_bytes)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitch}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft className="w-3 h-3" />
            Switch
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              disabled={disabled}
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1">
                  <button
                    onClick={() => { setMenuOpen(false); onSave(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onReset(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset from...
                  </button>
                  <div className="my-1 border-t border-gray-700" />
                  {isMain ? (
                    <div className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-600 cursor-not-allowed" title="The main branch cannot be deleted">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                      <span className="ml-auto text-[10px] text-gray-600">protected</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchSwitcher({ branches, activeBranch, disabled, onSwitch }: {
  branches: Branch[];
  activeBranch: Branch | null;
  disabled: boolean;
  onSwitch: (branch: Branch) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const otherBranches = branches.filter(b => !b.active);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-xl text-sm transition-all min-w-[200px] disabled:opacity-50"
      >
        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-gray-200 font-medium">
            {activeBranch?.name || 'No active branch'}
          </div>
          <div className="text-[10px] text-gray-500">
            {activeBranch ? `${activeBranch.mode === 'full' ? 'Full' : 'App-only'} snapshot` : 'Source branch'}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && otherBranches.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Switch to branch</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {otherBranches.map(branch => (
              <button
                key={branch.name}
                onClick={() => {
                  setOpen(false);
                  onSwitch(branch);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate">{branch.name}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-2">
                    <span>{branch.mode === 'full' ? 'Full' : 'App-only'}</span>
                    {branch.source_branch && (
                      <span>from <span className="font-mono text-teal-400/70">{branch.source_branch}</span></span>
                    )}
                    <span>Updated {formatRelativeTime(branch.updated_at)}</span>
                  </div>
                </div>
                <ArrowRightLeft className="w-3.5 h-3.5 text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {open && otherBranches.length === 0 && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 z-50 p-4">
          <p className="text-xs text-gray-500 text-center">No other branches to switch to.</p>
        </div>
      )}
    </div>
  );
}

function ModeBadge({ mode }: { mode: 'full' | 'app-only' }) {
  if (mode === 'full') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
        Full
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
      App
    </span>
  );
}

function JobProgressPanel({ job, label, expanded, onToggle, onDismiss }: {
  job: Job;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  const isRunning = job.status === 'queued' || job.status === 'running';
  const succeeded = job.status === 'succeeded';
  const failed = job.status === 'failed';

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      isRunning ? 'bg-blue-500/5 border-blue-500/20' :
      succeeded ? 'bg-emerald-500/5 border-emerald-500/20' :
      'bg-red-500/5 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {isRunning && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
          {succeeded && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
          {failed && <div className="w-2 h-2 rounded-full bg-red-400" />}
          <span className={`text-sm font-medium ${
            isRunning ? 'text-blue-300' : succeeded ? 'text-emerald-300' : 'text-red-300'
          }`}>
            {label}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isRunning ? 'bg-blue-500/15 text-blue-400' :
            succeeded ? 'bg-emerald-500/15 text-emerald-400' :
            'bg-red-500/15 text-red-400'
          }`}>
            {job.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
          >
            <Terminal className="w-4 h-4" />
          </button>
          {!isRunning && (
            <button
              onClick={onDismiss}
              className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {expanded && job.output && (
        <div className="px-4 pb-3">
          <pre className="text-xs text-gray-400 bg-gray-950 rounded-lg p-3 max-h-48 overflow-auto font-mono whitespace-pre-wrap">
            {job.output}
          </pre>
        </div>
      )}
    </div>
  );
}

function SwitchConfirmModal({ branch, onConfirm, onClose }: {
  branch: Branch;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Switch Branch</h3>
        <p className="text-sm text-gray-400 mb-2">
          This will restore the <span className="text-white font-medium">"{branch.name}"</span> snapshot into your local Supabase runtime.
        </p>
        <p className="text-sm text-gray-400 mb-1">
          {branch.includes_storage_files
            ? 'The local database and storage files will be replaced.'
            : 'The local database will be replaced. Storage files are not included in this snapshot.'}
        </p>
        <p className="text-sm text-gray-500 mb-5">
          Your current active branch will be auto-saved before switching.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetBranchModal({ target, branches, source, onSourceChange, onConfirm, onClose }: {
  target: Branch;
  branches: Branch[];
  source: string;
  onSourceChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const options = branches.filter(b => b.name !== target.name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Reset Branch</h3>
        <p className="text-sm text-gray-400 mb-4">
          Replace the <span className="text-white font-medium">"{target.name}"</span> snapshot with another branch's snapshot.
        </p>
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Source Branch</label>
          <select
            value={source}
            onChange={e => onSourceChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 transition-all"
          >
            <option value="">Select a branch...</option>
            {options.map(b => (
              <option key={b.name} value={b.name}>{b.name}{b.active ? ' (active)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!source}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ branch, onConfirm, onClose }: {
  branch: Branch;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const confirmed = confirmText === branch.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Delete Branch</h3>
        <p className="text-sm text-gray-400 mb-4">
          Are you sure you want to delete <span className="text-white font-medium">"{branch.name}"</span>? This will permanently remove the snapshot and cannot be undone.
        </p>
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Type <span className="font-mono text-red-400">{branch.name}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={branch.name}
            className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/20 transition-all"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Branch
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeConfirmModal({ branch, onConfirm, onClose }: {
  branch: Branch;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Merge into main</h3>
        <p className="text-sm text-gray-400 mb-4">
          This will merge <span className="text-white font-medium">"{branch.name}"</span> into <span className="font-mono text-teal-400">main</span>.
        </p>
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 mb-5 space-y-2 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Save className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span>Your current branch will be auto-saved first</span>
          </div>
          <div className="flex items-center gap-2">
            <GitMerge className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span>Snapshot and migration ledger will be copied into main</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span>The runtime will switch to main after merging</span>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
            <GitMerge className="w-3.5 h-3.5" />
            Merge into main
          </button>
        </div>
      </div>
    </div>
  );
}
