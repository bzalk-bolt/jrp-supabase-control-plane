import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, RefreshCw, Server,
  ShieldCheck, AlertTriangle, Trash2, X, Activity, Globe, Copy,
  RotateCcw, ExternalLink, Terminal, Wrench, Download, Rocket, ChevronDown, KeyRound,
} from 'lucide-react';
import { localEnvironmentsService, vpsProvisionService, settingsService } from '../services';
import type { LocalEnvironment, LocalEnvironmentBinding, ProvisioningJob } from '../types/api';
import type { HealthCheckResponse, VmDetailsResponse } from '../services/vpsProvisionService';
import ConnectProjectWizard from './ConnectProjectWizard';
import ConnectedProjectCard from './ConnectedProjectCard';
import SyncOperationsPanel from './SyncOperationsPanel';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function statusStyle(s: string) {
  switch (s) {
    case 'ready': return { cls: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5', label: 'Ready', Icon: CheckCircle2 };
    case 'failed': return { cls: 'border-red-500/40 text-red-400 bg-red-500/5', label: 'Failed', Icon: AlertTriangle };
    case 'destroyed': return { cls: 'border-gray-600/40 text-gray-400 bg-gray-500/5', label: 'Destroyed', Icon: Circle };
    default: return { cls: 'border-blue-500/40 text-blue-400 bg-blue-500/5', label: s.charAt(0).toUpperCase() + s.slice(1), Icon: Loader2 };
  }
}

export default function EnvironmentDetailPanel({ id }: { id: string }) {
  const navigate = useNavigate();
  const [env, setEnv] = useState<LocalEnvironment | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const row = await localEnvironmentsService.getLocalEnvironment(id);
      setEnv(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await localEnvironmentsService.deleteLocalEnvironment(id);
      navigate('/local-environments');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleting(false);
    }
  }

  if (error && env === undefined) {
    return <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>;
  }
  if (env === undefined) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-sm text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading...
      </div>
    );
  }
  if (env === null) {
    return <div className="text-sm text-gray-400">Local environment not found.</div>;
  }

  const s = statusStyle(env.vps_status);
  const Icon = s.Icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/local-environments"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white tracking-tight truncate">{env.name || env.full_hostname}</h1>
          <p className="text-sm text-gray-400 mt-1 font-mono truncate">{env.apex_domain}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium', s.cls)}>
          <Icon className={cn('w-3.5 h-3.5', /provisioning|installing|configuring/.test(env.vps_status) && 'animate-spin')} />
          {s.label}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Server Overview */}
      <ServerOverviewSection env={env} />

      {/* Setup Progress Stepper */}
      <SetupProgressSection env={env} onChange={reload} />

      {/* Next Steps / Connection */}
      <NextStepsSection env={env} onChange={reload} />

      {/* Provisioning Log */}
      <ProvisioningLogSection envId={env.id} />

      {/* Danger Zone */}
      <DangerZoneSection env={env} onDelete={() => setConfirmDelete(true)} onChange={reload} />

      {confirmDelete && (
        <ConfirmDeleteModal
          name={env.name || env.full_hostname}
          deleting={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// --- Server Overview ---

function ServerOverviewSection({ env }: { env: LocalEnvironment }) {
  const [vmDetails, setVmDetails] = useState<VmDetailsResponse | null>(null);
  const [loadingVm, setLoadingVm] = useState(false);
  const [copied, setCopied] = useState('');
  const [expanded, setExpanded] = useState(false);
  const serviceBase = localEnvironmentsService.serviceBaseDomain(env);

  useEffect(() => {
    if (!env.vps_id) return;
    setLoadingVm(true);
    vpsProvisionService.getVmDetails(env.id)
      .then(setVmDetails)
      .catch(() => {})
      .finally(() => setLoadingVm(false));
  }, [env.id, env.vps_id]);

  function copyToClipboard(val: string, label: string) {
    navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <Server className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-1">
          Server Overview
        </h2>
        <span className="text-xs text-gray-500 font-mono mr-2">{env.vps_ip || ''}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow label="Apex Domain" value={env.apex_domain} mono />
            <InfoRow label="Service Hosts" value={serviceBase ? `supabase / studio / auth / sync-api .${serviceBase}` : ''} mono />
            <div className="flex items-center gap-2">
              <InfoRow label="Server IP" value={env.vps_ip} mono />
              {env.vps_ip && (
                <button
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(env.vps_ip, 'ip'); }}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Copy IP"
                >
                  {copied === 'ip' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <InfoRow label="VPS ID" value={env.vps_id} mono />
            <InfoRow label="Provider State" value={loadingVm ? 'Loading...' : (vmDetails?.state || '—')} />
            <InfoRow label="Sync API URL" value={env.sync_api_url} mono />
            {vmDetails?.template != null && (
              <InfoRow label="OS Template" value={String((vmDetails.template as Record<string,unknown>)?.name || vmDetails.template || '')} />
            )}
            {vmDetails?.data_center != null && (
              <InfoRow label="Data Center" value={String((vmDetails.data_center as Record<string,unknown>)?.name || (vmDetails.data_center as Record<string,unknown>)?.location || vmDetails.data_center || '')} />
            )}
            <InfoRow label="DNS Verified" value={env.dns_verified_at ? new Date(env.dns_verified_at).toLocaleString() : 'Not yet'} />
            {env.netlify_url && (
              <div className="flex items-center gap-2">
                <InfoRow label="Netlify" value={env.netlify_url} mono />
                <a href={env.netlify_url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-300">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0 uppercase tracking-wider">{label}</span>
      <span className={cn('text-sm text-gray-200 truncate', mono && 'font-mono')}>{value || '—'}</span>
    </div>
  );
}

// --- Setup Progress Stepper ---

type StepStatus = 'completed' | 'active' | 'pending' | 'failed';

function SetupProgressSection({ env, onChange }: { env: LocalEnvironment; onChange: () => void | Promise<void> }) {
  const vpsPurchased = !!env.vps_id;
  const osInstalled = env.vps_status === 'ready';
  const postInstallDone = env.post_install_status === 'completed';
  const postInstallRunning = env.post_install_status === 'running';
  const healthOk = env.health_check_results && (env.health_check_results as Record<string, unknown>).supabase_api === true;
  const dnsConfigured = !!env.dns_a_record_verified_at;

  const allDone = vpsPurchased && osInstalled && postInstallDone && dnsConfigured && healthOk;
  const [expanded, setExpanded] = useState(!allDone);

  const isTransitional = env.vps_status === 'installing' || env.vps_status === 'provisioning' || env.vps_status === 'configuring_dns';
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!isTransitional) return;
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (stoppedRef.current) return;
      try {
        await vpsProvisionService.pollProvision(env.id);
        await onChange();
      } catch (err) {
        void err;
      }
      if (!stoppedRef.current) {
        timer = setTimeout(tick, 6000);
      }
    }

    tick();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [env.id, isTransitional, onChange]);

  function stepStatus(done: boolean, activeCondition: boolean): StepStatus {
    if (done) return 'completed';
    if (activeCondition) return 'active';
    return 'pending';
  }

  const steps: { label: string; status: StepStatus; detail?: string }[] = [
    { label: 'VPS Purchased', status: vpsPurchased ? 'completed' : 'pending', detail: env.vps_id ? `ID: ${env.vps_id}` : undefined },
    { label: 'OS Installed & Running', status: stepStatus(osInstalled, env.vps_status === 'installing' || env.vps_status === 'provisioning'), detail: env.vps_status === 'ready' ? 'Running' : env.vps_status },
    { label: 'Post-Install Script', status: postInstallDone ? 'completed' : postInstallRunning ? 'active' : (env.post_install_status === 'failed' ? 'failed' : 'pending') },
    { label: 'Domain DNS Configured', status: dnsConfigured ? 'completed' : 'pending' },
    { label: 'Health Checks', status: healthOk ? 'completed' : 'pending' },
  ];

  const completedCount = steps.filter(s => s.status === 'completed').length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Clickable header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <Activity className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-1">
          Setup Progress
        </h2>
        {allDone ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium mr-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Complete
          </span>
        ) : (
          <span className="text-xs text-gray-500 font-medium mr-2">
            {completedCount}/{steps.length}
          </span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          {/* Stepper */}
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <StepIcon status={step.status} />
                  {i < steps.length - 1 && (
                    <div className={cn('w-px h-6', step.status === 'completed' ? 'bg-emerald-600/40' : 'bg-gray-700')} />
                  )}
                </div>
                <div className="pb-4">
                  <span className={cn(
                    'text-sm font-medium',
                    step.status === 'completed' && 'text-emerald-400',
                    step.status === 'active' && 'text-blue-400',
                    step.status === 'failed' && 'text-red-400',
                    step.status === 'pending' && 'text-gray-500',
                  )}>
                    {step.label}
                  </span>
                  {step.detail && <span className="text-xs text-gray-500 ml-2 font-mono">{step.detail}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Action panels based on current step */}
          {vpsPurchased && osInstalled && !postInstallDone && !postInstallRunning && (
            <PostInstallPanel env={env} onChange={onChange} />
          )}

          {vpsPurchased && osInstalled && postInstallDone && !dnsConfigured && (
            <DnsSetupPanel env={env} onChange={onChange} />
          )}

          {vpsPurchased && osInstalled && postInstallDone && dnsConfigured && (
            <HealthCheckPanel env={env} onChange={onChange} />
          )}

          {allDone && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Environment is fully configured and operational.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <div className="w-5 h-5 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-emerald-400" /></div>;
    case 'active':
      return <div className="w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center"><Loader2 className="w-3 h-3 text-blue-400 animate-spin" /></div>;
    case 'failed':
      return <div className="w-5 h-5 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center"><AlertTriangle className="w-3 h-3 text-red-400" /></div>;
    default:
      return <div className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center"><Circle className="w-2.5 h-2.5 text-gray-600" /></div>;
  }
}

// --- Post-Install Panel ---

const DEFAULT_POST_INSTALL_URL = 'https://raw.githubusercontent.com/bzalk/jrp-supabase/main/scripts/hostinger-post-install.sh';

function PostInstallPanel({ env, onChange }: { env: LocalEnvironment; onChange: () => void | Promise<void> }) {
  const [scriptUrl, setScriptUrl] = useState(env.post_install_script_url || DEFAULT_POST_INSTALL_URL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleRecreate() {
    setSubmitting(true);
    setError('');
    try {
      await vpsProvisionService.recreateVps({
        local_environment_id: env.id,
        post_install_script_url: scriptUrl,
      });
      setShowConfirm(false);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recreate failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          Run Post-Install Script
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          The server is running but has not been configured with the deployment stack.
          This will <span className="text-amber-300">wipe the OS and reinstall</span> with the post-install script.
          The IP address is preserved.
        </p>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Post-install script URL</label>
        <input
          type="text"
          value={scriptUrl}
          onChange={e => setScriptUrl(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
          placeholder="https://..."
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!scriptUrl.trim() || submitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Recreate with script
        </button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Confirm Recreate</h3>
                <p className="text-sm text-gray-400 mt-2">
                  This will <span className="text-amber-300 font-medium">wipe all data</span> on the server and reinstall the operating system from scratch with the post-install script.
                  The IP address ({env.vps_ip}) will be preserved.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecreate}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Yes, recreate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Health Check Panel ---

function HealthCheckPanel({ env, onChange }: { env: LocalEnvironment; onChange: () => void | Promise<void> }) {
  const [results, setResults] = useState<HealthCheckResponse | null>(
    env.health_check_results as unknown as HealthCheckResponse | null
  );
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [rerunningPostInstall, setRerunningPostInstall] = useState(false);
  const [repairingSsl, setRepairingSsl] = useState(false);
  const [sslRepairResult, setSslRepairResult] = useState<{ status?: string; message?: string; ssh_command?: string; output?: string } | null>(null);
  const [repairProgressMsg, setRepairProgressMsg] = useState<string | null>(null);
  const [repairingSyncClient, setRepairingSyncClient] = useState(false);
  const [syncClientMajor, setSyncClientMajor] = useState('17');
  const [syncClientRepairResult, setSyncClientRepairResult] = useState<{ status?: string; message?: string; ssh_command?: string; output?: string } | null>(null);
  const [resettingVps, setResettingVps] = useState(false);
  const [resetVpsResult, setResetVpsResult] = useState<{ status?: string; message?: string; ssh_command?: string; output?: string } | null>(null);
  const [resetProgressMsg, setResetProgressMsg] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checks = results ? [
    { label: 'TCP Port 443', ok: results.tcp_443 },
    { label: 'Supabase API', ok: results.supabase_api, detail: results.supabase_api_error || (results.supabase_api_status ? `Status ${results.supabase_api_status}` : undefined) },
    { label: 'Studio', ok: results.studio, detail: results.studio_error || (results.studio_status ? `Status ${results.studio_status}` : undefined) },
    { label: 'Auth', ok: results.auth, detail: results.auth_error || (results.auth_status ? `Status ${results.auth_status}` : undefined) },
    { label: 'Sync API', ok: results.sync_api, detail: results.sync_api_error || (results.sync_api_status ? `Status ${results.sync_api_status}` : undefined) },
  ] : [];

  const hasFailures = checks.some(c => !c.ok);
  const hasDnsErrors = checks.some(c => !c.ok && c.detail?.includes('dns error'));
  const hasConnectionRefused = checks.some(c => !c.ok && c.detail?.includes('Connection refused'));
  const tcpOk = results?.tcp_443;
  // SSL issue: TCP works but HTTPS service endpoints fail (typically means certs were generated before DNS pointed correctly)
  const hasSslIssue = tcpOk && !hasDnsErrors && !hasConnectionRefused && hasFailures && !results?.supabase_api;

  async function runCheck() {
    setChecking(true);
    setError('');
    try {
      const res = await vpsProvisionService.runHealthCheck(env.id);
      setResults(res);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Health check failed');
    } finally {
      setChecking(false);
    }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const ev = await localEnvironmentsService.getLatestRepairSslEvent(env.id);
        if (ev) {
          setRepairProgressMsg(ev.message);
          if (ev.status === 'succeeded' || ev.status === 'failed') {
            stopPolling();
          }
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => { return () => { stopPolling(); stopResetPolling(); }; }, []);

  async function repairSsl() {
    setRepairingSsl(true);
    setError('');
    setSslRepairResult(null);
    setRepairProgressMsg('Connecting to server via SSH...');
    startPolling();
    try {
      const res = await vpsProvisionService.repairSsl(env.id);
      setSslRepairResult({ status: res.status, message: res.message, ssh_command: res.ssh_command, output: res.output });
    } catch (e: unknown) {
      const err = e as Error & { ssh_command?: string; output?: string };
      setSslRepairResult({
        status: 'failed',
        message: err.message || 'SSL repair failed',
        ssh_command: err.ssh_command,
        output: err.output,
      });
    } finally {
      setRepairingSsl(false);
      setRepairProgressMsg(null);
      stopPolling();
    }
  }

  async function repairSyncClient() {
    setRepairingSyncClient(true);
    setError('');
    setSyncClientRepairResult(null);
    try {
      const res = await vpsProvisionService.repairSyncApiClient(env.id, syncClientMajor);
      setSyncClientRepairResult({
        status: res.status,
        message: res.message,
        ssh_command: res.ssh_command,
        output: res.output,
      });
    } catch (e: unknown) {
      const err = e as Error & { ssh_command?: string; output?: string };
      setSyncClientRepairResult({
        status: 'failed',
        message: err.message || 'Sync API client repair failed',
        ssh_command: err.ssh_command,
        output: err.output,
      });
    } finally {
      setRepairingSyncClient(false);
    }
  }

  function startResetPolling() {
    stopResetPolling();
    resetPollRef.current = setInterval(async () => {
      try {
        const ev = await localEnvironmentsService.getLatestResetVpsEvent(env.id);
        if (ev) {
          setResetProgressMsg(ev.message);
          if (ev.status === 'succeeded' || ev.status === 'failed') {
            stopResetPolling();
          }
        }
      } catch { /* ignore polling errors */ }
    }, 4000);
  }

  function stopResetPolling() {
    if (resetPollRef.current) {
      clearInterval(resetPollRef.current);
      resetPollRef.current = null;
    }
  }

  async function resetVps() {
    setShowResetConfirm(false);
    setResettingVps(true);
    setError('');
    setResetVpsResult(null);
    setResetProgressMsg('Connecting to server via SSH...');
    startResetPolling();
    try {
      const res = await vpsProvisionService.resetVps(env.id);
      setResetVpsResult({ status: res.status, message: res.message, ssh_command: res.ssh_command, output: res.output });
    } catch (e: unknown) {
      const err = e as Error & { ssh_command?: string; output?: string };
      setResetVpsResult({
        status: 'failed',
        message: err.message || 'VPS reset failed',
        ssh_command: err.ssh_command,
        output: err.output,
      });
    } finally {
      setResettingVps(false);
      setResetProgressMsg(null);
      stopResetPolling();
    }
  }

  // Do NOT auto-trigger SSL repair - let user initiate via button
  // The repair is available in the SSL Certificate Issue card and Troubleshooting actions

  async function rerunPostInstall() {
    setRerunningPostInstall(true);
    setError('');
    try {
      await vpsProvisionService.resumeSetup({ local_environment_id: env.id });
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to re-run post-install');
    } finally {
      setRerunningPostInstall(false);
    }
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          Service Health Checks
        </h3>
        <button
          onClick={runCheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium rounded-lg transition-colors"
        >
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Check now
        </button>
      </div>

      {results ? (
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className="flex items-center gap-3 text-sm">
              {c.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span className={c.ok ? 'text-gray-200' : 'text-red-300'}>{c.label}</span>
              {c.detail && <span className={`text-xs font-mono max-w-md truncate ${c.ok ? 'text-gray-500' : 'text-red-400/70'}`}>{c.detail}</span>}
            </div>
          ))}
          {env.last_health_check_at && (
            <p className="text-xs text-gray-600 pt-1">Last checked: {new Date(env.last_health_check_at).toLocaleString()}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No health checks run yet. Click "Check now" to probe the server.</p>
      )}

      {/* SSL repair status */}
      {(repairingSsl || sslRepairResult) && (
        <div className={`border rounded-lg px-3 py-2.5 text-xs space-y-2 ${
          sslRepairResult?.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' :
          sslRepairResult?.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
          'bg-blue-500/5 border-blue-500/20'
        }`}>
          {repairingSsl && (
            <p className="text-blue-300 font-medium flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {repairProgressMsg || 'Running SSL repair script on server via SSH...'}
            </p>
          )}
          {sslRepairResult?.message && (
            <p className={
              sslRepairResult.status === 'completed' ? 'text-emerald-300 font-medium' :
              sslRepairResult.status === 'failed' ? 'text-red-300 font-medium' :
              'text-blue-300'
            }>{sslRepairResult.message}</p>
          )}
          {sslRepairResult?.output && (
            <details className="mt-2" open>
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                Script output
              </summary>
              <pre className="mt-1.5 text-[11px] text-gray-400 font-mono bg-gray-900 border border-gray-700 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                {sslRepairResult.output}
              </pre>
            </details>
          )}
          {sslRepairResult?.ssh_command && !sslRepairResult?.output && (
            <div className="mt-2 space-y-1">
              <p className="text-gray-400">If automated repair fails, run this command manually via SSH:</p>
              <p className="text-gray-300 font-mono select-all bg-gray-900 px-2 py-1.5 rounded border border-gray-700 break-all">
                {sslRepairResult.ssh_command}
              </p>
            </div>
          )}
          {sslRepairResult?.status === 'failed' && !repairingSsl && (
            <button
              onClick={() => { setSslRepairResult(null); repairSsl(); }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry SSL Repair
            </button>
          )}
        </div>
      )}

      {/* Sync API Postgres client repair status */}
      {(repairingSyncClient || syncClientRepairResult) && (
        <div className={`border rounded-lg px-3 py-2.5 text-xs space-y-2 ${
          syncClientRepairResult?.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' :
          syncClientRepairResult?.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
          'bg-blue-500/5 border-blue-500/20'
        }`}>
          {repairingSyncClient && (
            <p className="text-blue-300 font-medium flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Rebuilding sync-api with PostgreSQL client {syncClientMajor}...
            </p>
          )}
          {syncClientRepairResult?.message && (
            <p className={
              syncClientRepairResult.status === 'completed' ? 'text-emerald-300 font-medium' :
              syncClientRepairResult.status === 'failed' ? 'text-red-300 font-medium' :
              'text-blue-300'
            }>{syncClientRepairResult.message}</p>
          )}
          {syncClientRepairResult?.output && (
            <details className="mt-2" open={syncClientRepairResult.status === 'failed'}>
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                Script output
              </summary>
              <pre className="mt-1.5 text-[11px] text-gray-400 font-mono bg-gray-900 border border-gray-700 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                {syncClientRepairResult.output}
              </pre>
            </details>
          )}
          {syncClientRepairResult?.ssh_command && !syncClientRepairResult?.output && (
            <div className="mt-2 space-y-1">
              <p className="text-gray-400">If automated repair fails, run this command manually via SSH:</p>
              <p className="text-gray-300 font-mono select-all bg-gray-900 px-2 py-1.5 rounded border border-gray-700 break-all">
                {syncClientRepairResult.ssh_command}
              </p>
            </div>
          )}
          {syncClientRepairResult?.status === 'failed' && !repairingSyncClient && (
            <button
              onClick={() => { setSyncClientRepairResult(null); repairSyncClient(); }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry Sync API Client Repair
            </button>
          )}
        </div>
      )}

      {/* VPS Reset status */}
      {(resettingVps || resetVpsResult) && (
        <div className={`border rounded-lg px-3 py-2.5 text-xs space-y-2 ${
          resetVpsResult?.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' :
          resetVpsResult?.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
          'bg-blue-500/5 border-blue-500/20'
        }`}>
          {resettingVps && (
            <div className="space-y-1.5">
              <p className="text-blue-300 font-medium flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {resetProgressMsg || 'Running full VPS reset...'}
              </p>
              <p className="text-gray-500 text-[11px]">This may take 5-15 minutes. Do not close this page.</p>
            </div>
          )}
          {resetVpsResult?.message && (
            <p className={
              resetVpsResult.status === 'completed' ? 'text-emerald-300 font-medium' :
              resetVpsResult.status === 'failed' ? 'text-red-300 font-medium' :
              'text-blue-300'
            }>{resetVpsResult.message}</p>
          )}
          {resetVpsResult?.output && (
            <details className="mt-2" open>
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">
                Script output
              </summary>
              <pre className="mt-1.5 text-[11px] text-gray-400 font-mono bg-gray-900 border border-gray-700 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                {resetVpsResult.output}
              </pre>
            </details>
          )}
          {resetVpsResult?.ssh_command && !resetVpsResult?.output && (
            <div className="mt-2 space-y-1">
              <p className="text-gray-400">If automated reset fails, run this command manually via SSH:</p>
              <p className="text-gray-300 font-mono select-all bg-gray-900 px-2 py-1.5 rounded border border-gray-700 break-all">
                {resetVpsResult.ssh_command}
              </p>
            </div>
          )}
          {resetVpsResult?.status === 'failed' && !resettingVps && (
            <button
              onClick={() => { setResetVpsResult(null); resetVps(); }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry Reset
            </button>
          )}
        </div>
      )}

      {/* Diagnostic guidance and maintenance actions */}
      {(results || env.vps_ip) && (
        <div className="space-y-3 pt-2 border-t border-gray-800">
          {hasFailures && (
            <>
              {hasSslIssue && !repairingSsl && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs space-y-2">
                  <p className="text-amber-300 font-medium">SSL Certificate Issue</p>
                  <p className="text-gray-400">The server is reachable but HTTPS connections are failing. This usually means SSL certificates were generated before DNS was properly configured. A server restart will trigger Traefik to re-request valid certificates.</p>
                  <button
                    onClick={() => { setSslRepairResult(null); repairSsl(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
                  >
                    <Wrench className="w-3 h-3" />
                    Run SSL Repair
                  </button>
                </div>
              )}
              {hasDnsErrors && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <p className="text-amber-300 font-medium">DNS not resolving</p>
                  <p className="text-gray-400">The subdomains are not resolving to your server yet. This typically takes 1-5 minutes after configuring DNS records. If you just set them up, wait a few minutes and try again.</p>
                </div>
              )}
              {!hasDnsErrors && !hasSslIssue && hasConnectionRefused && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <p className="text-amber-300 font-medium">Connection refused</p>
                  <p className="text-gray-400">DNS resolves but services are refusing connections. The post-install script may not have completed successfully, or services haven't started yet. Try re-running the post-install script.</p>
                </div>
              )}
              {!hasDnsErrors && !hasSslIssue && !hasConnectionRefused && tcpOk && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <p className="text-amber-300 font-medium">Services partially responding</p>
                  <p className="text-gray-400">The server is reachable on port 443 but some services are not responding correctly. This may indicate the services are still starting up or need to be reconfigured.</p>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => setShowDebug(!showDebug)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" />
            {showDebug ? 'Hide troubleshooting' : 'Troubleshooting actions'}
          </button>

          {showDebug && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-3">
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-medium">Available actions:</p>

                <button
                  onClick={repairSsl}
                  disabled={repairingSsl}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
                >
                  <ShieldCheck className="w-4 h-4 text-gray-500 group-hover:text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 font-medium">Repair SSL Certificates</p>
                    <p className="text-xs text-gray-500">Restart server to trigger Traefik certificate renewal</p>
                  </div>
                  {repairingSsl && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
                </button>

                <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                  <Download className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 font-medium">Repair Sync API pg_dump</p>
                    <p className="text-xs text-gray-500">Rebuild sync-api with the selected PostgreSQL client version</p>
                  </div>
                  <select
                    value={syncClientMajor}
                    onChange={(e) => setSyncClientMajor(e.target.value)}
                    disabled={repairingSyncClient}
                    className="h-8 rounded-md bg-gray-950 border border-gray-700 px-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="PostgreSQL client version"
                  >
                    <option value="17">Postgres 17</option>
                    <option value="16">Postgres 16</option>
                  </select>
                  <button
                    onClick={repairSyncClient}
                    disabled={repairingSyncClient}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-xs text-gray-100 font-medium transition-colors"
                  >
                    {repairingSyncClient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Repair
                  </button>
                </div>

                <button
                  onClick={rerunPostInstall}
                  disabled={rerunningPostInstall}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
                >
                  <Terminal className="w-4 h-4 text-gray-500 group-hover:text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 font-medium">Re-run Post-Install Script</p>
                    <p className="text-xs text-gray-500">Reinstall OS and re-run setup from scratch</p>
                  </div>
                  {rerunningPostInstall && <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />}
                </button>

                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={resettingVps}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 border border-red-900/40 rounded-lg text-left transition-colors group"
                >
                  <RotateCcw className="w-4 h-4 text-red-500/70 group-hover:text-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-red-300 font-medium">Reset VPS (Full Reinstall)</p>
                    <p className="text-xs text-gray-500">Tears down all containers, removes data, and runs a fresh install</p>
                  </div>
                  {resettingVps && <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />}
                </button>

                <a
                  href={`https://${env.full_hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 font-medium">Open in Browser</p>
                    <p className="text-xs text-gray-500">Visit {env.full_hostname} directly to inspect response</p>
                  </div>
                </a>

                <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                  <p className="text-xs text-gray-300 font-medium flex items-center gap-2">
                    <Server className="w-4 h-4 text-gray-500" />
                    SSH into server
                  </p>
                  <p className="text-xs text-gray-500 mt-1 font-mono select-all">ssh root@{env.vps_ip}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Reset VPS Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">Reset VPS</h3>
            </div>
            <p className="text-sm text-gray-300 mb-2">
              This will completely destroy all containers, volumes, and data on the server and run a fresh install from scratch.
            </p>
            <p className="text-sm text-red-400 font-medium mb-6">
              This action cannot be undone. The process may take 5-15 minutes.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resetVps}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Yes, Reset Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- DNS Setup Panel ---

type DnsMethod = 'netlify' | 'manual';

function DnsSetupPanel({ env, onChange }: { env: LocalEnvironment; onChange: () => void | Promise<void> }) {
  const [method, setMethod] = useState<DnsMethod>('netlify');
  const [verifying, setVerifying] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [netlifyToken, setNetlifyToken] = useState('');
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [tokenPersisted, setTokenPersisted] = useState(false);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [configResults, setConfigResults] = useState<Array<{ hostname: string; status: string; message?: string }>>([]);

  const baseDomain = localEnvironmentsService.serviceBaseDomain(env);
  const ip = env.vps_ip;
  const records = [
    { type: 'A', name: baseDomain, value: ip },
    { type: 'A', name: localEnvironmentsService.serviceHostname('supabase', env), value: ip },
    { type: 'A', name: localEnvironmentsService.serviceHostname('studio', env), value: ip },
    { type: 'A', name: localEnvironmentsService.serviceHostname('auth', env), value: ip },
    { type: 'A', name: localEnvironmentsService.serviceHostname('sync-api', env), value: ip },
  ].filter(record => record.name);

  useEffect(() => {
    settingsService.getProviderConfig().then(cfg => {
      if (cfg.netlify_api_token) {
        setNetlifyToken(cfg.netlify_api_token);
        setTokenPersisted(true);
      }
      setTokenLoaded(true);
    }).catch(() => setTokenLoaded(true));
  }, []);

  function copy(val: string, label: string) {
    navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  async function saveToken() {
    if (!netlifyToken.trim()) return;
    setTokenSaving(true);
    try {
      await settingsService.saveProviderConfig({ netlify_api_token: netlifyToken.trim() });
      setTokenPersisted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save token');
    } finally {
      setTokenSaving(false);
    }
  }

  async function configureNetlifyDns() {
    if (!netlifyToken.trim()) {
      setError('Please enter your Netlify API token first.');
      return;
    }
    setConfiguring(true);
    setError('');
    setConfigResults([]);
    try {
      if (!tokenPersisted) {
        await settingsService.saveProviderConfig({ netlify_api_token: netlifyToken.trim() });
        setTokenPersisted(true);
      }
      const res = await vpsProvisionService.configureDnsNetlify(env.id);
      setConfigResults(res.records || []);
      if (res.all_configured) {
        await onChange();
      } else {
        setError('Some records could not be configured. See details below.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DNS configuration failed');
    } finally {
      setConfiguring(false);
    }
  }

  async function verifyDns() {
    setVerifying(true);
    setError('');
    try {
      const healthRes = await vpsProvisionService.runHealthCheck(env.id);
      if (healthRes.supabase_api || healthRes.sync_api || healthRes.tcp_443) {
        await localEnvironmentsService.updateLocalEnvironment(env.id, {
          dns_a_record_verified_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>);
        await onChange();
      } else {
        setError('DNS does not appear to resolve to this server yet. Services are not reachable via domain. Please check your DNS records and allow time for propagation.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          Configure DNS A Records
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Point <span className="font-mono text-gray-300">{baseDomain}</span> and service subdomains to <span className="font-mono text-gray-300">{ip}</span>.
        </p>
      </div>

      {/* Method toggle */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-lg w-fit">
        <button
          onClick={() => setMethod('netlify')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            method === 'netlify' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300',
          )}
        >
          Netlify DNS
        </button>
        <button
          onClick={() => setMethod('manual')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            method === 'manual' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300',
          )}
        >
          Manual Setup
        </button>
      </div>

      {/* Netlify DNS method */}
      {method === 'netlify' && (
        <div className="space-y-3">
          {tokenLoaded && !tokenPersisted && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                Enter your Netlify personal access token. This will be saved to your settings for future use.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={netlifyToken}
                  onChange={e => setNetlifyToken(e.target.value)}
                  placeholder="nfp_..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                />
                <button
                  onClick={saveToken}
                  disabled={!netlifyToken.trim() || tokenSaving}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                >
                  {tokenSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {tokenLoaded && tokenPersisted && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Netlify API token configured
              </div>

              <p className="text-xs text-gray-400">
                This will create A records in your Netlify DNS zone for <span className="font-mono text-gray-300">{baseDomain}</span> pointing to <span className="font-mono text-gray-300">{ip}</span>.
                Existing records will be left untouched.
              </p>

              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">Records to create:</p>
                <div className="space-y-1">
                  {records.map((r, i) => (
                    <div key={i} className="text-xs font-mono text-gray-300">
                      {r.type} &nbsp; {r.name} &rarr; {r.value}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {configResults.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-1">
              {configResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.status === 'created' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {r.status === 'exists' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                  {r.status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                  <span className="font-mono text-gray-300">{r.hostname}</span>
                  <span className={cn(
                    'text-xs',
                    r.status === 'created' && 'text-emerald-400',
                    r.status === 'exists' && 'text-blue-400',
                    r.status === 'error' && 'text-red-400',
                  )}>
                    {r.status === 'created' && 'Created'}
                    {r.status === 'exists' && 'Already exists'}
                    {r.status === 'error' && (r.message || 'Failed')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual method */}
      {method === 'manual' && (
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-800">
            <div className="grid grid-cols-[60px_1fr_1fr] px-3 py-2 text-xs text-gray-500 uppercase tracking-wider">
              <span>Type</span>
              <span>Name</span>
              <span>Value</span>
            </div>
            {records.map((r, i) => (
              <div key={i} className="grid grid-cols-[60px_1fr_1fr] items-center px-3 py-2 text-sm">
                <span className="text-gray-400 text-xs font-mono">{r.type}</span>
                <span className="text-gray-200 font-mono text-xs truncate pr-2">{r.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-200 font-mono text-xs">{r.value}</span>
                  <button onClick={() => copy(r.value, `r${i}`)} className="p-0.5 text-gray-600 hover:text-gray-400">
                    {copied === `r${i}` ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500">
            Create these A records in your DNS provider. Once configured, click Verify to confirm resolution.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      <div className="flex justify-end">
        {method === 'netlify' ? (
          <button
            onClick={configureNetlifyDns}
            disabled={configuring || !netlifyToken.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {configuring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            Configure DNS
          </button>
        ) : (
          <button
            onClick={verifyDns}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Verify DNS
          </button>
        )}
      </div>
    </div>
  );
}

// --- Provisioning Log ---

function ProvisioningLogSection({ envId }: { envId: string }) {
  const [events, setEvents] = useState<ProvisioningJob[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    localEnvironmentsService.listProvisioningJobs(envId)
      .then(setEvents)
      .catch(() => {});
  }, [envId]);

  if (events.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <Terminal className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex-1">
          Provision Log
        </h2>
        <span className="text-xs text-gray-500 font-mono mr-2">{events.length} events</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-500 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-5 pb-5">
          <div className="bg-gray-950 border border-gray-800 rounded-lg max-h-64 overflow-y-auto font-mono text-xs">
            {events.map(ev => (
              <div key={ev.id} className="flex items-baseline gap-3 px-3 py-1.5 border-b border-gray-800/50 last:border-b-0">
                <span className="text-gray-600 whitespace-nowrap flex-shrink-0">{new Date(ev.created_at).toLocaleTimeString()}</span>
                <span className="text-gray-300">{ev.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Danger Zone Section ---

function DangerZoneSection({ env, onDelete, onChange }: { env: LocalEnvironment; onDelete: () => void; onChange: () => void | Promise<void> }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ status?: string; message?: string; output?: string } | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canReset = env.vps_status === 'ready' && !!env.vps_ip;

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const ev = await localEnvironmentsService.getLatestResetVpsEvent(env.id);
        if (ev) {
          setProgressMsg(ev.message);
          if (ev.status === 'succeeded' || ev.status === 'failed') stopPolling();
        }
      } catch { /* ignore */ }
    }, 4000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => { return () => stopPolling(); }, []);

  async function handleReset() {
    setShowResetConfirm(false);
    setResetting(true);
    setResetResult(null);
    setProgressMsg('Connecting to server via SSH...');
    startPolling();
    try {
      const res = await vpsProvisionService.resetVps(env.id);
      setResetResult({ status: res.status, message: res.message, output: res.output });
      await onChange();
    } catch (e: unknown) {
      const err = e as Error & { output?: string };
      setResetResult({ status: 'failed', message: err.message || 'Reset failed', output: err.output });
    } finally {
      setResetting(false);
      setProgressMsg(null);
      stopPolling();
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Danger Zone
      </h3>

      <div className="border border-red-500/20 rounded-xl overflow-hidden divide-y divide-red-500/10">
        {/* Reset Server row */}
        {canReset && (
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-200">Reset Server</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Completely tears down all containers, volumes, and data on the server, then runs a fresh install from scratch. This process takes 5-15 minutes and cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 hover:bg-red-600/10 text-red-400 text-sm font-medium rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reset Server
            </button>
          </div>
        )}

        {/* Delete environment row */}
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-200">Delete environment</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Removes this environment record and its provisioning history. The provisioned server (if any) is not destroyed automatically.
            </p>
          </div>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 hover:bg-red-600/10 text-red-400 text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Reset progress/result feedback */}
      {(resetting || resetResult) && (
        <div className={cn(
          'border rounded-lg px-4 py-3 text-xs space-y-2',
          resetResult?.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' :
          resetResult?.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
          'bg-blue-500/5 border-blue-500/20',
        )}>
          {resetting && (
            <div className="space-y-1">
              <p className="text-blue-300 font-medium flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {progressMsg || 'Running full VPS reset...'}
              </p>
              <p className="text-gray-500 text-[11px]">This may take 5-15 minutes. Do not close this page.</p>
            </div>
          )}
          {resetResult?.message && (
            <p className={cn(
              'font-medium',
              resetResult.status === 'completed' && 'text-emerald-300',
              resetResult.status === 'failed' && 'text-red-300',
            )}>{resetResult.message}</p>
          )}
          {resetResult?.output && (
            <details className="mt-2" open>
              <summary className="text-gray-400 cursor-pointer hover:text-gray-300 transition-colors">Script output</summary>
              <pre className="mt-1.5 text-[11px] text-gray-400 font-mono bg-gray-900 border border-gray-700 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                {resetResult.output}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <ResetServerModal
          env={env}
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={handleReset}
        />
      )}
    </div>
  );
}

// --- Reset Server Modal ---

function ResetServerModal({ env, onCancel, onConfirm }: { env: LocalEnvironment; onCancel: () => void; onConfirm: () => void }) {
  const [token, setToken] = useState(env.sync_api_token || '');
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      const fresh = localEnvironmentsService.generateSyncApiToken();
      setToken(fresh);
      localEnvironmentsService.updateLocalEnvironment(env.id, { sync_api_token: fresh } as Record<string, unknown>).catch(() => {});
    }
  }, []);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const newToken = await localEnvironmentsService.regenerateSyncToken(env.id);
      setToken(newToken);
    } catch { /* ignore */ }
    setRegenerating(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-100">Reset Server</h3>
        </div>

        <p className="text-sm text-gray-300">
          This will completely destroy all containers, volumes, and data on the server and run a fresh install from scratch.
          The environment will return to the post-install setup step.
        </p>

        {/* Sync API Token */}
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">Sync API Token</span>
          </div>
          <p className="text-xs text-gray-500">
            This token authenticates requests to your sync-api server. Copy it now if you need it for your records.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={token}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono select-all focus:outline-none focus:border-gray-600"
            />
            <button
              onClick={handleCopy}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
              title="Copy token"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
              title="Generate new token"
            >
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <p className="text-sm text-red-400 font-medium">
          This action cannot be undone. The process may take 5-15 minutes.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
          >
            Yes, Reset Server
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Confirm Delete Modal ---

function ConfirmDeleteModal({
  name, deleting, onCancel, onConfirm,
}: { name: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <button onClick={onCancel} className="p-1 text-gray-500 hover:text-gray-300 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Delete this environment?</h3>
          <p className="text-sm text-gray-400 mt-2">
            This removes <span className="font-mono text-gray-200">{name}</span> and its provisioning history.
            Any provisioned server is not destroyed automatically and may continue to incur charges.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={deleting} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Next Steps Section ---

function NextStepsSection({ env, onChange }: { env: LocalEnvironment; onChange: () => void | Promise<void> }) {
  const [binding, setBinding] = useState<LocalEnvironmentBinding | null | undefined>(undefined);
  const [showWizard, setShowWizard] = useState(false);
  const [settingLocalFirst, setSettingLocalFirst] = useState(false);

  const healthOk = env.health_check_results && (env.health_check_results as Record<string, unknown>).supabase_api === true;

  useEffect(() => {
    if (!healthOk) return;
    localEnvironmentsService.getBindingForEnvironment(env.id)
      .then(setBinding)
      .catch(() => setBinding(null));
  }, [env.id, healthOk]);

  if (!healthOk) return null;

  async function handleSetLocalFirst() {
    setSettingLocalFirst(true);
    try {
      await localEnvironmentsService.setConnectionMode(env.id, 'local_first');
      await onChange();
    } catch {
      setSettingLocalFirst(false);
    }
  }

  function handleConnected(newBinding: LocalEnvironmentBinding) {
    setBinding(newBinding);
    setShowWizard(false);
    onChange();
  }

  function handleDisconnected() {
    setBinding(null);
    onChange();
  }

  if (binding === undefined) return null;

  if (binding) {
    return (
      <div className="space-y-6">
        <ConnectedProjectCard env={env} binding={binding} onDisconnected={handleDisconnected} />
        <SyncOperationsPanel env={env} binding={binding} />
      </div>
    );
  }

  if (showWizard) {
    return (
      <ConnectProjectWizard
        env={env}
        onComplete={handleConnected}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  if (env.connection_mode === 'local_first') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Rocket className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Local-First Project</h3>
            <p className="text-xs text-gray-500">Building locally. Connect a production project when you are ready.</p>
          </div>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/30 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Connect Production Project
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white">Set Up This Local Environment</h3>
        <p className="text-sm text-gray-400 mt-1">Choose how this local environment should be used.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setShowWizard(true)}
          className="flex flex-col items-start gap-3 p-5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-emerald-500/30 rounded-xl text-left transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/15 transition-colors">
            <Download className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
              Clone an Existing Supabase Project
            </div>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Pull schema and optional data from an existing hosted Supabase project into this local environment.
            </p>
          </div>
        </button>

        <button
          onClick={handleSetLocalFirst}
          disabled={settingLocalFirst}
          className="flex flex-col items-start gap-3 p-5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-sky-500/30 rounded-xl text-left transition-all group disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/15 transition-colors">
            <Rocket className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
              Start as a New Local Project
            </div>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Use this environment as the source of truth for development now. Connect or create a hosted production project later.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
