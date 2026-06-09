import { supabase } from '../lib/supabase';
import type {
  ConnectionMode,
  DomainVerification,
  DomainVerificationStatus,
  LocalEnvironment,
  LocalEnvironmentBinding,
  ProvisioningJob,
  VpsStatus,
} from '../types/api';

export interface LocalEnvironmentDraft {
  name?: string;
  apex_domain?: string;
  subdomain?: string;
  full_hostname?: string;
  dns_verification_token?: string;
  dns_verified_at?: string | null;
  vps_provider?: string;
  vps_id?: string;
  vps_ip?: string;
  vps_status?: VpsStatus;
  sync_api_url?: string;
  sync_api_token?: string;
  netlify_site_id?: string;
  netlify_url?: string;
  notes?: string;
  post_install_script_url?: string | null;
  post_install_status?: string | null;
  dns_a_record_verified_at?: string | null;
  last_health_check_at?: string | null;
  health_check_results?: Record<string, unknown> | null;
}

function randomToken(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
}

export function buildVerificationToken(): string {
  return randomToken('jamrock-verify');
}

export function composeFullHostname(subdomain: string, apex: string): string {
  const sub = (subdomain || '').trim().toLowerCase();
  const root = (apex || '').trim().toLowerCase();
  if (!root) return '';
  if (!sub) return root;
  return `${sub}.${root}`;
}

export function serviceBaseDomain(env: { apex_domain?: string | null; subdomain?: string | null; full_hostname?: string | null }): string {
  const apex = (env.apex_domain || '').trim().toLowerCase();
  const sub = (env.subdomain || '').trim().toLowerCase();
  const full = (env.full_hostname || '').trim().toLowerCase();
  if (sub) return full || composeFullHostname(sub, apex);
  return apex || full;
}

export function serviceHostname(
  service: 'supabase' | 'studio' | 'auth' | 'sync-api',
  env: { apex_domain?: string | null; subdomain?: string | null; full_hostname?: string | null }
): string {
  const base = serviceBaseDomain(env);
  return base ? `${service}.${base}` : '';
}

export function syncApiUrlForEnvironment(env: { apex_domain?: string | null; subdomain?: string | null; full_hostname?: string | null }): string {
  const hostname = serviceHostname('sync-api', env);
  return hostname ? `https://${hostname}` : '';
}

// --- Local environments ---

export async function listLocalEnvironments(): Promise<LocalEnvironment[]> {
  const { data, error } = await supabase
    .from('local_environments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as LocalEnvironment[];
}

export async function getLocalEnvironment(id: string): Promise<LocalEnvironment | null> {
  const { data, error } = await supabase
    .from('local_environments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as LocalEnvironment | null;
}

export async function createLocalEnvironment(draft: LocalEnvironmentDraft): Promise<LocalEnvironment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const insertRow = {
    user_id: user.id,
    name: draft.name ?? '',
    apex_domain: draft.apex_domain ?? '',
    subdomain: draft.subdomain ?? '',
    full_hostname: draft.full_hostname ?? composeFullHostname(draft.subdomain ?? '', draft.apex_domain ?? ''),
    dns_verification_token: draft.dns_verification_token ?? buildVerificationToken(),
    vps_provider: draft.vps_provider ?? 'hostinger',
    vps_status: draft.vps_status ?? 'pending',
    sync_api_url: draft.sync_api_url ?? '',
    sync_api_token: draft.sync_api_token ?? '',
    netlify_site_id: draft.netlify_site_id ?? '',
    netlify_url: draft.netlify_url ?? '',
    notes: draft.notes ?? '',
  };

  const { data, error } = await supabase
    .from('local_environments')
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create local environment');
  return data as LocalEnvironment;
}

export async function updateLocalEnvironment(id: string, draft: LocalEnvironmentDraft): Promise<LocalEnvironment> {
  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of [
    'name', 'apex_domain', 'subdomain', 'full_hostname', 'dns_verification_token',
    'dns_verified_at', 'vps_provider', 'vps_id', 'vps_ip', 'vps_status',
    'sync_api_url', 'sync_api_token', 'netlify_site_id', 'netlify_url', 'notes',
    'post_install_script_url', 'post_install_status', 'dns_a_record_verified_at',
    'last_health_check_at', 'health_check_results',
  ] as const) {
    if (draft[key] !== undefined) updateRow[key] = draft[key];
  }

  const { data, error } = await supabase
    .from('local_environments')
    .update(updateRow)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Local environment not found');
  return data as LocalEnvironment;
}

export function generateSyncApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function regenerateSyncToken(id: string): Promise<string> {
  const token = generateSyncApiToken();
  await updateLocalEnvironment(id, { sync_api_token: token });
  return token;
}

export async function deleteLocalEnvironment(id: string): Promise<void> {
  const { error } = await supabase
    .from('local_environments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// --- Domain verifications ---

export async function listDomainVerifications(): Promise<DomainVerification[]> {
  const { data, error } = await supabase
    .from('domain_verifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as DomainVerification[];
}

export async function getDomainVerification(apex: string): Promise<DomainVerification | null> {
  const { data, error } = await supabase
    .from('domain_verifications')
    .select('*')
    .eq('apex_domain', apex)
    .maybeSingle();
  if (error) throw error;
  return data as DomainVerification | null;
}

export async function upsertDomainVerification(apex: string): Promise<DomainVerification> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const existing = await getDomainVerification(apex);
  if (existing) return existing;

  const row = {
    user_id: user.id,
    apex_domain: apex.trim().toLowerCase(),
    token: randomToken('jamrock-verify'),
    status: 'pending' as DomainVerificationStatus,
  };
  const { data, error } = await supabase
    .from('domain_verifications')
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create domain verification');
  return data as DomainVerification;
}

export async function updateDomainVerification(
  id: string,
  patch: Partial<Pick<DomainVerification, 'status' | 'last_checked_at' | 'verified_at' | 'token'>>,
): Promise<DomainVerification> {
  const { data, error } = await supabase
    .from('domain_verifications')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Domain verification not found');
  return data as DomainVerification;
}

// --- Bindings ---

export async function listBindings(): Promise<LocalEnvironmentBinding[]> {
  const { data, error } = await supabase
    .from('local_environment_bindings')
    .select('*')
    .order('bound_at', { ascending: false });
  if (error) throw error;
  return (data || []) as LocalEnvironmentBinding[];
}

export async function createBinding(input: {
  local_environment_id: string;
  remote_project_ref: string;
  remote_organization_id?: string;
  remote_organization_name?: string;
  database_mode?: string;
  remote_db_url?: string;
}): Promise<LocalEnvironmentBinding> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row = {
    user_id: user.id,
    local_environment_id: input.local_environment_id,
    remote_project_ref: input.remote_project_ref,
    remote_organization_id: input.remote_organization_id ?? '',
    remote_organization_name: input.remote_organization_name ?? '',
    database_mode: input.database_mode ?? '',
    remote_db_url: input.remote_db_url ?? '',
  };
  const { data, error } = await supabase
    .from('local_environment_bindings')
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to create binding');
  return data as LocalEnvironmentBinding;
}

export async function deleteBinding(id: string): Promise<void> {
  const { error } = await supabase
    .from('local_environment_bindings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getBindingForEnvironment(localEnvId: string): Promise<LocalEnvironmentBinding | null> {
  const { data, error } = await supabase
    .from('local_environment_bindings')
    .select('*')
    .eq('local_environment_id', localEnvId)
    .maybeSingle();
  if (error) throw error;
  return data as LocalEnvironmentBinding | null;
}

export async function setConnectionMode(id: string, mode: ConnectionMode): Promise<void> {
  const { error } = await supabase
    .from('local_environments')
    .update({ connection_mode: mode, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// --- Provisioning jobs ---

export async function listProvisioningJobs(localEnvId: string): Promise<ProvisioningJob[]> {
  const { data, error } = await supabase
    .from('provisioning_jobs')
    .select('*')
    .eq('local_environment_id', localEnvId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ProvisioningJob[];
}

export async function getLatestRepairSslEvent(localEnvId: string): Promise<ProvisioningJob | null> {
  const { data, error } = await supabase
    .from('provisioning_jobs')
    .select('*')
    .eq('local_environment_id', localEnvId)
    .eq('phase', 'repair-ssl')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ProvisioningJob | null;
}

export async function getLatestResetVpsEvent(localEnvId: string): Promise<ProvisioningJob | null> {
  const { data, error } = await supabase
    .from('provisioning_jobs')
    .select('*')
    .eq('local_environment_id', localEnvId)
    .eq('phase', 'reset-vps')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ProvisioningJob | null;
}

export async function recordProvisioningEvent(input: {
  local_environment_id: string;
  phase: string;
  percent?: number;
  message?: string;
  status?: ProvisioningJob['status'];
  details?: Record<string, unknown>;
}): Promise<ProvisioningJob> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row = {
    user_id: user.id,
    local_environment_id: input.local_environment_id,
    phase: input.phase,
    percent: input.percent ?? 0,
    message: input.message ?? '',
    status: input.status ?? 'running',
    details: input.details ?? {},
    recorded_at_ms: Date.now(),
  };
  const { data, error } = await supabase
    .from('provisioning_jobs')
    .insert(row)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Failed to record provisioning event');
  return data as ProvisioningJob;
}
