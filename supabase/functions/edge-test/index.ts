import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Client as SSHClient } from "npm:ssh2@1.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROVIDER_API_BASE = Deno.env.get("PROVIDER_API_BASE") || "https://developers.hostinger.com";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- SSH helper ---

function execSsh(
  host: string,
  password: string,
  command: string,
  timeoutMs = 30_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err: Error | undefined, stream: unknown) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        const s = stream as {
          on: (ev: string, cb: (...args: unknown[]) => void) => unknown;
          stderr: { on: (ev: string, cb: (d: unknown) => void) => void };
        };
        s.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          resolve({ code: code || 0, stdout, stderr });
        });
        s.on("data", (data: unknown) => { stdout += String(data); });
        s.stderr.on("data", (data: unknown) => { stderr += String(data); });
      });
    });
    conn.on("error", (err: Error) => { clearTimeout(timeout); reject(err); });
    conn.connect({ host, port: 22, username: "root", password, readyTimeout: 20000 });
  });
}

// --- Environment lookup helper ---

async function lookupEnv(localEnvId: string) {
  const { data, error } = await admin
    .from("local_environments")
    .select("vps_ip, vps_root_password, apex_domain, subdomain, full_hostname, user_id")
    .eq("id", localEnvId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as {
    vps_ip: string;
    vps_root_password: string;
    apex_domain: string;
    subdomain: string;
    full_hostname: string;
    user_id: string;
  };
}

function environmentBaseDomain(env: { apex_domain?: string | null; subdomain?: string | null; full_hostname?: string | null }): string {
  const apex = (env.apex_domain || "").trim().toLowerCase();
  const sub = (env.subdomain || "").trim().toLowerCase();
  const full = (env.full_hostname || "").trim().toLowerCase();
  if (sub) return full || `${sub}.${apex}`;
  return apex || full;
}

// --- Operation: vps-reset-start ---

const DEFAULT_RESET_SCRIPT_URL = "https://raw.githubusercontent.com/bzalk/jrp-supabase/main/scripts/reset-vps.sh";

async function handleVpsResetStart(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    local_environment_id?: string;
    base_domain?: string;
    script_url?: string;
  };
  const localEnvId = body.local_environment_id;
  if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

  const env = await lookupEnv(localEnvId);
  if (!env) return jsonResponse({ error: "Environment not found" }, 404);
  if (!env.vps_ip) return jsonResponse({ error: "No VPS IP" }, 400);
  if (!env.vps_root_password) return jsonResponse({ error: "No root password stored" }, 400);

  const baseDomain = body.base_domain || environmentBaseDomain(env);
  if (!baseDomain) return jsonResponse({ error: "No base_domain available" }, 400);

  const scriptUrl = body.script_url || DEFAULT_RESET_SCRIPT_URL;
  if (!scriptUrl.startsWith("https://raw.githubusercontent.com/bzalk/")) {
    return jsonResponse({ error: "script_url not in allowlist" }, 400);
  }

  const sshCmd = [
    `nohup bash -lc 'export CONFIRM_RESET=RESET BASE_DOMAIN="${baseDomain}";`,
    `curl -fsSL "${scriptUrl}" -o /tmp/jrp-reset-vps.sh && chmod +x /tmp/jrp-reset-vps.sh && /tmp/jrp-reset-vps.sh'`,
    `>/root/jrp-reset-vps-ssh.log 2>&1 < /dev/null &`,
    `echo "started pid=$!"`,
  ].join(" ");

  const result = await execSsh(env.vps_ip, env.vps_root_password, sshCmd, 15_000);

  const pidMatch = result.stdout.match(/pid=(\d+)/);
  return jsonResponse({
    status: "started",
    pid: pidMatch ? pidMatch[1] : null,
    latest_log: "/root/jrp-reset-vps-latest.log",
    ssh_output: result.stdout.trim(),
  }, 200);
}

// --- Operation: vps-log-tail ---

const ALLOWED_LOGS: Record<string, string> = {
  reset: "tail -c __BYTES__ /root/jrp-reset-vps-latest.log 2>/dev/null || tail -c __BYTES__ /root/jrp-reset-vps-ssh.log 2>/dev/null || echo '[no log found]'",
  provision: "tail -c __BYTES__ /root/jrp-provision.log 2>/dev/null || echo '[no log found]'",
};

async function handleVpsLogTail(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    local_environment_id?: string;
    log?: string;
    bytes?: number;
  };
  const localEnvId = body.local_environment_id;
  if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

  const logName = body.log || "reset";
  const template = ALLOWED_LOGS[logName];
  if (!template) return jsonResponse({ error: `Unknown log: ${logName}. Allowed: ${Object.keys(ALLOWED_LOGS).join(", ")}` }, 400);

  const bytes = Math.min(Math.max(body.bytes || 12000, 500), 64000);

  const env = await lookupEnv(localEnvId);
  if (!env) return jsonResponse({ error: "Environment not found" }, 404);
  if (!env.vps_ip || !env.vps_root_password) return jsonResponse({ error: "No VPS credentials" }, 400);

  const cmd = template.replace(/__BYTES__/g, String(bytes));
  const result = await execSsh(env.vps_ip, env.vps_root_password, cmd, 15_000);

  return jsonResponse({
    status: "ok",
    output: result.stdout,
    stderr: result.stderr || undefined,
    exit_code: result.code,
    checked_at: new Date().toISOString(),
  }, 200);
}

// --- Operation: vps-status ---

const STATUS_CMD = `cd /opt/jrp-supabase/docker 2>/dev/null && docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo '[docker not available]'`;

async function handleVpsStatus(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { local_environment_id?: string };
  const localEnvId = body.local_environment_id;
  if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

  const env = await lookupEnv(localEnvId);
  if (!env) return jsonResponse({ error: "Environment not found" }, 404);
  if (!env.vps_ip || !env.vps_root_password) return jsonResponse({ error: "No VPS credentials" }, 400);

  const result = await execSsh(env.vps_ip, env.vps_root_password, STATUS_CMD, 15_000);

  return jsonResponse({
    status: "ok",
    output: result.stdout,
    stderr: result.stderr || undefined,
    exit_code: result.code,
    checked_at: new Date().toISOString(),
  }, 200);
}

// --- Operation: hostinger-request ---

const HOSTINGER_ALLOWLIST: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/api\/vps\/v1\/virtual-machines$/ },
  { method: "GET", pattern: /^\/api\/vps\/v1\/virtual-machines\/\d+$/ },
  { method: "POST", pattern: /^\/api\/vps\/v1\/virtual-machines\/\d+\/recreate$/ },
  { method: "POST", pattern: /^\/api\/vps\/v1\/post-install-scripts$/ },
  { method: "GET", pattern: /^\/api\/vps\/v1\/templates$/ },
  { method: "GET", pattern: /^\/api\/vps\/v1\/data-centers$/ },
];

async function handleHostingerRequest(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    method?: string;
    path?: string;
    body?: unknown;
    user_id?: string;
  };
  const method = (body.method || "GET").toUpperCase();
  const path = body.path || "";

  const allowed = HOSTINGER_ALLOWLIST.some(
    (rule) => rule.method === method && rule.pattern.test(path)
  );
  if (!allowed) {
    return jsonResponse({
      error: `Blocked: ${method} ${path} is not in the allowlist`,
      allowlist: HOSTINGER_ALLOWLIST.map((r) => `${r.method} ${r.pattern.source}`),
    }, 403);
  }

  // Try to get token from user_settings if user_id provided, else env var
  let token = Deno.env.get("HOSTINGER_API_TOKEN") || "";
  if (body.user_id) {
    const { data: settings } = await admin
      .from("user_settings")
      .select("vps_api_token")
      .eq("user_id", body.user_id)
      .maybeSingle();
    const row = settings as Record<string, string> | null;
    if (row?.vps_api_token) token = row.vps_api_token;
  }
  if (!token) return jsonResponse({ error: "No Hostinger API token configured" }, 400);

  const url = `${PROVIDER_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const fetchInit: RequestInit = { method, headers };
  if (body.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(body.body);
  }

  const res = await fetch(url, fetchInit);
  const text = await res.text();
  let responseBody: unknown;
  try { responseBody = JSON.parse(text); } catch { responseBody = text; }

  return jsonResponse({
    ok: res.ok,
    status: res.status,
    body: responseBody,
  }, 200);
}

// --- Router ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Only POST allowed" }, 405);
    }

    const url = new URL(req.url);
    const op = url.pathname.split("/").pop() || "";

    switch (op) {
      case "vps-reset-start":
        return await handleVpsResetStart(req);
      case "vps-log-tail":
        return await handleVpsLogTail(req);
      case "vps-status":
        return await handleVpsStatus(req);
      case "hostinger-request":
        return await handleHostingerRequest(req);
      default:
        return jsonResponse({
          error: `Unknown operation: ${op}`,
          available: ["vps-reset-start", "vps-log-tail", "vps-status", "hostinger-request"],
        }, 404);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
