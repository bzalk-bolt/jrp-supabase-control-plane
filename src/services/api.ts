import type {
  Environment,
  EnvironmentCreateRequest,
  EnvironmentIdentity,
  Job,
  JobSummary,
  JobOptions,
  ResetOptions,
  DatabaseStatsResponse,
  TableStatsResponse,
  EdgeFunctionsResponse,
  EdgeFunctionDetailResponse,
  DatabaseFunctionsResponse,
  DatabaseTriggersResponse,
  Branch,
  BranchesResponse,
  BranchCreateRequest,
  BranchSaveRequest,
  BranchSwitchRequest,
  BranchResetRequest,
  BranchMergeRequest,
  BranchSchemasResponse,
  MigrationsListResponse,
  MigrationDetailResponse,
  SupabaseOrganizationsResponse,
  SupabaseProjectsResponse,
  SupabaseProjectDetailResponse,
  SupabaseBackupsResponse,
  ImportPlanRequest,
  ImportPlanResponse,
  PlatformToLocalImportRequest,
  PlatformToLocalImportResponse,
} from '../types/api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/sync-proxy`;

let tokenCache = '';
let supabaseAccessTokenCache = '';
let activeLocalEnvironmentId = '';

export function setTokenCache(token: string) {
  tokenCache = token;
}

export function getTokenCache(): string {
  return tokenCache;
}

export function setSupabaseAccessTokenCache(token: string) {
  supabaseAccessTokenCache = token;
}

export function getSupabaseAccessTokenCache(): string {
  return supabaseAccessTokenCache;
}

export function setActiveLocalEnvironmentId(id: string) {
  activeLocalEnvironmentId = id;
}

export function getActiveLocalEnvironmentId(): string {
  return activeLocalEnvironmentId;
}

export class ApiError extends Error {
  status: number;
  bodyText?: string;
  constructor(message: string, status: number, bodyText?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.bodyText = bodyText;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: string; supabaseAccessToken?: string; localEnvironmentId?: string } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const url = `${PROXY_URL}?path=${encodeURIComponent(path)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'X-Sync-Token': tokenCache,
  };

  const supabasePat = options.supabaseAccessToken ?? supabaseAccessTokenCache;
  if (supabasePat) {
    headers['X-Supabase-Access-Token'] = supabasePat;
  }

  const envId = options.localEnvironmentId ?? activeLocalEnvironmentId;
  if (envId) {
    headers['X-Local-Environment-Id'] = envId;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsedMessage = '';
    try {
      const parsed = text ? JSON.parse(text) : null;
      parsedMessage = parsed?.error || parsed?.message || '';
    } catch {
      parsedMessage = text;
    }
    const message = parsedMessage || res.statusText || `Request failed: ${res.status}`;
    throw new ApiError(message, res.status, text || undefined);
  }

  return res.json();
}

export async function healthCheck(): Promise<{ status: string }> {
  return request('/health');
}

export async function listEnvironments(): Promise<Environment[]> {
  const data = await request<{ environments: Environment[] }>('/v1/environments');
  return data.environments;
}

export async function listDefaultEnvironments(): Promise<Environment[]> {
  const data = await request<{ environments: Environment[] }>('/v1/environments', { localEnvironmentId: '' });
  return data.environments;
}

export async function getEnvironment(name: string): Promise<Environment> {
  const data = await request<{ environment: Environment }>(`/v1/environments/${encodeURIComponent(name)}`);
  return data.environment;
}

export async function getEnvironmentFor(name: string, localEnvironmentId: string): Promise<Environment> {
  const data = await request<{ environment: Environment }>(
    `/v1/environments/${encodeURIComponent(name)}`,
    { localEnvironmentId },
  );
  return data.environment;
}

export async function getEnvironmentIdentity(name: string): Promise<EnvironmentIdentity> {
  return request<EnvironmentIdentity>(`/v1/environments/${encodeURIComponent(name)}/identity`);
}

export async function getEnvironmentIdentityFor(name: string, localEnvironmentId: string): Promise<EnvironmentIdentity> {
  return request<EnvironmentIdentity>(
    `/v1/environments/${encodeURIComponent(name)}/identity`,
    { localEnvironmentId },
  );
}

export async function getDefaultEnvironmentIdentity(name: string): Promise<EnvironmentIdentity> {
  return request<EnvironmentIdentity>(
    `/v1/environments/${encodeURIComponent(name)}/identity`,
    { localEnvironmentId: '' },
  );
}

export async function createEnvironment(env: EnvironmentCreateRequest): Promise<Environment> {
  const data = await request<{ environment: Environment }>('/v1/environments', {
    method: 'POST',
    body: JSON.stringify(env),
  });
  return data.environment;
}

export async function deleteEnvironment(name: string): Promise<Environment> {
  const data = await request<{ environment: Environment }>(`/v1/environments/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  return data.environment;
}

export async function deleteEnvironmentFor(name: string, localEnvironmentId: string): Promise<Environment> {
  const data = await request<{ environment: Environment }>(`/v1/environments/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    localEnvironmentId,
  });
  return data.environment;
}

export async function planMigrations(name: string, options?: JobOptions): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/environments/${encodeURIComponent(name)}/migrations/plan`, {
    method: 'POST',
    body: options ? JSON.stringify(options) : undefined,
  });
  return data.job;
}

export async function applyMigrations(name: string, options?: JobOptions): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/environments/${encodeURIComponent(name)}/migrations/up`, {
    method: 'POST',
    body: options ? JSON.stringify(options) : undefined,
  });
  return data.job;
}

export async function validateEnvironment(name: string, options?: JobOptions): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/environments/${encodeURIComponent(name)}/validate`, {
    method: 'POST',
    body: options ? JSON.stringify(options) : undefined,
  });
  return data.job;
}

export async function listJobs(): Promise<JobSummary[]> {
  const data = await request<{ jobs: JobSummary[] }>('/v1/jobs');
  return data.jobs;
}

export async function getJob(id: string, localEnvironmentId?: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/jobs/${encodeURIComponent(id)}`, { localEnvironmentId });
  return data.job;
}

export async function getEnvironmentStats(name: string, exactRows = false): Promise<DatabaseStatsResponse> {
  const params = new URLSearchParams();
  if (exactRows) params.set('exact_rows', 'true');
  params.set('include_columns', 'true');
  return request<DatabaseStatsResponse>(`/v1/environments/${encodeURIComponent(name)}/stats?${params.toString()}`);
}

export async function getTableStats(envName: string, schema: string, table: string, exactRows = false): Promise<TableStatsResponse> {
  const params = new URLSearchParams({ schema, table });
  if (exactRows) params.set('exact_rows', 'true');
  return request<TableStatsResponse>(`/v1/environments/${encodeURIComponent(envName)}/table-stats?${params.toString()}`);
}

export async function getEdgeFunctions(envName: string): Promise<EdgeFunctionsResponse> {
  return request<EdgeFunctionsResponse>(`/v1/environments/${encodeURIComponent(envName)}/edge-functions`);
}

export async function getEdgeFunctionSource(envName: string, id: string): Promise<EdgeFunctionDetailResponse> {
  return request<EdgeFunctionDetailResponse>(`/v1/environments/${encodeURIComponent(envName)}/edge-functions/${encodeURIComponent(id)}/source`);
}

export async function getDatabaseFunctions(envName: string): Promise<DatabaseFunctionsResponse> {
  return request<DatabaseFunctionsResponse>(`/v1/environments/${encodeURIComponent(envName)}/database-functions`);
}

export async function getDatabaseTriggers(envName: string, includeInternal = false): Promise<DatabaseTriggersResponse> {
  const params = includeInternal ? '?include_internal=true' : '';
  return request<DatabaseTriggersResponse>(`/v1/environments/${encodeURIComponent(envName)}/database-triggers${params}`);
}

export async function resetDestination(envName: string, options: ResetOptions, localEnvironmentId?: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/environments/${encodeURIComponent(envName)}/reset/destination`, {
    method: 'POST',
    body: JSON.stringify(options),
    localEnvironmentId,
  });
  return data.job;
}

export async function resetSource(envName: string, options: ResetOptions, localEnvironmentId?: string): Promise<Job> {
  const data = await request<{ job: Job }>(`/v1/environments/${encodeURIComponent(envName)}/reset/source`, {
    method: 'POST',
    body: JSON.stringify(options),
    localEnvironmentId,
  });
  return data.job;
}

// --- Branching ---

export async function listBranches(envName?: string): Promise<BranchesResponse> {
  const qs = envName ? `?env=${encodeURIComponent(envName)}` : '';
  return request<BranchesResponse>(`/v1/branches${qs}`);
}

export async function getBranchSchemas(): Promise<BranchSchemasResponse> {
  return request<BranchSchemasResponse>('/v1/branches/schemas');
}

export async function getBranch(name: string): Promise<Branch> {
  const data = await request<{ branch: Branch }>(`/v1/branches/${encodeURIComponent(name)}`);
  return data.branch;
}

export async function createBranch(data: BranchCreateRequest): Promise<Job> {
  const res = await request<{ job: Job }>('/v1/branches', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.job;
}

export async function saveBranch(name?: string, options?: BranchSaveRequest): Promise<Job> {
  const path = name
    ? `/v1/branches/${encodeURIComponent(name)}/save`
    : '/v1/branches/save';
  const res = await request<{ job: Job }>(path, {
    method: 'POST',
    body: options ? JSON.stringify(options) : undefined,
  });
  return res.job;
}

export async function switchBranch(name: string, options?: BranchSwitchRequest): Promise<Job> {
  const res = await request<{ job: Job }>(`/v1/branches/${encodeURIComponent(name)}/switch`, {
    method: 'POST',
    body: JSON.stringify(options || { autosave: true }),
  });
  return res.job;
}

export async function resetBranch(name: string, options: BranchResetRequest): Promise<Job> {
  const res = await request<{ job: Job }>(`/v1/branches/${encodeURIComponent(name)}/reset`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  return res.job;
}

export async function deleteBranch(name: string): Promise<Branch> {
  const data = await request<{ branch: Branch }>(`/v1/branches/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  return data.branch;
}

export async function mergeBranch(name: string, options?: BranchMergeRequest): Promise<Job> {
  const res = await request<{ job: Job }>(`/v1/branches/${encodeURIComponent(name)}/merge`, {
    method: 'POST',
    body: JSON.stringify(options || { target_branch: 'main', autosave: true, activate: true }),
  });
  return res.job;
}

export async function pollJob(jobId: string): Promise<Job> {
  while (true) {
    const job = await getJob(jobId);
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await new Promise(r => setTimeout(r, 1500));
  }
}

// --- Migrations ---

export async function listMigrations(envName: string, localEnvironmentId?: string): Promise<MigrationsListResponse> {
  return request<MigrationsListResponse>(
    `/v1/environments/${encodeURIComponent(envName)}/migrations`,
    { localEnvironmentId },
  );
}

export async function getMigrationDetail(envName: string, version: string, localEnvironmentId?: string): Promise<MigrationDetailResponse> {
  return request<MigrationDetailResponse>(
    `/v1/environments/${encodeURIComponent(envName)}/migrations/${encodeURIComponent(version)}`,
    { localEnvironmentId },
  );
}

// --- Supabase Account Discovery ---

export async function listSupabaseOrganizations(supabaseAccessToken?: string, localEnvironmentId?: string): Promise<SupabaseOrganizationsResponse> {
  return request<SupabaseOrganizationsResponse>('/v1/supabase/organizations', { supabaseAccessToken, localEnvironmentId });
}

export async function listSupabaseProjects(organizationId?: string, supabaseAccessToken?: string, localEnvironmentId?: string): Promise<SupabaseProjectsResponse> {
  const path = organizationId
    ? `/v1/supabase/projects?organization_id=${encodeURIComponent(organizationId)}`
    : '/v1/supabase/projects';
  return request<SupabaseProjectsResponse>(path, { supabaseAccessToken, localEnvironmentId });
}

export async function getSupabaseProject(ref: string, supabaseAccessToken?: string): Promise<SupabaseProjectDetailResponse> {
  return request<SupabaseProjectDetailResponse>(
    `/v1/supabase/projects/${encodeURIComponent(ref)}`,
    { supabaseAccessToken }
  );
}

export async function listSupabaseProjectBackups(ref: string, supabaseAccessToken?: string): Promise<SupabaseBackupsResponse> {
  return request<SupabaseBackupsResponse>(
    `/v1/supabase/projects/${encodeURIComponent(ref)}/backups`,
    { supabaseAccessToken }
  );
}

// --- Import Plan ---

export async function planImport(req: ImportPlanRequest, supabaseAccessToken?: string, localEnvironmentId?: string): Promise<ImportPlanResponse> {
  return request<ImportPlanResponse>('/v1/imports/plan', {
    method: 'POST',
    body: JSON.stringify(req),
    supabaseAccessToken,
    localEnvironmentId,
  });
}

export async function startPlatformToLocalImport(
  req: PlatformToLocalImportRequest,
  supabaseAccessToken?: string,
  localEnvironmentId?: string,
): Promise<PlatformToLocalImportResponse> {
  return request<PlatformToLocalImportResponse>('/v1/imports/platform-to-local', {
    method: 'POST',
    body: JSON.stringify(req),
    supabaseAccessToken,
    localEnvironmentId,
  });
}

// --- Targeted requests for specific local environments ---

export async function listEnvironmentsFor(localEnvironmentId: string): Promise<Environment[]> {
  const data = await request<{ environments: Environment[] }>('/v1/environments', { localEnvironmentId });
  return data.environments;
}

export async function createEnvironmentFor(env: EnvironmentCreateRequest, localEnvironmentId: string): Promise<Environment> {
  const data = await request<{ environment: Environment }>('/v1/environments', {
    method: 'POST',
    body: JSON.stringify(env),
    localEnvironmentId,
  });
  return data.environment;
}
