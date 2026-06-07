import { useEffect, useRef, useState } from 'react';
import {
  Building2, FolderOpen, Database, CheckCircle2, Loader2,
  ArrowRight, ArrowLeft, X, Cloud, Download, AlertTriangle,
} from 'lucide-react';
import { syncApi, localEnvironmentsService } from '../services';
import type {
  LocalEnvironment,
  SupabaseOrganization,
  SupabaseProject,
  LocalEnvironmentBinding,
} from '../types/api';

type WizardStep = 'organization' | 'project' | 'options' | 'confirm' | 'importing';

interface Props {
  env: LocalEnvironment;
  onComplete: (binding: LocalEnvironmentBinding) => void;
  onCancel: () => void;
}

export default function ConnectProjectWizard({ env, onComplete, onCancel }: Props) {
  const [step, setStep] = useState<WizardStep>('organization');
  const [error, setError] = useState('');

  const [orgs, setOrgs] = useState<SupabaseOrganization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<SupabaseOrganization | null>(null);

  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<SupabaseProject | null>(null);

  const [databaseMode, setDatabaseMode] = useState<'schema-only' | 'schema-and-data'>('schema-only');
  const [submitting, setSubmitting] = useState(false);
  const [bindingResult, setBindingResult] = useState<LocalEnvironmentBinding | null>(null);
  const [envName, setEnvName] = useState('');
  const [importStatus, setImportStatus] = useState<'starting' | 'running' | 'completed' | 'failed'>('starting');
  const [importError, setImportError] = useState('');

  async function loadOrgs() {
    setOrgsLoading(true);
    setError('');
    try {
      const res = await syncApi.listSupabaseOrganizations();
      setOrgs(res.organizations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organizations');
    } finally {
      setOrgsLoading(false);
    }
  }

  async function loadProjects(orgId: string) {
    setProjectsLoading(true);
    setError('');
    try {
      const res = await syncApi.listSupabaseProjects(orgId);
      setProjects(res.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }

  function handleSelectOrg(org: SupabaseOrganization) {
    setSelectedOrg(org);
    setSelectedProject(null);
    setStep('project');
    loadProjects(org.id);
  }

  function handleSelectProject(project: SupabaseProject) {
    setSelectedProject(project);
    setStep('options');
  }

  async function handleConfirm() {
    if (!selectedProject || !selectedOrg) return;
    setSubmitting(true);
    setError('');
    try {
      await localEnvironmentsService.setConnectionMode(env.id, 'clone');

      const binding = await localEnvironmentsService.createBinding({
        local_environment_id: env.id,
        remote_project_ref: selectedProject.ref,
        remote_organization_id: selectedOrg.id,
        remote_organization_name: selectedOrg.name,
        database_mode: databaseMode,
      });

      const createdEnvName = `${env.name || env.apex_domain}-main`;
      let envCreated = false;
      try {
        await syncApi.createEnvironmentFor({
          name: createdEnvName,
          source_env: 'production',
          target_env: 'local',
          source_project_ref: selectedProject.ref,
          source_project_name: selectedProject.name,
          source_organization_name: selectedOrg.name,
          target_container: 'supabase-db',
          sync_storage_buckets: true,
        }, env.id);
        envCreated = true;
      } catch (envErr) {
        const msg = envErr instanceof Error ? envErr.message : '';
        if (msg.includes('already exists')) {
          envCreated = true;
        } else {
          console.warn('[connect] environment creation on local sync-api failed', envErr);
        }
      }

      setBindingResult(binding);
      setEnvName(createdEnvName);

      if (envCreated) {
        setStep('importing');
        setImportStatus('starting');
      } else {
        onComplete(binding);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create binding');
      setSubmitting(false);
    }
  }

  // Load orgs on mount
  if (step === 'organization' && orgs.length === 0 && !orgsLoading && !error) {
    loadOrgs();
  }

  const steps: { key: WizardStep; label: string; icon: typeof Cloud }[] = [
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'project', label: 'Project', icon: FolderOpen },
    { key: 'options', label: 'Options', icon: Database },
    { key: 'confirm', label: 'Confirm', icon: CheckCircle2 },
    { key: 'importing', label: 'Import', icon: Download },
  ];

  const currentIdx = steps.findIndex(s => s.key === step);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Download className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Clone Existing Supabase Project</h3>
            <p className="text-xs text-gray-500">Pull schema from a hosted project into this local environment</p>
          </div>
        </div>
        {step !== 'importing' && (
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className="px-6 py-3 border-b border-gray-800/50 bg-gray-950/50">
        <div className="flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-emerald-600/50' : 'bg-gray-700'}`} />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                  isDone ? 'text-emerald-400 bg-emerald-500/10' :
                  isActive ? 'text-blue-400 bg-blue-500/10' :
                  'text-gray-500'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 min-h-[280px]">
        {error && step !== 'importing' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {step === 'organization' && (
          <OrganizationStep
            orgs={orgs}
            loading={orgsLoading}
            onSelect={handleSelectOrg}
          />
        )}

        {step === 'project' && (
          <ProjectStep
            projects={projects}
            loading={projectsLoading}
            orgName={selectedOrg?.name || ''}
            onSelect={handleSelectProject}
            onBack={() => setStep('organization')}
          />
        )}

        {step === 'options' && (
          <OptionsStep
            databaseMode={databaseMode}
            onModeChange={setDatabaseMode}
            onNext={() => setStep('confirm')}
            onBack={() => setStep('project')}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            orgName={selectedOrg?.name || ''}
            projectName={selectedProject?.name || ''}
            projectRef={selectedProject?.ref || ''}
            databaseMode={databaseMode}
            envName={env.name || env.apex_domain}
            submitting={submitting}
            onConfirm={handleConfirm}
            onBack={() => setStep('options')}
          />
        )}

        {step === 'importing' && bindingResult && (
          <ImportingStep
            envName={envName}
            localEnvironmentId={env.id}
            databaseMode={databaseMode}
            status={importStatus}
            setStatus={setImportStatus}
            importError={importError}
            setImportError={setImportError}
            onDone={() => onComplete(bindingResult)}
          />
        )}
      </div>
    </div>
  );
}

function OrganizationStep({ orgs, loading, onSelect }: {
  orgs: SupabaseOrganization[];
  loading: boolean;
  onSelect: (org: SupabaseOrganization) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading organizations...
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No organizations found. Make sure your Supabase PAT is configured in Settings.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-300 mb-4">Select the Supabase organization that contains your project:</p>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {orgs.map(org => (
          <button
            key={org.id}
            onClick={() => onSelect(org)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl text-left transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200 truncate">{org.name}</div>
              {org.slug && <div className="text-xs text-gray-500 truncate">{org.slug}</div>}
            </div>
            <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectStep({ projects, loading, orgName, onSelect, onBack }: {
  projects: SupabaseProject[];
  loading: boolean;
  orgName: string;
  onSelect: (project: SupabaseProject) => void;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading projects...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-300">
          Select a project from <span className="text-blue-400 font-medium">{orgName}</span>:
        </p>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No projects found in this organization.
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => onSelect(project)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl text-left transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Database className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{project.name}</div>
                <div className="text-xs text-gray-500 font-mono truncate">{project.ref}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionsStep({ databaseMode, onModeChange, onNext, onBack }: {
  databaseMode: 'schema-only' | 'schema-and-data';
  onModeChange: (mode: 'schema-only' | 'schema-and-data') => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300">Choose what to import:</p>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>

      <div className="space-y-3">
        <label
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
            databaseMode === 'schema-only'
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="mode"
            checked={databaseMode === 'schema-only'}
            onChange={() => onModeChange('schema-only')}
            className="mt-1 w-4 h-4 text-emerald-600 border-gray-600 bg-gray-800 focus:ring-emerald-500/30"
          />
          <div>
            <div className="text-sm font-medium text-gray-200">Schema Only</div>
            <p className="text-xs text-gray-400 mt-1">
              Copies table definitions, functions, triggers, and RLS policies. No row data is transferred. Recommended for most dev setups.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
            databaseMode === 'schema-and-data'
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name="mode"
            checked={databaseMode === 'schema-and-data'}
            onChange={() => onModeChange('schema-and-data')}
            className="mt-1 w-4 h-4 text-emerald-600 border-gray-600 bg-gray-800 focus:ring-emerald-500/30"
          />
          <div>
            <div className="text-sm font-medium text-gray-200">Schema + Data</div>
            <p className="text-xs text-gray-400 mt-1">
              Copies table definitions and row data. Requires a direct database connection string. Use for staging environments that need production-like data.
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({ orgName, projectName, projectRef, databaseMode, envName, submitting, onConfirm, onBack }: {
  orgName: string;
  projectName: string;
  projectRef: string;
  databaseMode: string;
  envName: string;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300">Review and confirm:</p>
        <button onClick={onBack} disabled={submitting} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>

      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Local Environment</span>
          <span className="text-gray-200 font-medium">{envName}</span>
        </div>
        <div className="border-t border-gray-700/50" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Remote Organization</span>
          <span className="text-gray-200 font-medium">{orgName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Remote Project</span>
          <span className="text-gray-200 font-medium">{projectName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Project Ref</span>
          <span className="text-gray-200 font-mono text-xs">{projectRef}</span>
        </div>
        <div className="border-t border-gray-700/50" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Import Mode</span>
          <span className="text-gray-200 font-medium capitalize">{databaseMode.replace('-', ' & ').replace('only', 'Only')}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        This will connect your local environment to the remote project and configure sync. You can trigger the initial import afterward.
      </p>

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Connect and Configure
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ImportingStep({
  envName,
  localEnvironmentId,
  databaseMode,
  status,
  setStatus,
  importError,
  setImportError,
  onDone,
}: {
  envName: string;
  localEnvironmentId: string;
  databaseMode: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  setStatus: (s: 'starting' | 'running' | 'completed' | 'failed') => void;
  importError: string;
  setImportError: (s: string) => void;
  onDone: () => void;
}) {
  const startedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function startImport() {
      try {
        const job = await syncApi.resetDestination(
          envName,
          {
            confirm: 'RESET DESTINATION',
            reset_database: true,
            reset_edge_functions: databaseMode === 'schema-and-data',
          },
          localEnvironmentId,
        );

        setStatus('running');

        pollRef.current = setInterval(async () => {
          try {
            const updated = await syncApi.getJob(job.id, localEnvironmentId);
            if (updated.status === 'succeeded') {
              if (pollRef.current) clearInterval(pollRef.current);
              setStatus('completed');
            } else if (updated.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current);
              setStatus('failed');
              setImportError(updated.output || 'Import job failed');
            }
          } catch {
            // polling error is transient, keep trying
          }
        }, 4000);
      } catch (e) {
        setStatus('failed');
        setImportError(e instanceof Error ? e.message : 'Failed to start import');
      }
    }

    startImport();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [envName, localEnvironmentId, databaseMode, setStatus, setImportError]);

  if (status === 'starting' || status === 'running') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-200">
            {status === 'starting' ? 'Starting import...' : 'Importing schema to local environment...'}
          </p>
          <p className="text-xs text-gray-500 mt-1.5">
            This may take a minute. Pulling {databaseMode === 'schema-and-data' ? 'schema and data' : 'schema'} from the remote project.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-red-300">Import failed</p>
            {importError && (
              <p className="text-xs text-gray-400 mt-1.5 max-w-sm">{importError}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center">
          The connection was saved. You can retry by clicking "Pull Latest" on the connected project card.
        </p>
        <div className="flex justify-center">
          <button
            onClick={onDone}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors border border-gray-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-emerald-300">Import complete</p>
          <p className="text-xs text-gray-400 mt-1.5">
            Schema has been pulled from the remote project into your local environment.
          </p>
        </div>
      </div>
      <div className="flex justify-center">
        <button
          onClick={onDone}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Done
        </button>
      </div>
    </div>
  );
}
