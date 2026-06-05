const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function authedFetch(op: string, body: unknown): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/edge-test/${op}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

// --- VPS Reset Start ---

export interface VpsResetStartResponse {
  status: string;
  pid: string | null;
  latest_log: string;
  ssh_output: string;
}

export async function vpsResetStart(localEnvId: string, opts?: {
  base_domain?: string;
  script_url?: string;
}): Promise<VpsResetStartResponse> {
  const res = await authedFetch('vps-reset-start', {
    local_environment_id: localEnvId,
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Reset start failed (${res.status})`);
  return data as VpsResetStartResponse;
}

// --- VPS Log Tail ---

export interface VpsLogTailResponse {
  status: string;
  output: string;
  stderr?: string;
  exit_code: number;
  checked_at: string;
}

export async function vpsLogTail(localEnvId: string, opts?: {
  log?: string;
  bytes?: number;
}): Promise<VpsLogTailResponse> {
  const res = await authedFetch('vps-log-tail', {
    local_environment_id: localEnvId,
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Log tail failed (${res.status})`);
  return data as VpsLogTailResponse;
}

// --- VPS Status ---

export interface VpsStatusResponse {
  status: string;
  output: string;
  stderr?: string;
  exit_code: number;
  checked_at: string;
}

export async function vpsStatus(localEnvId: string): Promise<VpsStatusResponse> {
  const res = await authedFetch('vps-status', {
    local_environment_id: localEnvId,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Status check failed (${res.status})`);
  return data as VpsStatusResponse;
}

// --- Hostinger Request ---

export interface HostingerResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function hostingerRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<HostingerResponse> {
  const res = await authedFetch('hostinger-request', { method, path, body });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Hostinger request failed (${res.status})`);
  return data as HostingerResponse;
}
