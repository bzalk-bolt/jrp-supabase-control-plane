import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface ProviderPlan {
  id: string;
  name: string;
  description: string;
  monthly_price: number | null;
  currency: string | null;
  cpu: string | null;
  memory: string | null;
  storage: string | null;
}

export interface PlansResponse {
  configured: boolean;
  plans: ProviderPlan[];
  message?: string;
  error?: string;
}

export interface ProviderTemplate {
  id: string;
  name: string;
  description: string;
}

export interface TemplatesResponse {
  configured: boolean;
  templates: ProviderTemplate[];
  default_template_id?: string;
  error?: string;
}

export interface ProviderDataCenter {
  id: string;
  name: string;
  city: string;
  country: string;
}

export interface DataCentersResponse {
  configured: boolean;
  data_centers: ProviderDataCenter[];
  error?: string;
}

export interface StartResponse {
  local_environment_id: string;
  vps_id: string;
  status: string;
}

export interface PollResponse {
  status: string;
  ip: string;
  state?: string;
  error?: string;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/functions/v1/vps-provision/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Authorization': `Bearer ${bearer}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });
}

export async function listPlans(): Promise<PlansResponse> {
  const res = await authedFetch('list-plans', { method: 'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Failed to list plans (${res.status})`);
  }
  return body as PlansResponse;
}

export async function listTemplates(): Promise<TemplatesResponse> {
  const res = await authedFetch('list-templates', { method: 'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Failed to list templates (${res.status})`);
  }
  return body as TemplatesResponse;
}

export async function listDataCenters(): Promise<DataCentersResponse> {
  const res = await authedFetch('list-data-centers', { method: 'GET' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Failed to list data centers (${res.status})`);
  }
  return body as DataCentersResponse;
}

export async function startProvision(input: {
  local_environment_id: string;
  plan_id?: string;
  template_id?: string;
  datacenter_id?: string;
  public_key_id?: string;
}): Promise<StartResponse> {
  const res = await authedFetch('start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = body?.error || `Failed to start provisioning (${res.status})`;
    if (body?.details) {
      const d = body.details;
      const detail = typeof d === 'string' ? d : (d?.message || d?.error || JSON.stringify(d));
      msg += ` — ${detail}`;
    }
    throw new Error(msg);
  }
  return body as StartResponse;
}

export async function resumeSetup(input: {
  local_environment_id: string;
  template_id?: string;
  datacenter_id?: string;
  public_key_id?: string;
}): Promise<StartResponse> {
  const res = await authedFetch('resume-setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = body?.error || `Failed to resume setup (${res.status})`;
    if (body?.details) {
      const d = body.details;
      const detail = typeof d === 'string' ? d : (d?.message || d?.error || JSON.stringify(d));
      msg += ` — ${detail}`;
    }
    throw new Error(msg);
  }
  return body as StartResponse;
}

export interface ValidateInstallUrlResponse {
  ok: boolean;
  status?: number;
  size?: number;
  content_type?: string;
  error?: string;
}

export async function validateInstallUrl(url: string): Promise<ValidateInstallUrlResponse> {
  const res = await authedFetch('validate-install-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  const body = await res.json().catch(() => ({}));
  return body as ValidateInstallUrlResponse;
}

export async function pollProvision(localEnvId: string): Promise<PollResponse> {
  const res = await authedFetch('poll', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Failed to poll status (${res.status})`);
  }
  return body as PollResponse;
}

export interface RecreateResponse {
  local_environment_id: string;
  vps_id: string;
  status: string;
  message?: string;
}

export async function recreateVps(input: {
  local_environment_id: string;
  template_id?: string;
  post_install_script_url?: string;
}): Promise<RecreateResponse> {
  const res = await authedFetch('recreate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = body?.error || `Recreate failed (${res.status})`;
    if (body?.details) {
      const d = body.details;
      const detail = typeof d === 'string' ? d : (d?.message || d?.error || JSON.stringify(d));
      msg += ` — ${detail}`;
    }
    throw new Error(msg);
  }
  return body as RecreateResponse;
}

export interface VmDetailsResponse {
  vps_id: string;
  state: string;
  ip: string;
  hostname: string;
  template: unknown;
  cpus: number | null;
  memory_mb: number | null;
  disk_gb: number | null;
  data_center: unknown;
  firewall: unknown;
  created_at: string | null;
  raw: Record<string, unknown>;
}

export async function getVmDetails(localEnvId: string): Promise<VmDetailsResponse> {
  const res = await authedFetch('vm-details', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Failed to get VM details (${res.status})`);
  }
  return body as VmDetailsResponse;
}

export interface HealthCheckResponse {
  ip: string;
  hostname: string;
  checked_at: string;
  tcp_443: boolean;
  supabase_api: boolean;
  supabase_api_status?: number;
  supabase_api_error?: string;
  studio: boolean;
  studio_status?: number;
  studio_error?: string;
  auth: boolean;
  auth_status?: number;
  auth_error?: string;
  sync_api: boolean;
  sync_api_status?: number;
  sync_api_error?: string;
}

export async function runHealthCheck(localEnvId: string): Promise<HealthCheckResponse> {
  const res = await authedFetch('health-check', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Health check failed (${res.status})`);
  }
  return body as HealthCheckResponse;
}

export interface ConfigureDnsResponse {
  records: Array<{ hostname: string; status: string; message?: string }>;
  all_configured: boolean;
}

export async function configureDnsNetlify(localEnvId: string): Promise<ConfigureDnsResponse> {
  const res = await authedFetch('configure-dns', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `DNS configuration failed (${res.status})`);
  }
  return body as ConfigureDnsResponse;
}

export interface RepairSslResponse {
  status: string;
  message: string;
  ssh_command: string;
  output?: string;
  error?: string;
}

export async function repairSsl(localEnvId: string): Promise<RepairSslResponse> {
  const res = await authedFetch('repair-ssl', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const resp: RepairSslResponse = {
      status: 'failed',
      message: body?.error || `SSL repair failed (${res.status})`,
      ssh_command: body?.ssh_command || '',
      output: body?.output,
    };
    throw Object.assign(new Error(resp.message), { ssh_command: resp.ssh_command, output: resp.output });
  }
  return body as RepairSslResponse;
}

export interface ResetVpsResponse {
  status: string;
  message: string;
  ssh_command: string;
  output?: string;
  error?: string;
}

export async function resetVps(localEnvId: string): Promise<ResetVpsResponse> {
  const res = await authedFetch('reset-vps', {
    method: 'POST',
    body: JSON.stringify({ local_environment_id: localEnvId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const resp: ResetVpsResponse = {
      status: 'failed',
      message: body?.error || `VPS reset failed (${res.status})`,
      ssh_command: body?.ssh_command || '',
      output: body?.output,
    };
    throw Object.assign(new Error(resp.message), { ssh_command: resp.ssh_command, output: resp.output });
  }
  return body as ResetVpsResponse;
}
