import { useState } from 'react';
import {
  Building2, FolderOpen, Database, CheckCircle2, Loader2,
  ArrowRight, ArrowLeft, X, Cloud, Download, Eye, EyeOff, Info,
} from 'lucide-react';
import { syncApi, localEnvironmentsService } from '../services';
import type {
  LocalEnvironment,
  SupabaseOrganization,
  SupabaseProject,
  LocalEnvironmentBinding,
} from '../types/api';

type WizardStep = 'organization' | 'project' | 'connection' | 'options' | 'confirm';

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
  const [remoteDbUrl, setRemoteDbUrl] = useState('');
  const [showRemoteDbUrl, setShowRemoteDbUrl] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    setStep('connection');
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
        remote_db_url: remoteDbUrl.trim(),
      });

      const createdEnvName = `${env.name || env.apex_domain}-main`;
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
      } catch (envErr) {
        const msg = envErr instanceof Error ? envErr.message : '';
        if (!msg.includes('already exists')) {
          console.warn('[connect] environment creation on local sync-api failed', envErr);
        }
      }

      onComplete(binding);
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
    { key: 'connection', label: 'Connection', icon: Database },
    { key: 'options', label: 'Options', icon: Database },
    { key: 'confirm', label: 'Confirm', icon: CheckCircle2 },
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
        <button
          onClick={onCancel}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
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
        {error && (
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

        {step === 'connection' && (
          <ConnectionStep
            projectRef={selectedProject?.ref || ''}
            remoteDbUrl={remoteDbUrl}
            showRemoteDbUrl={showRemoteDbUrl}
            onRemoteDbUrlChange={setRemoteDbUrl}
            onToggleShow={() => setShowRemoteDbUrl(v => !v)}
            onNext={() => setStep('options')}
            onBack={() => setStep('project')}
          />
        )}

        {step === 'options' && (
          <OptionsStep
            databaseMode={databaseMode}
            onModeChange={setDatabaseMode}
            onNext={() => setStep('confirm')}
            onBack={() => setStep('connection')}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            orgName={selectedOrg?.name || ''}
            projectName={selectedProject?.name || ''}
            projectRef={selectedProject?.ref || ''}
            databaseMode={databaseMode}
            hasRemoteDbUrl={remoteDbUrl.trim().length > 0}
            envName={env.name || env.apex_domain}
            submitting={submitting}
            onConfirm={handleConfirm}
            onBack={() => setStep('options')}
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

function ConnectionStep({
  projectRef,
  remoteDbUrl,
  showRemoteDbUrl,
  onRemoteDbUrlChange,
  onToggleShow,
  onNext,
  onBack,
}: {
  projectRef: string;
  remoteDbUrl: string;
  showRemoteDbUrl: boolean;
  onRemoteDbUrlChange: (value: string) => void;
  onToggleShow: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const exampleRef = projectRef || 'project-ref';
  const example = `postgresql://postgres.${exampleRef}:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  const canContinue = remoteDbUrl.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300">Add the hosted database connection string:</p>
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200">
          Find this in Supabase under <span className="font-medium">Connect</span> or <span className="font-medium">Project Settings - Database</span>. Use the URI format and replace the password placeholder.
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="clone-remote-db-url" className="block text-sm font-medium text-gray-300">
          Connection string
        </label>
        <div className="relative">
          <input
            id="clone-remote-db-url"
            type={showRemoteDbUrl ? 'text' : 'password'}
            value={remoteDbUrl}
            onChange={(e) => onRemoteDbUrlChange(e.target.value)}
            placeholder={example}
            className="w-full pl-3 pr-10 py-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 font-mono"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
            title={showRemoteDbUrl ? 'Hide connection string' : 'Show connection string'}
          >
            {showRemoteDbUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 font-mono break-all">
          Example: {example}
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
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

function ConfirmStep({ orgName, projectName, projectRef, databaseMode, hasRemoteDbUrl, envName, submitting, onConfirm, onBack }: {
  orgName: string;
  projectName: string;
  projectRef: string;
  databaseMode: string;
  hasRemoteDbUrl: boolean;
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
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">DB Connection</span>
          <span className="text-gray-200 font-medium">{hasRemoteDbUrl ? 'Provided' : 'Missing'}</span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        This will connect your local environment to the remote project. After connecting, use "Pull Latest" to import the schema.
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
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}
