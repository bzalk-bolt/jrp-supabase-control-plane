import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Server, Plus, Globe, ShieldCheck, Copy, RefreshCw, ArrowLeft, ArrowRight,
  AlertCircle, CheckCircle2, Clock, Loader2, Cpu, HardDrive, MemoryStick, Cloud,
} from 'lucide-react';
import { localEnvironmentsService, dnsVerifyService, vpsProvisionService } from '../services';
import type { DomainVerification, LocalEnvironment, LocalEnvironmentBinding, ProvisioningJob } from '../types/api';
import type { ProviderPlan, ProviderDataCenter } from '../services/vpsProvisionService';
import EnvironmentDetailPanel from '../components/EnvironmentDetailPanel';

type WizardStep = 'domain' | 'verify' | 'plan' | 'provision' | 'done';

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function isValidApex(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(trimmed);
}

function isValidEnvironmentNamespace(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed);
}

export default function LocalEnvironments() {
  const { id } = useParams();
  if (id === 'new') return <CreateLocalEnvironmentWizard />;
  if (id) return <LocalEnvironmentDetail id={id} />;
  return <LocalEnvironmentsList />;
}

function LocalEnvironmentsList() {
  const [items, setItems] = useState<LocalEnvironment[] | null>(null);
  const [bindings, setBindings] = useState<LocalEnvironmentBinding[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    localEnvironmentsService.listLocalEnvironments()
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'));
    localEnvironmentsService.listBindings()
      .then(setBindings)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Local Environments</h1>
          <p className="text-sm text-gray-400 mt-1">Self-hosted Supabase development environments running on dedicated VPS infrastructure.</p>
        </div>
        <Link
          to="/local-environments/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New local environment
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {items === null ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(env => (
            <LocalEnvironmentCard
              key={env.id}
              env={env}
              binding={bindings.find(b => b.local_environment_id === env.id) || null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10">
      <div className="max-w-lg mx-auto text-center">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Server className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">No local environments yet</h2>
        <p className="text-sm text-gray-400 mt-2">
          Spin up your first VPS to host sync-api on a domain you own. We will verify
          the domain via a TXT record before we provision anything.
        </p>
        <Link
          to="/local-environments/new"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create local environment
        </Link>
      </div>
    </div>
  );
}

function statusStyle(status: LocalEnvironment['vps_status']) {
  switch (status) {
    case 'ready': return { label: 'Ready', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 };
    case 'failed': return { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: AlertCircle };
    case 'destroyed': return { label: 'Destroyed', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20', Icon: AlertCircle };
    case 'awaiting_dns': return { label: 'Awaiting DNS', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: Clock };
    case 'initial': return { label: 'Needs Setup', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: AlertCircle };
    case 'provisioning':
    case 'installing':
    case 'configuring_dns':
    case 'configuring_netlify':
      return { label: status.replace('_', ' '), cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', Icon: Loader2 };
    default: return { label: 'Pending', cls: 'bg-gray-700/40 text-gray-300 border-gray-600/40', Icon: Clock };
  }
}

function LocalEnvironmentCard({ env, binding }: { env: LocalEnvironment; binding: LocalEnvironmentBinding | null }) {
  const s = statusStyle(env.vps_status);
  const Icon = s.Icon;
  const verified = !!env.dns_verified_at;
  return (
    <Link
      to={`/local-environments/${env.id}`}
      className="group bg-gray-900 border border-gray-800 hover:border-emerald-500/40 rounded-2xl p-5 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Server className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{env.name || env.full_hostname || 'Untitled'}</div>
            <div className="text-xs text-gray-400 font-mono truncate">{env.full_hostname || env.apex_domain}</div>
          </div>
        </div>
        <span className={classNames('inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium uppercase tracking-wider', s.cls)}>
          <Icon className={classNames('w-3 h-3', /provisioning|installing|configuring/.test(env.vps_status) && 'animate-spin')} />
          {s.label}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs flex-wrap">
        <span className={classNames('inline-flex items-center gap-1', verified ? 'text-emerald-400' : 'text-gray-500')}>
          <ShieldCheck className="w-3.5 h-3.5" />
          {verified ? 'Domain verified' : 'Domain not verified'}
        </span>
        {env.vps_ip && (
          <span className="text-gray-500 font-mono truncate">{env.vps_ip}</span>
        )}
        {binding ? (
          <span className="inline-flex items-center gap-1 text-blue-400">
            <Cloud className="w-3.5 h-3.5" />
            Connected to {binding.remote_organization_name || binding.remote_project_ref}
          </span>
        ) : env.connection_mode === 'local_first' ? (
          <span className="text-sky-400/70">Local-first</span>
        ) : env.vps_status === 'ready' ? (
          <span className="text-amber-400/70">Not connected</span>
        ) : null}
      </div>
    </Link>
  );
}

function CreateLocalEnvironmentWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('domain');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [apex, setApex] = useState('');
  const [environmentNamespace, setEnvironmentNamespace] = useState('');

  const [verification, setVerification] = useState<DomainVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const [lookupRecords, setLookupRecords] = useState<string[] | null>(null);
  const [created, setCreated] = useState<LocalEnvironment | null>(null);

  const apexValid = isValidApex(apex);
  const namespaceValid = isValidEnvironmentNamespace(environmentNamespace);
  const canContinueDomain = apexValid && namespaceValid && name.trim().length > 0;

  async function goToVerify() {
    setError('');
    try {
      const v = await localEnvironmentsService.upsertDomainVerification(apex);
      setVerification(v);
      setStep('verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start verification');
    }
  }

  async function checkVerification() {
    if (!verification) return;
    setChecking(true);
    setError('');
    setLookupRecords(null);
    try {
      const result = await dnsVerifyService.verifyDnsTxt({
        domain: verification.apex_domain,
        expectedToken: verification.token,
      });
      setLookupRecords(result.records);
      const nowIso = new Date().toISOString();
      if (result.matched) {
        const updated = await localEnvironmentsService.updateDomainVerification(verification.id, {
          status: 'verified',
          last_checked_at: nowIso,
          verified_at: nowIso,
        });
        setVerification(updated);
      } else {
        const updated = await localEnvironmentsService.updateDomainVerification(verification.id, {
          status: 'pending',
          last_checked_at: nowIso,
        });
        setVerification(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification check failed');
    } finally {
      setChecking(false);
    }
  }

  async function persistAndContinue() {
    setError('');
    try {
      const apexClean = apex.trim().toLowerCase();
      const namespaceClean = environmentNamespace.trim().toLowerCase();
      const fullHostname = localEnvironmentsService.composeFullHostname(namespaceClean, apexClean);
      const env = await localEnvironmentsService.createLocalEnvironment({
        name,
        apex_domain: apexClean,
        subdomain: namespaceClean,
        full_hostname: fullHostname,
        sync_api_url: localEnvironmentsService.syncApiUrlForEnvironment({
          apex_domain: apexClean,
          subdomain: namespaceClean,
          full_hostname: fullHostname,
        }),
        dns_verified_at: verification?.verified_at ?? null,
        vps_status: 'awaiting_dns',
      });
      setCreated(env);
      setStep('plan');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save local environment');
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/local-environments')}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">New local environment</h1>
          <p className="text-sm text-gray-400 mt-1">Provision a dedicated VPS bound to one remote Supabase project.</p>
        </div>
      </div>

      <Stepper step={step} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {step === 'domain' && (
        <DomainStep
          name={name}
          setName={setName}
          apex={apex}
          setApex={setApex}
          environmentNamespace={environmentNamespace}
          setEnvironmentNamespace={setEnvironmentNamespace}
          apexValid={apexValid}
          namespaceValid={namespaceValid}
          onContinue={goToVerify}
          canContinue={canContinueDomain}
        />
      )}

      {step === 'verify' && verification && (
        <VerifyStep
          verification={verification}
          fullHostname={apex}
          checking={checking}
          lookupRecords={lookupRecords}
          onCheck={checkVerification}
          onBack={() => setStep('domain')}
          onContinue={persistAndContinue}
        />
      )}

      {step === 'plan' && created && (
        <PlanStep
          env={created}
          onBack={() => setStep('verify')}
          onProvisioned={() => setStep('provision')}
        />
      )}

      {step === 'provision' && created && (
        <ProvisionProgress
          envId={created.id}
          onDone={() => navigate(`/local-environments/${created.id}`)}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: WizardStep }) {
  const steps: Array<{ key: WizardStep; label: string }> = [
    { key: 'domain', label: 'Domain' },
    { key: 'verify', label: 'Verify ownership' },
    { key: 'plan', label: 'VPS plan' },
    { key: 'provision', label: 'Provisioning' },
  ];
  const idx = steps.findIndex(s => s.key === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={classNames(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border',
              active && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
              done && 'bg-emerald-600 text-white border-emerald-600',
              !active && !done && 'bg-gray-900 text-gray-500 border-gray-800',
            )}>
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={classNames(
              'text-xs',
              active ? 'text-gray-200 font-medium' : done ? 'text-gray-400' : 'text-gray-600',
            )}>{s.label}</span>
            {i < steps.length - 1 && (
              <div className={classNames('w-10 h-px', done ? 'bg-emerald-600/40' : 'bg-gray-800')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DomainStep(props: {
  name: string; setName: (v: string) => void;
  apex: string; setApex: (v: string) => void;
  environmentNamespace: string; setEnvironmentNamespace: (v: string) => void;
  apexValid: boolean;
  namespaceValid: boolean;
  onContinue: () => void; canContinue: boolean;
}) {
  const baseHostname = props.apexValid && props.namespaceValid
    ? localEnvironmentsService.composeFullHostname(props.environmentNamespace, props.apex)
    : '';
  const generatedSubdomains = baseHostname
    ? ['supabase', 'studio', 'auth', 'sync-api'].map(sub => `${sub}.${baseHostname}`)
    : [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Display name</label>
        <input
          type="text"
          value={props.name}
          onChange={e => props.setName(e.target.value)}
          placeholder="e.g. Sports Management Production"
          className="w-full px-3 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Base domain</label>
        <input
          type="text"
          value={props.apex}
          onChange={e => props.setApex(e.target.value.toLowerCase())}
          placeholder="example.com"
          className={classNames(
            'w-full px-3 py-2.5 bg-gray-950 border rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none font-mono',
            !props.apex || props.apexValid ? 'border-gray-800 focus:border-emerald-600/50' : 'border-red-500/50',
          )}
        />
        {props.apex && !props.apexValid && (
          <p className="mt-1 text-xs text-red-400">Enter a valid domain like example.com</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Environment namespace</label>
        <input
          type="text"
          value={props.environmentNamespace}
          onChange={e => props.setEnvironmentNamespace(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="demo"
          className={classNames(
            'w-full px-3 py-2.5 bg-gray-950 border rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none font-mono',
            !props.environmentNamespace || props.namespaceValid ? 'border-gray-800 focus:border-emerald-600/50' : 'border-red-500/50',
          )}
        />
        {props.environmentNamespace && !props.namespaceValid && (
          <p className="mt-1 text-xs text-red-400">Use one DNS label: letters, numbers, and hyphens only.</p>
        )}
        {baseHostname && (
          <p className="mt-1 text-xs text-gray-500">
            This stack will use <span className="font-mono text-gray-300">{baseHostname}</span> as its environment base.
          </p>
        )}
      </div>

      {generatedSubdomains.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">Generated service hostnames</div>
          <div className="space-y-2">
            {generatedSubdomains.map(hostname => (
              <div key={hostname} className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="font-mono text-sm text-gray-200">{hostname}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">These subdomains will be configured automatically during provisioning.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={props.onContinue}
          disabled={!props.canContinue}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function VerifyStep(props: {
  verification: DomainVerification;
  fullHostname: string;
  checking: boolean;
  lookupRecords: string[] | null;
  onCheck: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const recordName = `_jamrock-verify.${props.verification.apex_domain}`;
  const verified = props.verification.status === 'verified';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Verify domain ownership
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Add this TXT record to <span className="font-mono text-gray-200">{props.verification.apex_domain}</span>.
          This proves ownership so we can configure service subdomains.
        </p>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
        <RecordRow label="Type" value="TXT" />
        <RecordRow label="Name" value={recordName} mono copy />
        <RecordRow label="Value" value={props.verification.token} mono copy />
        <RecordRow label="TTL" value="300" />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={props.onCheck}
          disabled={props.checking}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-100 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          {props.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Check now
        </button>
        {verified && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Verified
          </span>
        )}
        {props.verification.last_checked_at && !verified && (
          <span className="text-xs text-gray-500">
            Last checked {new Date(props.verification.last_checked_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {props.lookupRecords !== null && !verified && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
          <div className="font-medium mb-1">No matching TXT value yet.</div>
          {props.lookupRecords.length === 0 ? (
            <div className="text-amber-300/80">DNS returned no TXT records for {recordName}. It can take a few minutes for new records to propagate.</div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-amber-300/80">Found these TXT values, none matched:</div>
              {props.lookupRecords.map(r => (
                <div key={r} className="font-mono text-gray-400">{r}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={props.onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={props.onContinue}
          disabled={!verified}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function RecordRow({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-gray-500 w-12 flex-shrink-0">{label}</span>
      <span className={classNames('flex-1 text-sm text-gray-200 truncate', mono && 'font-mono')}>{value}</span>
      {copy && (
        <button
          onClick={doCopy}
          className="text-xs text-gray-400 hover:text-emerald-400 inline-flex items-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
    </div>
  );
}

function PlanStep({ env, onBack, onProvisioned }: { env: LocalEnvironment; onBack: () => void; onProvisioned: () => void }) {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<ProviderPlan[]>([]);
  const [dataCenters, setDataCenters] = useState<ProviderDataCenter[]>([]);
  const [defaultId, setDefaultId] = useState<string>('');
  const [selected, setSelected] = useState<string>('');
  const [selectedDc, setSelectedDc] = useState<string>('');
  const [configured, setConfigured] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [plansRes, dcRes] = await Promise.all([
          vpsProvisionService.listPlans(),
          vpsProvisionService.listDataCenters(),
        ]);
        if (cancelled) return;
        setConfigured(plansRes.configured);
        setPlans(plansRes.plans || []);
        setDefaultId('');
        setSelected(plansRes.plans?.[0]?.id || '');
        setDataCenters(dcRes.data_centers || []);
        if (dcRes.data_centers?.length) {
          setSelectedDc(dcRes.data_centers[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load plans');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function provision() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await vpsProvisionService.startProvision({
        local_environment_id: env.id,
        plan_id: selected || undefined,
        datacenter_id: selectedDc || undefined,
      });
      onProvisioned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start provisioning');
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Choose a server size</h2>
        <p className="text-sm text-gray-400 mt-1">
          Domain verified. Pick the size for <span className="font-mono text-gray-200">{env.full_hostname}</span>.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading available sizes...
        </div>
      ) : !configured ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300">
          Server provisioning is not yet available on this account. Please reach out to support and we will enable it.
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-400 space-y-3">
          <div>No catalog returned a matching VPS plan. We will use the default configured by the platform.</div>
          {defaultId && (
            <div className="font-mono text-xs text-gray-500">Default plan id: {defaultId}</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plans.map(plan => {
            const active = selected === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                className={classNames(
                  'text-left bg-gray-950 border rounded-xl p-4 transition-all',
                  active ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-gray-800 hover:border-gray-700',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{plan.name || plan.id}</div>
                    {plan.description && (
                      <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{plan.description}</div>
                    )}
                  </div>
                  {plan.monthly_price !== null && (
                    <div className="text-sm font-semibold text-emerald-400 whitespace-nowrap">
                      {plan.currency || 'USD'} {plan.monthly_price?.toFixed(2)}<span className="text-xs text-gray-500">/mo</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                  {plan.cpu && <span className="inline-flex items-center gap-1"><Cpu className="w-3 h-3" />{plan.cpu}</span>}
                  {plan.memory && <span className="inline-flex items-center gap-1"><MemoryStick className="w-3 h-3" />{plan.memory}</span>}
                  {plan.storage && <span className="inline-flex items-center gap-1"><HardDrive className="w-3 h-3" />{plan.storage}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {dataCenters.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">Data center location</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {dataCenters.map(dc => {
              const active = selectedDc === dc.id;
              return (
                <button
                  key={dc.id}
                  type="button"
                  onClick={() => setSelectedDc(dc.id)}
                  className={classNames(
                    'text-left bg-gray-950 border rounded-lg px-3 py-2.5 transition-all',
                    active ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-gray-800 hover:border-gray-700',
                  )}
                >
                  <div className="text-xs font-semibold text-white">{dc.city || dc.name}</div>
                  {dc.country && <div className="text-[10px] text-gray-500 mt-0.5">{dc.country}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-gray-200 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={provision}
          disabled={submitting || !configured || !selected || !selectedDc}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Provision server
        </button>
      </div>
    </div>
  );
}

function ProvisionProgress({ envId, onDone }: { envId: string; onDone: () => void }) {
  const [env, setEnv] = useState<LocalEnvironment | null>(null);
  const [events, setEvents] = useState<ProvisioningJob[]>([]);
  const [error, setError] = useState<string>('');
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (stoppedRef.current) return;
      try {
        const [envRow, eventRows] = await Promise.all([
          localEnvironmentsService.getLocalEnvironment(envId),
          localEnvironmentsService.listProvisioningJobs(envId),
        ]);
        if (stoppedRef.current) return;
        setEnv(envRow);
        setEvents(eventRows);
        if (envRow && envRow.vps_status !== 'ready' && envRow.vps_status !== 'failed' && envRow.vps_status !== 'destroyed') {
          await vpsProvisionService.pollProvision(envId).catch(() => {});
        }
        if (envRow && (envRow.vps_status === 'ready' || envRow.vps_status === 'failed' || envRow.vps_status === 'destroyed')) {
          stoppedRef.current = true;
          return;
        }
      } catch (e) {
        if (!stoppedRef.current) {
          setError(e instanceof Error ? e.message : 'Polling failed');
        }
      }
      if (!stoppedRef.current) {
        timer = setTimeout(tick, 5000);
      }
    }

    tick();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [envId]);

  const latest = events[0];
  const percent = latest?.percent ?? (env?.vps_status === 'ready' ? 100 : 10);
  const isReady = env?.vps_status === 'ready';
  const isFailed = env?.vps_status === 'failed';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Provisioning your server</h2>
        <p className="text-sm text-gray-400 mt-1">
          This usually takes a few minutes. You can leave this page and come back; progress is saved.
        </p>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="uppercase tracking-wider">{env?.vps_status || 'starting'}</span>
          <span>{Math.round(percent)}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={classNames(
              'h-full transition-all duration-500',
              isFailed ? 'bg-red-500' : isReady ? 'bg-emerald-500' : 'bg-emerald-600/80',
            )}
            style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
          />
        </div>
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto space-y-1">
        {events.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Waiting for first event...
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="flex items-start gap-2 text-xs">
              <span className={classNames(
                'mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
                ev.status === 'succeeded' && 'bg-emerald-400',
                ev.status === 'failed' && 'bg-red-400',
                ev.status === 'running' && 'bg-blue-400',
                ev.status === 'queued' && 'bg-gray-500',
              )} />
              <span className="text-gray-500 font-mono w-12 flex-shrink-0">{ev.percent}%</span>
              <span className="text-gray-300 flex-1">{ev.message}</span>
              <span className="text-gray-600 font-mono">{new Date(ev.created_at).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>

      {env?.vps_ip && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-300">
          <span className="text-xs uppercase tracking-wider text-gray-500 mr-2">Server IP</span>
          <span className="font-mono text-gray-200">{env.vps_ip}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onDone}
          disabled={!isReady && !isFailed}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isReady ? 'Open environment' : isFailed ? 'View details' : 'Working...'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function LocalEnvironmentDetail({ id }: { id: string }) {
  return <EnvironmentDetailPanel id={id} />;
}
