import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Download,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Building2,
  FolderOpen,
  Database,
  Settings as SettingsIcon,
  ListChecks,
  Loader2,
  Info,
  ShieldAlert,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Play,
  Activity,
  TerminalSquare,
} from 'lucide-react';
import { syncApi, importPlansService, importJobEventsService, settingsService } from '../services';
import type {
  SupabaseOrganization,
  SupabaseProject,
  ImportPlanRequest,
  ImportPlanResponse,
  ImportPlanWarning,
  ImportPlanRecord,
  Job,
  ImportJobProgress,
  ImportPhase,
  PlatformToLocalImportRequest,
  EnvironmentCreateRequest,
} from '../types/api';

type StepKey =
  | 'account'
  | 'organization'
  | 'project'
  | 'connection'
  | 'target'
  | 'options'
  | 'review'
  | 'results'
  | 'execute'
  | 'running';

const STEPS: { key: StepKey; label: string; icon: typeof Cloud }[] = [
  { key: 'account', label: 'Account', icon: Cloud },
  { key: 'organization', label: 'Organization', icon: Building2 },
  { key: 'project', label: 'Project', icon: FolderOpen },
  { key: 'connection', label: 'Connection', icon: Database },
  { key: 'target', label: 'Target', icon: SettingsIcon },
  { key: 'options', label: 'Options', icon: ListChecks },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'results', label: 'Plan', icon: CheckCircle2 },
  { key: 'execute', label: 'Execute', icon: Play },
  { key: 'running', label: 'Run', icon: Activity },
];

interface ImportOptions {
  database_mode: 'schema-only' | 'schema-and-data';
  include_storage_bucket_metadata: boolean;
  include_edge_functions: boolean;
  include_auth_data: boolean;
  largest_table_limit: number;
}

const DEFAULT_OPTIONS: ImportOptions = {
  database_mode: 'schema-only',
  include_storage_bucket_metadata: true,
  include_edge_functions: true,
  include_auth_data: false,
  largest_table_limit: 25,
};

export default function Import() {
  const { planId, jobId: routeJobId } = useParams<{ planId?: string; jobId?: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<StepKey>('account');
  const [planRecord, setPlanRecord] = useState<ImportPlanRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(!!planId);
  const [error, setError] = useState('');

  // Account check
  const [hasPat, setHasPat] = useState<boolean | null>(null);

  // Org / project
  const [orgs, setOrgs] = useState<SupabaseOrganization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<SupabaseOrganization | null>(null);
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [selectedProject, setSelectedProject] = useState<SupabaseProject | null>(null);

  // Connection
  const [dbUrl, setDbUrl] = useState('');
  const [skipDbUrl, setSkipDbUrl] = useState(false);
  const [showDbUrl, setShowDbUrl] = useState(false);

  // Target (local container)
  const [targetEnv, setTargetEnv] = useState('local');
  const TARGET_CONTAINER = 'supabase-db';
  const [targetUser, setTargetUser] = useState('postgres');
  const [targetDbName, setTargetDbName] = useState('postgres');

  // Options
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);

  // Plan
  const [planning, setPlanning] = useState(false);
  const [planResponse, setPlanResponse] = useState<ImportPlanResponse | null>(null);
  const [planError, setPlanError] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  // Execute / Running
  const [activeJobId, setActiveJobId] = useState<string | null>(routeJobId || null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [autoEnvCreated, setAutoEnvCreated] = useState(false);

  // Load existing plan if editing
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    importPlansService.getImportPlan(planId)
      .then(rec => {
        if (cancelled || !rec) return;
        setPlanRecord(rec);
        if (rec.source_organization_id) {
          setSelectedOrg({
            id: rec.source_organization_id,
            name: rec.source_organization_name || rec.source_organization_id,
          });
        }
        if (rec.source_project_ref) {
          setSelectedProject({
            id: rec.source_project_ref,
            ref: rec.source_project_ref,
            name: rec.source_project_name || rec.source_project_ref,
            organization_id: rec.source_organization_id || undefined,
          });
        }
        if (rec.has_db_url && rec.plan_request?.source.db_url) {
          setDbUrl(rec.plan_request.source.db_url);
        } else if (!rec.has_db_url) {
          setSkipDbUrl(true);
        }
        if (rec.plan_request?.target) {
          const t = rec.plan_request.target;
          if (t.env) setTargetEnv(t.env);
          if (t.user) setTargetUser(t.user);
          if (t.db_name) setTargetDbName(t.db_name);
        }
        if (rec.database_mode) {
          setOptions(prev => ({ ...prev, database_mode: rec.database_mode! }));
        }
        if (rec.options && typeof rec.options === 'object') {
          const o = rec.options as Partial<ImportOptions>;
          setOptions(prev => ({ ...prev, ...o }));
        }
        if (rec.plan_response) {
          setPlanResponse(rec.plan_response);
          setStep('results');
        } else {
          setStep('review');
        }
        if (rec.job_id) {
          setActiveJobId(rec.job_id);
          if (routeJobId === rec.job_id) {
            setStep('running');
          } else if (!routeJobId && rec.last_status && rec.last_status !== 'succeeded' && rec.last_status !== 'failed') {
            setStep('running');
          }
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load plan'))
      .finally(() => { if (!cancelled) setLoadingRecord(false); });
    return () => { cancelled = true; };
  }, [planId, routeJobId]);

  // Account check
  useEffect(() => {
    let cancelled = false;
    const cached = syncApi.getSupabaseAccessTokenCache();
    if (cached) {
      setHasPat(true);
      return;
    }
    settingsService.getSupabaseAccessToken()
      .then(info => {
        if (cancelled) return;
        if (info.token) {
          syncApi.setSupabaseAccessTokenCache(info.token);
          setHasPat(true);
        } else {
          setHasPat(false);
        }
      })
      .catch(() => { if (!cancelled) setHasPat(false); });
    return () => { cancelled = true; };
  }, []);

  // Load orgs when entering org step
  useEffect(() => {
    if (step !== 'organization' || orgs.length > 0) return;
    setOrgsLoading(true);
    setOrgsError('');
    syncApi.listSupabaseOrganizations()
      .then(res => setOrgs(res.organizations || []))
      .catch(e => setOrgsError(e instanceof Error ? e.message : 'Failed to load organizations'))
      .finally(() => setOrgsLoading(false));
  }, [step, orgs.length]);

  // Load projects when org changes / on project step
  useEffect(() => {
    if (step !== 'project' || !selectedOrg) return;
    setProjectsLoading(true);
    setProjectsError('');
    syncApi.listSupabaseProjects(selectedOrg.id)
      .then(res => setProjects(res.projects || []))
      .catch(e => setProjectsError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setProjectsLoading(false));
  }, [step, selectedOrg]);

  function reloadOrgs() {
    setOrgs([]);
    setOrgsError('');
  }
  function reloadProjects() {
    if (!selectedOrg) return;
    setProjectsLoading(true);
    setProjectsError('');
    syncApi.listSupabaseProjects(selectedOrg.id)
      .then(res => setProjects(res.projects || []))
      .catch(e => setProjectsError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setProjectsLoading(false));
  }

  const stepIndex = STEPS.findIndex(s => s.key === step);

  function canAdvance(): boolean {
    switch (step) {
      case 'account': return !!hasPat;
      case 'organization': return !!selectedOrg;
      case 'project': return !!selectedProject;
      case 'connection': return skipDbUrl || dbUrl.trim().length > 0;
      case 'target': return targetEnv.trim().length > 0;
      case 'options': return true;
      case 'review': return true;
      case 'results': return !!planResponse;
      case 'execute': return false;
      case 'running': return false;
      default: return false;
    }
  }

  function nextStep() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.key);
  }
  function prevStep() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.key);
  }

  const effectiveOptions = useMemo<ImportOptions>(() => {
    if (options.database_mode === 'schema-and-data') {
      return { ...options, include_auth_data: true };
    }
    return options;
  }, [options]);

  const planRequest = useMemo<ImportPlanRequest | null>(() => {
    if (!selectedProject) return null;
    return {
      database_mode: effectiveOptions.database_mode,
      include_storage_bucket_metadata: effectiveOptions.include_storage_bucket_metadata,
      include_storage_objects: false,
      include_edge_functions: effectiveOptions.include_edge_functions,
      include_auth_data: effectiveOptions.include_auth_data,
      largest_table_limit: effectiveOptions.largest_table_limit,
      source: {
        type: 'platform',
        env: 'cloud',
        project_ref: selectedProject.ref,
        ...(skipDbUrl ? {} : { db_url: dbUrl.trim() }),
      },
      target: {
        type: 'local',
        env: targetEnv.trim() || 'local',
        container: TARGET_CONTAINER,
        user: targetUser.trim() || undefined,
        db_name: targetDbName.trim() || undefined,
      },
    };
  }, [selectedProject, effectiveOptions, skipDbUrl, dbUrl, targetEnv, targetUser, targetDbName]);

  async function persistDraft(extra?: { plan_response?: ImportPlanResponse; status?: ImportPlanRecord['status']; job_id?: string | null; last_status?: string | null; last_progress?: ImportJobProgress | null }) {
    if (!selectedProject) return null;
    const draft = {
      source_project_ref: selectedProject.ref,
      source_project_name: selectedProject.name,
      source_organization_id: selectedOrg?.id ?? null,
      source_organization_name: selectedOrg?.name ?? null,
      target_type: 'local',
      database_mode: effectiveOptions.database_mode,
      has_db_url: !skipDbUrl && dbUrl.trim().length > 0,
      options: {
        include_storage_bucket_metadata: effectiveOptions.include_storage_bucket_metadata,
        include_edge_functions: effectiveOptions.include_edge_functions,
        include_auth_data: effectiveOptions.include_auth_data,
        largest_table_limit: effectiveOptions.largest_table_limit,
      },
      plan_request: planRequest,
      plan_response: extra?.plan_response ?? planResponse ?? null,
      status: extra?.status ?? planRecord?.status ?? 'draft',
      ...(extra?.job_id !== undefined ? { job_id: extra.job_id } : {}),
      ...(extra?.last_status !== undefined ? { last_status: extra.last_status } : {}),
      ...(extra?.last_progress !== undefined ? { last_progress: extra.last_progress } : {}),
    };

    if (planRecord) {
      const updated = await importPlansService.updateImportPlan(planRecord.id, draft);
      setPlanRecord(updated);
      return updated;
    }
    const created = await importPlansService.createImportPlan(draft);
    setPlanRecord(created);
    navigate(`/import/${created.id}`, { replace: true });
    return created;
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    setError('');
    try {
      await persistDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleRunPlan() {
    if (!planRequest) return;
    setPlanning(true);
    setPlanError('');
    setPlanResponse(null);
    try {
      const res = await syncApi.planImport(planRequest);
      setPlanResponse(res);
      await persistDraft({ plan_response: res, status: 'planned' });
      setStep('results');
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Plan failed');
    } finally {
      setPlanning(false);
    }
  }

  async function handleStartImport(opts: { dryRun: boolean }) {
    if (!planRequest || !selectedProject) return;
    setExecuting(true);
    setJobError('');
    try {
      const persisted = planRecord ?? await persistDraft({ status: 'planned' });
      if (!persisted) throw new Error('Could not save plan');
      const req: PlatformToLocalImportRequest = {
        ...(opts.dryRun ? { dry_run: true } : { confirm: 'CONFIRM' }),
        database_mode: planRequest.database_mode,
        include_storage_bucket_metadata: planRequest.include_storage_bucket_metadata,
        include_storage_objects: false,
        include_edge_functions: planRequest.include_edge_functions,
        include_auth_data: planRequest.include_auth_data,
        source: planRequest.source,
        target: planRequest.target!,
      };
      const res = await syncApi.startPlatformToLocalImport(req);
      const newJob = res.job;
      setJob(newJob);
      setActiveJobId(newJob.id);
      setAutoEnvCreated(false);
      await persistDraft({
        status: opts.dryRun ? 'planned' : 'executing',
        job_id: newJob.id,
        last_status: newJob.status,
        last_progress: newJob.progress ?? null,
      });
      if (newJob.progress) {
        await importJobEventsService.recordJobEvent({
          plan_id: persisted.id,
          job_id: newJob.id,
          phase: newJob.progress.phase,
          percent: newJob.progress.percent ?? null,
          message: newJob.progress.message ?? null,
          status: newJob.status,
          details: (newJob.progress.details as Record<string, unknown>) ?? null,
          output_tail: tailLines(newJob.output, 50),
          recorded_at_ms: newJob.progress.updated_at_ms ?? Date.now(),
        });
      }
      navigate(`/import/${persisted.id}/run/${newJob.id}`, { replace: false });
      setStep('running');
    } catch (e) {
      setJobError(e instanceof Error ? e.message : 'Failed to start import');
    } finally {
      setExecuting(false);
    }
  }

  // --- Job polling ---
  const lastSnapshotRef = useRef<{ phase: string; percent: number; message: string; status: string } | null>(null);

  useEffect(() => {
    if (step !== 'running' || !activeJobId || !planRecord) return;
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      if (cancelled || !activeJobId || !planRecord) return;
      try {
        const j = await syncApi.getJob(activeJobId);
        if (cancelled) return;
        setJob(j);
        setJobError('');
        const prog = j.progress ?? null;
        const snap = {
          phase: prog?.phase ?? '',
          percent: Math.round(prog?.percent ?? 0),
          message: prog?.message ?? '',
          status: j.status,
        };
        const prev = lastSnapshotRef.current;
        const changed = !prev
          || prev.phase !== snap.phase
          || prev.percent !== snap.percent
          || prev.message !== snap.message
          || prev.status !== snap.status;
        if (changed) {
          lastSnapshotRef.current = snap;
          await importJobEventsService.recordJobEvent({
            plan_id: planRecord.id,
            job_id: j.id,
            phase: prog?.phase ?? null,
            percent: prog?.percent ?? null,
            message: prog?.message ?? null,
            status: j.status,
            details: (prog?.details as Record<string, unknown>) ?? null,
            output_tail: tailLines(j.output, 100),
            recorded_at_ms: prog?.updated_at_ms ?? Date.now(),
          });
          await importPlansService.updateImportPlan(planRecord.id, {
            last_status: j.status,
            last_progress: prog ?? null,
            status: j.status === 'succeeded'
              ? 'succeeded'
              : j.status === 'failed'
              ? 'failed'
              : 'executing',
          });
        }
      } catch (e) {
        if (!cancelled) setJobError(e instanceof Error ? e.message : 'Failed to fetch job');
      }
    }

    tick();
    const interval = window.setInterval(() => {
      const status = job?.status;
      if (status === 'succeeded' || status === 'failed') return;
      tick();
    }, 1500);
    timer = interval;

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [step, activeJobId, planRecord, job?.status]);

  // --- Auto-create environment on success ---
  useEffect(() => {
    if (autoEnvCreated) return;
    if (!job || job.status !== 'succeeded') return;
    if (!planRecord || !selectedProject) return;
    if (job.progress?.phase === 'dry_run') return;
    const envName = suggestEnvName(selectedProject.ref, selectedProject.name);
    const req: EnvironmentCreateRequest = {
      name: envName,
      source_env: 'cloud',
      source_project_ref: selectedProject.ref,
      source_project_name: selectedProject.name || undefined,
      source_organization_name: selectedOrg?.name || undefined,
      ...(skipDbUrl ? {} : { source_db_url: dbUrl.trim() }),
      target_env: targetEnv.trim() || 'local',
      target_container: TARGET_CONTAINER,
      target_db_name: targetDbName.trim() || undefined,
      target_user: targetUser.trim() || undefined,
    };
    setAutoEnvCreated(true);
    syncApi.createEnvironment(req).catch((e) => {
      console.warn('[import] auto-create environment failed', e);
    });
  }, [job, planRecord, selectedProject, selectedOrg, skipDbUrl, dbUrl, targetEnv, targetUser, targetDbName, autoEnvCreated]);

  if (loadingRecord) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Download className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Import from Supabase</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Pull schema and data from a hosted Supabase project into a local environment.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {planRecord && (
            <span className="text-xs text-gray-500">
              Draft saved {new Date(planRecord.updated_at).toLocaleString()}
            </span>
          )}
          <button
            onClick={handleSaveDraft}
            disabled={savingDraft || !selectedProject}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-xs font-medium rounded-lg transition-colors"
          >
            {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save draft
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!planId && <SavedImportsPanel />}

      <Stepper currentIndex={stepIndex} onJump={(key) => setStep(key)} canJumpTo={(key) => {
        const idx = STEPS.findIndex(s => s.key === key);
        if (idx <= stepIndex) return true;
        if (key === 'results') return !!planResponse;
        if (key === 'execute') return !!planResponse;
        if (key === 'running') return !!activeJobId;
        return false;
      }} />

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {step === 'account' && (
          <AccountStep
            hasPat={hasPat}
            onConnected={() => setHasPat(true)}
            onDisconnect={() => setHasPat(false)}
          />
        )}

        {step === 'organization' && (
          <OrganizationStep
            orgs={orgs}
            loading={orgsLoading}
            error={orgsError}
            selectedId={selectedOrg?.id ?? null}
            onSelect={(o) => setSelectedOrg(o)}
            onRetry={reloadOrgs}
          />
        )}

        {step === 'project' && (
          <ProjectStep
            org={selectedOrg}
            projects={projects}
            loading={projectsLoading}
            error={projectsError}
            selectedRef={selectedProject?.ref ?? null}
            onSelect={(p) => setSelectedProject(p)}
            onRetry={reloadProjects}
          />
        )}

        {step === 'connection' && (
          <ConnectionStep
            dbUrl={dbUrl}
            onChangeDbUrl={setDbUrl}
            skip={skipDbUrl}
            onChangeSkip={setSkipDbUrl}
            show={showDbUrl}
            onToggleShow={() => setShowDbUrl(v => !v)}
          />
        )}

        {step === 'target' && (
          <TargetStep
            env={targetEnv}
            user={targetUser}
            dbName={targetDbName}
            onEnv={setTargetEnv}
            onUser={setTargetUser}
            onDbName={setTargetDbName}
          />
        )}

        {step === 'options' && (
          <OptionsStep options={options} onChange={setOptions} />
        )}

        {step === 'review' && (
          <ReviewStep
            project={selectedProject}
            org={selectedOrg}
            options={options}
            skipDbUrl={skipDbUrl}
            dbUrl={dbUrl}
            target={{ env: targetEnv, container: TARGET_CONTAINER, user: targetUser, dbName: targetDbName }}
            onRun={handleRunPlan}
            running={planning}
            error={planError}
          />
        )}

        {step === 'results' && (
          <ResultsStep
            response={planResponse}
            planRecord={planRecord}
            onRePlan={() => setStep('review')}
            onContinue={() => setStep('execute')}
          />
        )}

        {step === 'execute' && (
          <ExecuteStep
            project={selectedProject}
            org={selectedOrg}
            options={effectiveOptions}
            target={{ env: targetEnv, container: TARGET_CONTAINER, user: targetUser, dbName: targetDbName }}
            skipDbUrl={skipDbUrl}
            planResponse={planResponse}
            onStart={handleStartImport}
            running={executing}
            error={jobError}
          />
        )}

        {step === 'running' && (
          <RunningStep
            jobId={activeJobId}
            job={job}
            error={jobError}
            planRecord={planRecord}
            onRetry={() => {
              setJobError('');
              setJob(null);
              lastSnapshotRef.current = null;
              setStep('execute');
            }}
            onBackToPlan={() => setStep('results')}
            autoEnvCreated={autoEnvCreated}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 border border-gray-800 hover:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 text-sm font-medium rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {step === 'review' || step === 'execute' ? null : step === 'running' ? (
            job?.status === 'succeeded' || job?.status === 'failed' ? (
              <Link
                to="/environments"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : null
          ) : step === 'results' ? (
            <button
              onClick={() => setStep('execute')}
              disabled={!planResponse}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue to execute
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step components ---

function Stepper({
  currentIndex,
  onJump,
  canJumpTo,
}: {
  currentIndex: number;
  onJump: (key: StepKey) => void;
  canJumpTo: (key: StepKey) => boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === currentIndex;
          const done = i < currentIndex;
          const reachable = canJumpTo(s.key);
          return (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => reachable && onJump(s.key)}
                disabled={!reachable}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-300'
                    : done
                    ? 'text-gray-300 hover:bg-gray-800 border border-transparent'
                    : 'text-gray-500 border border-transparent'
                } ${!reachable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {done ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700 mx-0.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountStep({
  hasPat,
  onConnected,
  onDisconnect,
}: {
  hasPat: boolean | null;
  onConnected: () => void;
  onDisconnect: () => void;
}) {
  const [pat, setPat] = useState('');
  const [sessionOnly, setSessionOnly] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  async function handleConnect() {
    const trimmed = pat.trim();
    if (!trimmed) {
      setFeedback({ kind: 'error', message: 'Enter a Personal Access Token to continue.' });
      return;
    }
    if (!trimmed.startsWith('sbp_')) {
      setFeedback({
        kind: 'error',
        message: 'That doesn\'t look like a Supabase Personal Access Token. PATs start with "sbp_". Project anon and service-role keys won\'t work here.',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      setTesting(true);
      const res = await syncApi.listSupabaseOrganizations(trimmed);
      setTesting(false);
      await settingsService.saveSupabaseAccessToken(trimmed, sessionOnly);
      syncApi.setSupabaseAccessTokenCache(trimmed);
      setFeedback({
        kind: 'ok',
        message: `Connected. Found ${res.organizations?.length ?? 0} organization${(res.organizations?.length ?? 0) === 1 ? '' : 's'}.`,
      });
      onConnected();
    } catch (e) {
      setTesting(false);
      setFeedback({
        kind: 'error',
        message: describeConnectError(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setFeedback(null);
    try {
      await settingsService.clearSupabaseAccessToken();
      syncApi.setSupabaseAccessTokenCache('');
      setPat('');
      setSessionOnly(false);
      onDisconnect();
      setFeedback({ kind: 'ok', message: 'Disconnected.' });
    } catch (e) {
      setFeedback({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to disconnect.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (hasPat === null) {
    return (
      <div className="space-y-4">
        <SectionHeader
          icon={Cloud}
          title="Connect your Supabase account"
          description="Checking for an existing token..."
        />
        <LoadingRow label="Loading..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Cloud}
        title="Connect your Supabase account"
        description="A Personal Access Token lets us discover your organizations and projects. Stored securely against your account."
      />

      {hasPat ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-emerald-200">Account connected</div>
              <div className="text-xs text-emerald-300/70 mt-0.5">
                You can continue to the next step. Token can be replaced anytime here or in Settings.
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-xs font-medium text-emerald-300 hover:text-emerald-200 disabled:opacity-50 flex-shrink-0"
            >
              Disconnect
            </button>
          </div>
          <div className="text-xs text-gray-500">
            Need a different token? <Link to="/settings" className="text-gray-300 hover:text-white underline">Open Settings</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200">
              Create a token at{' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-100 inline-flex items-center gap-0.5"
              >
                supabase.com/dashboard/account/tokens
                <ExternalLinkIcon />
              </a>
              . Give it a descriptive name like "SyncDB import".
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400">Personal Access Token</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="sbp_..."
                autoComplete="off"
                spellCheck={false}
                className="w-full pl-3 pr-10 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 font-mono"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sessionOnly}
              onChange={(e) => setSessionOnly(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700 text-emerald-600 focus:ring-emerald-600/30 focus:ring-offset-gray-900"
            />
            <div>
              <div className="text-sm font-medium text-gray-200">Session only</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Don't persist the token to your account. It stays in memory until you sign out or refresh.
              </div>
            </div>
          </label>

          {feedback && (
            <div
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                feedback.kind === 'ok'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}
            >
              {feedback.kind === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span className="break-words">{feedback.message}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleConnect}
              disabled={busy || !pat.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {testing ? 'Verifying...' : busy ? 'Saving...' : 'Connect'}
            </button>
            <Link
              to="/settings"
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Manage in Settings instead
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function describeConnectError(err: unknown): string {
  const apiErr = err as { status?: number; message?: string };
  const status = typeof apiErr?.status === 'number' ? apiErr.status : 0;
  const raw = (apiErr?.message || '').trim();

  if (status === 401 || /unauthorized|invalid token|expired/i.test(raw)) {
    return 'Token rejected by Supabase. Make sure it\'s a Personal Access Token from supabase.com/dashboard/account/tokens, copied in full, and not revoked.';
  }
  if (status === 403) {
    return 'The token is valid but lacks permission to list organizations. Try creating a new PAT with default scopes.';
  }
  if (status === 429) {
    return 'Rate limited by Supabase. Wait a moment and try again.';
  }
  if (status >= 500) {
    return `Upstream error (${status}). The Supabase API or sync service is unavailable. Try again shortly.`;
  }
  if (raw && status > 0) return `${raw} (HTTP ${status})`;
  if (raw) return raw;
  return 'Failed to verify token. Check your network connection and try again.';
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3 inline-block"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    </svg>
  );
}

function OrganizationStep({
  orgs,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: {
  orgs: SupabaseOrganization[];
  loading: boolean;
  error: string;
  selectedId: string | null;
  onSelect: (o: SupabaseOrganization) => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Building2}
        title="Choose an organization"
        description="Select the Supabase organization that owns the source project."
      />
      {loading ? (
        <LoadingRow label="Loading organizations..." />
      ) : error ? (
        <ErrorRow message={error} onRetry={onRetry} />
      ) : orgs.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No organizations found.</div>
      ) : (
        <div className="grid gap-2">
          {orgs.map(o => {
            const active = o.id === selectedId;
            return (
              <button
                key={o.id}
                onClick={() => onSelect(o)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors border ${
                  active
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  active ? 'bg-emerald-500/20' : 'bg-gray-800'
                }`}>
                  <Building2 className={`w-4 h-4 ${active ? 'text-emerald-300' : 'text-gray-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-100 truncate">{o.name}</div>
                  <div className="text-xs text-gray-500 font-mono truncate">{o.id}</div>
                </div>
                {active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectStep({
  org,
  projects,
  loading,
  error,
  selectedRef,
  onSelect,
  onRetry,
}: {
  org: SupabaseOrganization | null;
  projects: SupabaseProject[];
  loading: boolean;
  error: string;
  selectedRef: string | null;
  onSelect: (p: SupabaseProject) => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        icon={FolderOpen}
        title="Choose source project"
        description={org ? `Projects in ${org.name}` : 'Select an organization first.'}
      />
      {loading ? (
        <LoadingRow label="Loading projects..." />
      ) : error ? (
        <ErrorRow message={error} onRetry={onRetry} />
      ) : projects.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No projects found in this organization.</div>
      ) : (
        <div className="grid gap-2">
          {projects.map(p => {
            const active = p.ref === selectedRef;
            return (
              <button
                key={p.ref}
                onClick={() => onSelect(p)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors border ${
                  active
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  active ? 'bg-emerald-500/20' : 'bg-gray-800'
                }`}>
                  <Database className={`w-4 h-4 ${active ? 'text-emerald-300' : 'text-gray-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-100 truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 font-mono truncate">{p.ref}{p.region ? ` · ${p.region}` : ''}</div>
                </div>
                {active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectionStep({
  dbUrl,
  onChangeDbUrl,
  skip,
  onChangeSkip,
  show,
  onToggleShow,
}: {
  dbUrl: string;
  onChangeDbUrl: (v: string) => void;
  skip: boolean;
  onChangeSkip: (v: boolean) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Database}
        title="Database connection"
        description="A direct connection string lets us inspect the live schema and (optionally) copy data."
      />

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200">
          Find the connection string in your Supabase dashboard under <span className="font-medium">Project Settings → Database → Connection string</span>.
          Use the URI format including the password.
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400">Connection string</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={dbUrl}
            onChange={(e) => onChangeDbUrl(e.target.value)}
            disabled={skip}
            placeholder="postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres"
            className="w-full pl-3 pr-10 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed font-mono"
          />
          <button
            type="button"
            onClick={onToggleShow}
            disabled={skip}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => onChangeSkip(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700 text-emerald-600 focus:ring-emerald-600/30 focus:ring-offset-gray-900"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-200">Skip for now</div>
          <div className="text-xs text-gray-500 mt-0.5">
            You can plan an import without a connection. The environment will be created with a "limited" status — you'll need to add the connection later before applying migrations or running data sync.
          </div>
        </div>
      </label>

      {skip && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <div className="font-medium mb-1">Limitations without a connection</div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-300/80">
              <li>Schema introspection will fall back to Supabase API endpoints (less detail)</li>
              <li>Schema-and-data mode is unavailable</li>
              <li>The created environment will be marked limited until you add a connection</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function TargetStep({
  env,
  user,
  dbName,
  onEnv,
  onUser,
  onDbName,
}: {
  env: string;
  user: string;
  dbName: string;
  onEnv: (v: string) => void;
  onUser: (v: string) => void;
  onDbName: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        icon={SettingsIcon}
        title="Target environment"
        description="Where the imported schema and data will land. A local Postgres container is the default."
      />

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">Local Supabase DB</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Fixed Docker container on this VPS. The container name is part of the deployment and isn't editable.
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 bg-emerald-600/15 text-emerald-300 rounded font-semibold flex-shrink-0">
            default
          </span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Docker container</span>
          <code className="text-xs text-gray-200 font-mono">supabase-db</code>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          label="Display label"
          value={env}
          onChange={onEnv}
          placeholder="local"
        />
        <Field
          label="DB name"
          value={dbName}
          onChange={onDbName}
          placeholder="postgres"
        />
        <Field
          label="DB user"
          value={user}
          onChange={onUser}
          placeholder="postgres"
        />
      </div>
      <p className="text-[11px] text-gray-500 -mt-1">
        Display label is what you'll see in lists like Environments. DB name and user usually stay as <code className="font-mono">postgres</code>.
      </p>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200">
          Cloning into a hosted Supabase project will be available in a future release. For now, only local targets are supported.
        </div>
      </div>
    </div>
  );
}

function OptionsStep({
  options,
  onChange,
}: {
  options: ImportOptions;
  onChange: (next: ImportOptions) => void;
}) {
  function set<K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) {
    onChange({ ...options, [key]: value });
  }
  return (
    <div className="space-y-5">
      <SectionHeader
        icon={ListChecks}
        title="Import options"
        description="Choose what to bring across and how much detail to gather."
      />

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400">Database mode</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { value: 'schema-only', label: 'Schema only', description: 'DDL only — fastest plan, no data copied.' },
            { value: 'schema-and-data', label: 'Schema and data', description: 'Schema plus data copy. Requires a connection.' },
          ] as const).map(opt => {
            const active = options.database_mode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => set('database_mode', opt.value)}
                className={`p-4 rounded-lg text-left border transition-colors ${
                  active
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${active ? 'text-emerald-200' : 'text-gray-200'}`}>{opt.label}</span>
                  {active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <p className={`text-xs ${active ? 'text-emerald-300/70' : 'text-gray-500'}`}>{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Toggle
          label="Include edge function metadata"
          description="Discover deployed edge functions in the source project."
          checked={options.include_edge_functions}
          onChange={(v) => set('include_edge_functions', v)}
        />
        <Toggle
          label="Include storage bucket metadata"
          description="Inventory storage buckets (objects are not copied)."
          checked={options.include_storage_bucket_metadata}
          onChange={(v) => set('include_storage_bucket_metadata', v)}
        />
        {options.database_mode === 'schema-and-data' ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800">
            <input
              type="checkbox"
              checked
              disabled
              className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700 text-emerald-600"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                Include auth users
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-600/15 text-emerald-300 rounded">required</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                schema-and-data execution requires auth data. Selective auth exclusion is not implemented yet.
              </div>
            </div>
          </div>
        ) : (
          <Toggle
            label="Include auth users (advanced)"
            description="Plan an auth schema copy. Use with care — verifies feasibility only."
            checked={options.include_auth_data}
            onChange={(v) => set('include_auth_data', v)}
          />
        )}
        <ToggleDisabled
          label="Copy storage objects"
          description="Bulk object copy is not yet supported in the API."
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Largest tables sample size</label>
        <input
          type="number"
          min={0}
          max={500}
          value={options.largest_table_limit}
          onChange={(e) => set('largest_table_limit', Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
          className="w-32 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20"
        />
        <p className="text-xs text-gray-500">Number of largest tables to surface in the plan output.</p>
      </div>
    </div>
  );
}

function ReviewStep({
  project,
  org,
  options,
  skipDbUrl,
  dbUrl,
  target,
  onRun,
  running,
  error,
}: {
  project: SupabaseProject | null;
  org: SupabaseOrganization | null;
  options: ImportOptions;
  skipDbUrl: boolean;
  dbUrl: string;
  target: { env: string; container: string; user: string; dbName: string };
  onRun: () => void;
  running: boolean;
  error: string;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Eye}
        title="Review & plan"
        description="Confirm the configuration. Planning is a read-only operation."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Source">
          <Row label="Organization" value={org?.name || '—'} mono={false} />
          <Row label="Project" value={project?.name || '—'} mono={false} />
          <Row label="Project ref" value={project?.ref || '—'} mono />
          <Row label="Region" value={project?.region || '—'} mono />
          <Row label="Connection" value={skipDbUrl ? 'Skipped' : dbUrl ? maskDbUrl(dbUrl) : '—'} mono />
        </Card>
        <Card title="Target">
          <Row label="Type" value="Local container" mono={false} />
          <Row label="Environment" value={target.env || '—'} mono />
          <Row label="Container" value={target.container || '—'} mono />
          <Row label="DB user" value={target.user || '—'} mono />
          <Row label="DB name" value={target.dbName || '—'} mono />
        </Card>
      </div>

      <Card title="Options">
        <Row label="Database mode" value={options.database_mode} mono />
        <Row label="Edge functions" value={options.include_edge_functions ? 'Yes' : 'No'} mono />
        <Row label="Storage bucket metadata" value={options.include_storage_bucket_metadata ? 'Yes' : 'No'} mono />
        <Row label="Auth users" value={options.include_auth_data ? 'Yes' : 'No'} mono />
        <Row label="Largest table limit" value={String(options.largest_table_limit)} mono />
      </Card>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 flex items-start gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onRun}
          disabled={running || !project}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {running ? 'Planning...' : 'Run import plan'}
        </button>
      </div>
    </div>
  );
}

function ResultsStep({
  response,
  planRecord,
  onRePlan,
  onContinue,
}: {
  response: ImportPlanResponse | null;
  planRecord: ImportPlanRecord | null;
  onRePlan: () => void;
  onContinue: () => void;
}) {
  if (!response) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">
        No plan results yet. Run the plan from the Review step.
      </div>
    );
  }

  const f = response.feasibility;
  const sourceDb = response.source.database;
  const limitations = !planRecord?.has_db_url || !f.can_run_platform_to_local_now;

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={CheckCircle2}
        title="Plan ready"
        description={`Generated ${new Date(response.generated_at_ms).toLocaleString()}`}
      />

      {limitations && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <div className="font-medium mb-1">This plan has limitations</div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-300/80">
              {!planRecord?.has_db_url && <li>No direct database connection — schema-and-data mode is blocked.</li>}
              {!f.can_run_platform_to_local_now && <li>Backend reports the platform-to-local execution path isn't available right now.</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FeasibilityTile label="Plan possible" ok={f.can_plan_import} />
        <FeasibilityTile label="Schema only" ok={f.schema_only_supported} />
        <FeasibilityTile label="Schema + data" ok={f.schema_and_data_supported} />
      </div>

      {response.warnings && response.warnings.length > 0 && (
        <Card title={`Warnings (${response.warnings.length})`}>
          <div className="space-y-2">
            {response.warnings.map((w, i) => (
              <WarningRow key={i} warning={w} />
            ))}
          </div>
        </Card>
      )}

      {sourceDb && (
        <Card title="Source database overview">
          <Row label="Database" value={sourceDb.overview?.database_name || '—'} mono />
          <Row label="Postgres version" value={sourceDb.overview?.server_version || '—'} mono />
          <Row label="Size" value={formatBytes(sourceDb.overview?.database_size_bytes)} mono />
          <Row label="Tables" value={String(sourceDb.table_count ?? '—')} mono />
          <Row label="Storage buckets" value={String(sourceDb.storage_bucket_count ?? '—')} mono />
        </Card>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onRePlan}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Re-plan
        </button>
        <button
          onClick={onContinue}
          disabled={!response}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Play className="w-4 h-4" />
          Continue to execute
        </button>
      </div>
    </div>
  );
}

function ExecuteStep({
  project,
  org,
  options,
  target,
  skipDbUrl,
  planResponse,
  onStart,
  running,
  error,
}: {
  project: SupabaseProject | null;
  org: SupabaseOrganization | null;
  options: ImportOptions;
  target: { env: string; container: string; user: string; dbName: string };
  skipDbUrl: boolean;
  planResponse: ImportPlanResponse | null;
  onStart: (opts: { dryRun: boolean }) => void;
  running: boolean;
  error: string;
}) {
  const [dryRun, setDryRun] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const canRunDestructive = !dryRun && confirmText === 'CONFIRM' && !running;
  const canRunDryRun = dryRun && !running;
  const blockedByPlan = planResponse?.feasibility?.can_run_platform_to_local_now === false;
  const blockedBySchemaData = options.database_mode === 'schema-and-data' && skipDbUrl;

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Play}
        title="Execute import"
        description="Run a dry run first, then a real import. The real run replaces the local target database."
      />

      {blockedByPlan && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            The plan reported that platform-to-local execution is not currently available. The button is enabled
            so you can still try, but the upstream may reject the request.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Source">
          <Row label="Organization" value={org?.name || '—'} />
          <Row label="Project" value={project?.name || '—'} />
          <Row label="Project ref" value={project?.ref || '—'} mono />
          <Row label="Direct connection" value={skipDbUrl ? 'No' : 'Yes'} />
        </Card>
        <Card title="Target (will be replaced)">
          <Row label="Environment" value={target.env || '—'} mono />
          <Row label="Container" value={target.container || '—'} mono />
          <Row label="DB user" value={target.user || '—'} mono />
          <Row label="DB name" value={target.dbName || '—'} mono />
        </Card>
      </div>

      <Card title="What will be imported">
        <Row label="Database mode" value={options.database_mode} mono />
        <Row label="Edge functions" value={options.include_edge_functions ? 'Included' : 'Skipped'} />
        <Row label="Storage buckets (metadata only)" value={options.include_storage_bucket_metadata ? 'Included' : 'Skipped'} />
        <Row label="Storage objects" value="Skipped (not yet supported)" />
        <Row label="Auth users" value={options.include_auth_data ? 'Included' : 'Skipped'} />
      </Card>

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700 text-emerald-600 focus:ring-emerald-600/30 focus:ring-offset-gray-900"
          />
          <div>
            <div className="text-sm font-medium text-gray-200">Dry run only</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Validates the path without writing to the target database. Recommended for the first run.
            </div>
          </div>
        </label>

        {!dryRun && (
          <div className="space-y-2 pt-3 border-t border-gray-800">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                This will <strong>replace</strong> all data in the target container <code className="font-mono">{target.container}</code>. Type{' '}
                <code className="font-mono bg-red-500/20 px-1 rounded">CONFIRM</code> to enable the real import button.
              </div>
            </div>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 font-mono"
            />
          </div>
        )}
      </div>

      {blockedBySchemaData && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-200 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            Schema-and-data mode requires a direct database connection. Go back to the Connection step and provide a DB URL.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-200 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {dryRun ? (
          <button
            onClick={() => onStart({ dryRun: true })}
            disabled={!canRunDryRun || blockedBySchemaData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Starting dry run...' : 'Start dry run'}
          </button>
        ) : (
          <button
            onClick={() => onStart({ dryRun: false })}
            disabled={!canRunDestructive || blockedBySchemaData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-red-900/30"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Starting import...' : 'Start real import'}
          </button>
        )}
      </div>
    </div>
  );
}

function RunningStep({
  jobId,
  job,
  error,
  planRecord,
  onRetry,
  onBackToPlan,
  autoEnvCreated,
}: {
  jobId: string | null;
  job: Job | null;
  error: string;
  planRecord: ImportPlanRecord | null;
  onRetry: () => void;
  onBackToPlan: () => void;
  autoEnvCreated: boolean;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const [events, setEvents] = useState<Array<{ phase: string | null; percent: number | null; message: string | null; created_at: string; status: string | null }>>([]);

  useEffect(() => {
    if (!planRecord || !jobId) return;
    let cancelled = false;
    importJobEventsService.listJobEvents(planRecord.id, jobId)
      .then(rows => { if (!cancelled) setEvents(rows.map(r => ({ phase: r.phase, percent: r.percent, message: r.message, created_at: r.created_at, status: r.status }))); })
      .catch(() => {});
    const t = window.setInterval(() => {
      if (cancelled) return;
      importJobEventsService.listJobEvents(planRecord.id, jobId)
        .then(rows => { if (!cancelled) setEvents(rows.map(r => ({ phase: r.phase, percent: r.percent, message: r.message, created_at: r.created_at, status: r.status }))); })
        .catch(() => {});
    }, 3000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [planRecord, jobId]);

  if (!jobId) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">
        No active import job. Go back to Execute to start one.
      </div>
    );
  }

  const progress = job?.progress;
  const pct = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
  const phase = (progress?.phase as ImportPhase | undefined) ?? (job?.status as ImportPhase | undefined) ?? 'queued';
  const status = job?.status ?? planRecord?.last_status ?? 'queued';
  const isTerminal = status === 'succeeded' || status === 'failed';
  const sourceSnap = progress?.details?.source_database;
  const targetSnap = progress?.details?.target_database;
  const largest = (sourceSnap?.largest_tables || []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Activity}
        title={status === 'succeeded' ? 'Import complete' : status === 'failed' ? 'Import failed' : 'Import in progress'}
        description={
          status === 'succeeded'
            ? 'The local target database has been replaced.'
            : status === 'failed'
            ? 'Review the message and logs below.'
            : 'Polling sync-api for progress every 1.5s.'
        }
      />

      {error && !isTerminal && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <PhasePipeline currentPhase={phase} status={status} />

      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-gray-200 truncate">{progress?.message || statusLabel(status)}</div>
          <div className="text-xs text-gray-500 font-mono flex-shrink-0">{pct}%</div>
        </div>
        <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              status === 'failed'
                ? 'bg-red-500'
                : status === 'succeeded'
                ? 'bg-emerald-500'
                : 'bg-emerald-500/70'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 font-mono">
          <span>Job: {jobId.slice(0, 8)}</span>
          <span>Phase: {phase}</span>
          <span>Status: {status}</span>
        </div>
      </div>

      {(sourceSnap || targetSnap) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sourceSnap && (
            <Card title="Source snapshot">
              <Row label="Endpoint" value={sourceSnap.endpoint || '—'} mono />
              <Row label="Tables" value={String(sourceSnap.table_count ?? '—')} mono />
              <Row label="Estimated size" value={formatBytes(sourceSnap.estimated_total_table_bytes)} mono />
              <Row label="Storage buckets" value={String(sourceSnap.storage_bucket_count ?? '—')} mono />
            </Card>
          )}
          {targetSnap && (
            <Card title="Target snapshot">
              <Row label="Endpoint" value={targetSnap.endpoint || '—'} mono />
              <Row label="Tables" value={String(targetSnap.table_count ?? '—')} mono />
              <Row label="Estimated size" value={formatBytes(targetSnap.estimated_total_table_bytes)} mono />
              <Row label="Storage buckets" value={String(targetSnap.storage_bucket_count ?? '—')} mono />
            </Card>
          )}
        </div>
      )}

      {largest.length > 0 && (
        <Card title={`Largest source tables (${largest.length})`}>
          <div className="space-y-1">
            {largest.slice(0, 8).map((t, i) => {
              const name = (t.qualified_name || t.name || `${t.schema}.${t.table}` || `table-${i}`) as string;
              const bytes = (t.total_bytes ?? t.estimated_bytes ?? null) as number | null;
              return (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-300 font-mono truncate">{name}</span>
                  <span className="text-gray-500 font-mono flex-shrink-0">{formatBytes(bytes ?? undefined)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {status === 'succeeded' && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-200">
            <div className="font-medium">Local target database replaced.</div>
            <div className="text-xs text-emerald-300/80 mt-1">
              {autoEnvCreated
                ? 'A SyncDB environment was created so this target shows up under Environments.'
                : 'Creating a matching SyncDB environment...'}
            </div>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">
              <div className="font-medium">{progress?.message || 'Import failed'}</div>
              {job?.exit_code != null && (
                <div className="text-xs text-red-300/70 mt-1">Exit code {job.exit_code}</div>
              )}
            </div>
          </div>
          {job?.output && (
            <pre className="text-[11px] font-mono bg-gray-950 border border-gray-800 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap text-gray-300">
              {tailLines(job.output, 50)}
            </pre>
          )}
        </div>
      )}

      <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowLogs(s => !s)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-400 hover:bg-gray-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <TerminalSquare className="w-3.5 h-3.5" />
            {showLogs ? 'Hide logs' : 'Show logs'}
          </span>
          <span className="text-gray-600">{events.length} events</span>
        </button>
        {showLogs && (
          <div className="border-t border-gray-800 p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Persisted progress events</div>
            <div className="bg-gray-900 border border-gray-800 rounded p-2 max-h-48 overflow-auto space-y-1">
              {events.length === 0 ? (
                <div className="text-xs text-gray-600 italic">No events recorded yet.</div>
              ) : events.map((e, i) => (
                <div key={i} className="flex items-start gap-3 text-[11px] font-mono">
                  <span className="text-gray-600 flex-shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                  <span className={`flex-shrink-0 px-1.5 rounded ${
                    e.status === 'failed' ? 'bg-red-500/15 text-red-300'
                    : e.status === 'succeeded' ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-gray-800 text-gray-400'
                  }`}>{e.phase || e.status}</span>
                  <span className="text-gray-500 flex-shrink-0 w-10 text-right">{e.percent != null ? `${Math.round(e.percent)}%` : ''}</span>
                  <span className="text-gray-300 truncate">{e.message}</span>
                </div>
              ))}
            </div>
            {job?.output && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 pt-2">Live output (tail)</div>
                <pre className="bg-gray-900 border border-gray-800 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] font-mono text-gray-300">
                  {tailLines(job.output, 100)}
                </pre>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isTerminal && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Run again
          </button>
        )}
        <button
          onClick={onBackToPlan}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          Back to plan
        </button>
        {status === 'succeeded' && (
          <Link
            to="/environments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View environments
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

const PIPELINE_PHASES: ImportPhase[] = [
  'queued',
  'planning',
  'database_import',
  'edge_functions',
  'finalizing',
  'succeeded',
];

function PhasePipeline({ currentPhase, status }: { currentPhase: ImportPhase | string; status: string }) {
  const failed = status === 'failed';
  const succeeded = status === 'succeeded';
  const currentIndex = (() => {
    if (succeeded) return PIPELINE_PHASES.length - 1;
    const direct = PIPELINE_PHASES.indexOf(currentPhase as ImportPhase);
    if (direct >= 0) return direct;
    if (currentPhase === 'planned' || currentPhase === 'dry_run') return 1;
    if (currentPhase === 'database_imported' || currentPhase === 'database_skipped') return 2;
    if (currentPhase === 'edge_functions_imported' || currentPhase === 'edge_functions_skipped') return 3;
    if (currentPhase === 'running') return 0;
    return 0;
  })();

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {PIPELINE_PHASES.map((p, i) => {
          const isActive = i === currentIndex && !succeeded && !failed;
          const isDone = i < currentIndex || succeeded;
          const palette = failed && i >= currentIndex
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : isActive
            ? 'bg-emerald-600/15 border-emerald-500/30 text-emerald-300'
            : isDone
            ? 'bg-gray-800 border-gray-700 text-gray-300'
            : 'bg-gray-900 border-gray-800 text-gray-500';
          return (
            <div key={p} className="flex items-center">
              <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium border ${palette}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                {phaseLabel(p)}
              </span>
              {i < PIPELINE_PHASES.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700 mx-0.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'queued': return 'Queued';
    case 'planning': return 'Planning';
    case 'planned': return 'Planned';
    case 'dry_run': return 'Dry run';
    case 'database_import': return 'Database';
    case 'database_imported': return 'DB done';
    case 'database_skipped': return 'DB skipped';
    case 'edge_functions': return 'Edge functions';
    case 'edge_functions_imported': return 'Functions done';
    case 'edge_functions_skipped': return 'Functions skipped';
    case 'finalizing': return 'Finalizing';
    case 'succeeded': return 'Done';
    case 'failed': return 'Failed';
    case 'running': return 'Running';
    default: return phase;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'Queued, waiting to start...';
    case 'running': return 'Running...';
    case 'succeeded': return 'Completed successfully';
    case 'failed': return 'Failed';
    default: return status;
  }
}

function tailLines(text: string | undefined | null, n: number): string {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= n) return text;
  return lines.slice(-n).join('\n');
}

function suggestEnvName(ref: string, projectName?: string | null): string {
  const base = (projectName || ref || 'imported').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base}-local`.slice(0, 40);
}

// --- Reusable bits ---

function SavedImportsPanel() {
  const [items, setItems] = useState<ImportPlanRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const rows = await importPlansService.listImportPlans();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load saved imports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this saved import? This will also remove its progress event history.')) return;
    setDeletingId(id);
    try {
      await importPlansService.deleteImportPlan(id);
      setItems(prev => (prev || []).filter(p => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading saved imports...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 flex items-center justify-between gap-3">
        <span>{error}</span>
        <button onClick={load} className="text-xs underline">Retry</button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const visible = expanded ? items : items.slice(0, 5);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-gray-100">Saved imports</span>
          <span className="text-[11px] text-gray-500">({items.length})</span>
        </div>
        <button
          onClick={load}
          className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <ul className="divide-y divide-gray-800">
        {visible.map(p => (
          <SavedImportRow key={p.id} plan={p} onDelete={() => handleDelete(p.id)} deleting={deletingId === p.id} />
        ))}
      </ul>
      {items.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full px-4 py-2 text-xs text-gray-500 hover:bg-gray-950 transition-colors border-t border-gray-800"
        >
          {expanded ? 'Show less' : `Show ${items.length - 5} more`}
        </button>
      )}
    </div>
  );
}

function SavedImportRow({
  plan,
  onDelete,
  deleting,
}: {
  plan: ImportPlanRecord;
  onDelete: () => void;
  deleting: boolean;
}) {
  const status = plan.status;
  const isRunning = status === 'executing';
  const targetUrl = plan.job_id && (status === 'executing' || (plan.last_status && plan.last_status !== 'succeeded' && plan.last_status !== 'failed'))
    ? `/import/${plan.id}/run/${plan.job_id}`
    : `/import/${plan.id}`;

  const statusPalette = (() => {
    switch (status) {
      case 'draft': return 'bg-gray-800 text-gray-300 border-gray-700';
      case 'planned': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'executing': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'succeeded': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'failed': return 'bg-red-500/15 text-red-300 border-red-500/30';
      default: return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  })();

  return (
    <li className="px-4 py-3 flex items-center gap-3 hover:bg-gray-950 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-center flex-shrink-0">
        {isRunning ? (
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
        ) : status === 'succeeded' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : status === 'failed' ? (
          <XCircle className="w-4 h-4 text-red-400" />
        ) : (
          <FolderOpen className="w-4 h-4 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-100 truncate">
            {plan.source_project_name || plan.source_project_ref || 'Unnamed import'}
          </span>
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${statusPalette}`}>
            {status}
          </span>
          {plan.database_mode && (
            <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{plan.database_mode}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5 truncate">
          {plan.source_organization_name && <span className="truncate">{plan.source_organization_name}</span>}
          {plan.source_organization_name && plan.source_project_ref && <span>•</span>}
          {plan.source_project_ref && <span className="font-mono truncate">{plan.source_project_ref}</span>}
          <span>•</span>
          <span>Updated {formatRelativeTime(plan.updated_at)}</span>
        </div>
        {plan.last_progress?.message && (
          <div className="text-[11px] text-gray-500 mt-0.5 truncate font-mono">
            {plan.last_progress.phase || plan.last_status} — {plan.last_progress.message}
          </div>
        )}
      </div>
      <Link
        to={targetUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
      >
        {isRunning ? 'Watch' : status === 'failed' ? 'Review' : 'Resume'}
        <ArrowRight className="w-3 h-3" />
      </Link>
      <button
        onClick={onDelete}
        disabled={deleting}
        title="Delete saved import"
        className="text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors flex-shrink-0"
      >
        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
      </button>
    </li>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Cloud;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-300" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-red-300">Failed to load</div>
        <div className="text-xs text-red-300/80 mt-0.5 break-words">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="text-xs font-medium text-red-300 hover:text-red-200 inline-flex items-center gap-1"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 font-mono"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-950 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700 text-emerald-600 focus:ring-emerald-600/30 focus:ring-offset-gray-900"
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
    </label>
  );
}

function ToggleDisabled({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg opacity-50">
      <input type="checkbox" disabled className="mt-0.5 w-4 h-4 rounded bg-gray-950 border-gray-700" />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
          {label}
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">soon</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </div>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs text-gray-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function FeasibilityTile({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${
      ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-gray-950 border-gray-800'
    }`}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-gray-500" />}
        <span className={`text-xs font-medium ${ok ? 'text-emerald-200' : 'text-gray-400'}`}>{label}</span>
      </div>
    </div>
  );
}

function WarningRow({ warning }: { warning: ImportPlanWarning }) {
  const palette = warning.severity === 'error'
    ? { bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'text-red-400', text: 'text-red-200', code: 'text-red-300/70' }
    : warning.severity === 'warning'
    ? { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400', text: 'text-amber-200', code: 'text-amber-300/70' }
    : { bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'text-blue-400', text: 'text-blue-200', code: 'text-blue-300/70' };
  const Icon = warning.severity === 'error' ? XCircle : warning.severity === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-3 ${palette.bg} ${palette.border} border rounded-lg px-3 py-2`}>
      <Icon className={`w-4 h-4 ${palette.icon} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium ${palette.text}`}>{warning.message}</div>
        <div className={`text-[10px] font-mono ${palette.code} mt-0.5`}>{warning.code}</div>
      </div>
    </div>
  );
}

function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '••••';
    return u.toString();
  } catch {
    return url.replace(/:[^:@]+@/, ':••••@');
  }
}

function formatBytes(bytes: number | undefined | null): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
