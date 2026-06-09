import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Client as SSHClient } from "npm:ssh2@1.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROVIDER_API_BASE = Deno.env.get("PROVIDER_API_BASE") || "https://developers.hostinger.com";

interface ProviderConfig {
  apiToken: string;
  syncApiInstallUrl: string;
}

async function loadProviderConfig(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProviderConfig> {
  const { data } = await admin
    .from("user_settings")
    .select("vps_api_token, sync_api_install_url")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (data || {}) as Record<string, string | null>;
  return {
    apiToken: (row.vps_api_token as string) || Deno.env.get("HOSTINGER_API_TOKEN") || "",
    syncApiInstallUrl: (row.sync_api_install_url as string) || Deno.env.get("SYNC_API_INSTALL_URL") || "",
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface AuthedUser {
  id: string;
  client: ReturnType<typeof createClient>;
}

async function authenticate(req: Request): Promise<AuthedUser | Response> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
  }
  const accessToken = auth.slice(7).trim();

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { id: data.user.id, client: adminClient };
}

async function providerFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  if (!token) {
    throw new ProviderUnavailableError("VPS provider is not configured.");
  }
  const url = `${PROVIDER_API_BASE}${path}`;
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  return fetch(url, { ...init, headers });
}

class ProviderUnavailableError extends Error {}
class ProviderApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface ProviderPlan {
  id: string;
  name: string;
  description: string;
  monthly_price?: number | null;
  currency?: string | null;
  cpu?: string | null;
  memory?: string | null;
  storage?: string | null;
  raw: unknown;
}

function normalizeCatalogToPlans(catalog: unknown): ProviderPlan[] {
  if (!Array.isArray(catalog)) return [];
  const plans: ProviderPlan[] = [];
  for (const item of catalog) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const category = String(o.category || "").toLowerCase();
    const name = String(o.name || "");
    if (!category.includes("vps") && !name.toLowerCase().includes("vps")) continue;
    const prices = (o.prices as Array<Record<string, unknown>> | undefined) || [];
    const monthly = prices.find(p => p.period_unit === "month") || prices[0];
    if (!monthly) continue;
    const priceItemId = String(monthly.id || o.id || o.item_id || o.code || "");
    plans.push({
      id: priceItemId,
      name,
      description: String(o.description || ""),
      monthly_price: Number(monthly.price) / 100,
      currency: String(monthly.currency || "USD"),
      cpu: o.cpu ? String(o.cpu) : null,
      memory: o.memory ? String(o.memory) : null,
      storage: o.storage ? String(o.storage) : null,
      raw: item,
    });
  }
  return plans;
}

async function recordEvent(
  admin: ReturnType<typeof createClient>,
  userId: string,
  localEnvId: string,
  phase: string,
  percent: number,
  message: string,
  status: "queued" | "running" | "succeeded" | "failed",
  details: Record<string, unknown> = {},
) {
  await admin.from("provisioning_jobs").insert({
    user_id: userId,
    local_environment_id: localEnvId,
    phase,
    percent,
    message,
    status,
    details,
    recorded_at_ms: Date.now(),
  });
}

const DEFAULT_INSTALL_URL = "https://raw.githubusercontent.com/jamrock/sync-api/main/install.sh";

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function composeHostname(subdomain: string, apexDomain: string): string {
  const sub = subdomain.trim().toLowerCase();
  const apex = apexDomain.trim().toLowerCase();
  if (!apex) return "";
  return sub ? `${sub}.${apex}` : apex;
}

function environmentBaseDomain(envRow: Record<string, unknown>): string {
  const apexDomain = String(envRow.apex_domain || "").trim().toLowerCase();
  const subdomain = String(envRow.subdomain || "").trim().toLowerCase();
  const fullHostname = String(envRow.full_hostname || "").trim().toLowerCase();
  if (subdomain) return fullHostname || composeHostname(subdomain, apexDomain);
  return apexDomain || fullHostname;
}

function serviceHostname(service: "supabase" | "studio" | "auth" | "sync-api", envRow: Record<string, unknown>): string {
  const baseDomain = environmentBaseDomain(envRow);
  return baseDomain ? `${service}.${baseDomain}` : "";
}

function serviceDomainSet(envRow: Record<string, unknown>) {
  return {
    baseDomain: environmentBaseDomain(envRow),
    apiDomain: serviceHostname("supabase", envRow),
    studioDomain: serviceHostname("studio", envRow),
    authDomain: serviceHostname("auth", envRow),
    syncApiDomain: serviceHostname("sync-api", envRow),
  };
}

function buildPostInstallScript(
  installUrl: string,
  context: {
    syncApiToken: string;
    hostname: string;
    syncApiUrl: string;
    apexDomain: string;
    subdomain: string;
    baseDomain: string;
    apiDomain: string;
    studioDomain: string;
    authDomain: string;
    syncApiDomain: string;
  },
): string {
  const url = installUrl || DEFAULT_INSTALL_URL;
  return [
    "#!/bin/bash",
    "set -euo pipefail",
    "exec > >(tee -a /var/log/sync-api-install.log) 2>&1",
    "export DEBIAN_FRONTEND=noninteractive",
    `export HOSTNAME=${shellQuote(context.hostname)}`,
    `export SYNC_API_TOKEN=${shellQuote(context.syncApiToken)}`,
    `export SYNC_API_URL=${shellQuote(context.syncApiUrl)}`,
    `export APEX_DOMAIN=${shellQuote(context.apexDomain)}`,
    `export SUBDOMAIN=${shellQuote(context.subdomain)}`,
    `export BASE_DOMAIN=${shellQuote(context.baseDomain)}`,
    `export API_DOMAIN=${shellQuote(context.apiDomain)}`,
    `export STUDIO_DOMAIN=${shellQuote(context.studioDomain)}`,
    `export AUTH_DOMAIN=${shellQuote(context.authDomain)}`,
    `export SYNC_API_DOMAIN=${shellQuote(context.syncApiDomain)}`,
    "apt-get update -y",
    "apt-get install -y ca-certificates curl",
    "INSTALL_SCRIPT=/usr/local/bin/sync-api-install.sh",
    `curl -fsSL --retry 5 --retry-delay 3 -o "$INSTALL_SCRIPT" ${shellQuote(url)}`,
    'if [ ! -s "$INSTALL_SCRIPT" ]; then echo "Bootstrap script empty or missing" >&2; exit 1; fi',
    'chmod +x "$INSTALL_SCRIPT"',
    'bash "$INSTALL_SCRIPT"',
  ].join("\n");
}

async function validateInstallUrl(url: string): Promise<{
  ok: boolean;
  status?: number;
  size?: number;
  content_type?: string;
  error?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "URL must use https" };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, size: text.length, content_type: res.headers.get("content-type") || "" };
    }
    if (text.length === 0) {
      return { ok: false, status: res.status, error: "Script body is empty" };
    }
    return {
      ok: true,
      status: res.status,
      size: text.length,
      content_type: res.headers.get("content-type") || "",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" };
  }
}

function generateSyncApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateRootPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*";
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

interface StartRequest {
  local_environment_id?: string;
  plan_id?: string;
  template_id?: string;
  datacenter_id?: string;
  public_key_id?: string;
}

interface PollRequest {
  local_environment_id?: string;
}

async function handleListPlans(user: AuthedUser): Promise<Response> {
  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({
      configured: false,
      plans: [],
      message: "Provider not configured.",
    }, 200);
  }
  try {
    const res = await providerFetch(cfg.apiToken, "/api/billing/v1/catalog?category=VPS");
    const body = await readJson(res);
    if (!res.ok) {
      throw new ProviderApiError(res.status, body, `Catalog fetch failed: ${res.status}`);
    }
    const items = (body && typeof body === "object" && "data" in body)
      ? (body as Record<string, unknown>).data
      : body;
    const plans = normalizeCatalogToPlans(items);
    return jsonResponse({ configured: true, plans }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ configured: !!cfg.apiToken, plans: [], error: message }, 500);
  }
}

interface ProviderTemplate {
  id: string;
  name: string;
  description: string;
  raw: unknown;
}

function normalizeTemplates(body: unknown): ProviderTemplate[] {
  const items = (body && typeof body === "object" && "data" in body)
    ? (body as Record<string, unknown>).data
    : body;
  if (!Array.isArray(items)) return [];
  return items
    .filter(it => it && typeof it === "object")
    .map(it => {
      const o = it as Record<string, unknown>;
      return {
        id: String(o.id || o.template_id || ""),
        name: String(o.name || o.title || ""),
        description: String(o.description || ""),
        raw: it,
      };
    })
    .filter(t => t.id);
}

interface ProviderDataCenter {
  id: string;
  name: string;
  city: string;
  country: string;
  raw: unknown;
}

function normalizeDataCenters(body: unknown): ProviderDataCenter[] {
  const items = (body && typeof body === "object" && "data" in body)
    ? (body as Record<string, unknown>).data
    : body;
  if (!Array.isArray(items)) return [];
  return items
    .filter(it => it && typeof it === "object")
    .map(it => {
      const o = it as Record<string, unknown>;
      return {
        id: String(o.id || o.data_center_id || ""),
        name: String(o.name || o.title || ""),
        city: String(o.city || o.location || ""),
        country: String(o.country || ""),
        raw: it,
      };
    })
    .filter(d => d.id);
}

async function fetchTemplates(token: string): Promise<ProviderTemplate[]> {
  const res = await providerFetch(token, "/api/vps/v1/templates");
  const body = await readJson(res);
  if (!res.ok) {
    throw new ProviderApiError(res.status, body, `Templates fetch failed: ${res.status}`);
  }
  return normalizeTemplates(body);
}

async function fetchDataCenters(token: string): Promise<ProviderDataCenter[]> {
  const res = await providerFetch(token, "/api/vps/v1/data-centers");
  const body = await readJson(res);
  if (!res.ok) {
    throw new ProviderApiError(res.status, body, `Data centers fetch failed: ${res.status}`);
  }
  return normalizeDataCenters(body);
}

function pickDefaultTemplate(templates: ProviderTemplate[]): ProviderTemplate | null {
  const lower = (t: ProviderTemplate) => `${t.name} ${t.description}`.toLowerCase();
  const preferences = [
    /ubuntu\s*24\.?04/,
    /ubuntu\s*22\.?04/,
    /ubuntu/,
    /debian/,
  ];
  for (const re of preferences) {
    const found = templates.find(t => re.test(lower(t)));
    if (found) return found;
  }
  return templates[0] || null;
}

async function handleListTemplates(user: AuthedUser): Promise<Response> {
  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({ configured: false, templates: [] }, 200);
  }
  try {
    const templates = await fetchTemplates(cfg.apiToken);
    const def = pickDefaultTemplate(templates);
    return jsonResponse({
      configured: true,
      templates,
      default_template_id: def?.id || "",
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ configured: true, templates: [], error: message }, 500);
  }
}

async function handleListDataCenters(user: AuthedUser): Promise<Response> {
  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({ configured: false, data_centers: [] }, 200);
  }
  try {
    const data = await fetchDataCenters(cfg.apiToken);
    return jsonResponse({ configured: true, data_centers: data }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ configured: true, data_centers: [], error: message }, 500);
  }
}

async function handleStart(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as StartRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({
      error: "Server provider is not configured. Add a provider API token in Settings.",
    }, 503);
  }

  const planId = (body.plan_id || "").trim();
  if (!planId) {
    return jsonResponse({ error: "plan_id is required" }, 400);
  }
  let templateId = (body.template_id || "").trim();
  const datacenterId = (body.datacenter_id || "").trim();
  if (!datacenterId) {
    return jsonResponse({ error: "datacenter_id is required" }, 400);
  }
  const publicKeyId = (body.public_key_id || "").trim();

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  if (envRow.vps_id) {
    return jsonResponse({ error: "This environment already has a server provisioned." }, 409);
  }
  if (!envRow.dns_verified_at) {
    return jsonResponse({ error: "Domain ownership must be verified before provisioning." }, 400);
  }

  if (!templateId) {
    try {
      const templates = await fetchTemplates(cfg.apiToken);
      const def = pickDefaultTemplate(templates);
      if (!def) {
        return jsonResponse({ error: "Provider returned no usable OS templates." }, 502);
      }
      templateId = def.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ error: `Failed to discover OS templates: ${message}` }, 502);
    }
  }

  const domains = serviceDomainSet(envRow);
  const hostname = domains.baseDomain;
  const rootPassword = generateRootPassword();
  const syncApiToken = generateSyncApiToken();
  const installUrl = cfg.syncApiInstallUrl || DEFAULT_INSTALL_URL;

  const urlCheck = await validateInstallUrl(installUrl);
  if (!urlCheck.ok) {
    await recordEvent(user.client, user.id, localEnvId, "purchase", 5, `Bootstrap script unreachable: ${urlCheck.error || urlCheck.status}`, "failed", { install_url: installUrl, ...urlCheck });
    return jsonResponse({ error: `Bootstrap script URL is not reachable: ${urlCheck.error || `status ${urlCheck.status}`}` }, 400);
  }

  const postInstallScript = buildPostInstallScript(installUrl, {
    syncApiToken,
    hostname,
    syncApiUrl: `https://${domains.syncApiDomain}`,
    apexDomain: String(envRow.apex_domain || ""),
    subdomain: String(envRow.subdomain || ""),
    ...domains,
  });

  await user.client.from("local_environments").update({
    vps_status: "provisioning",
    sync_api_token: syncApiToken,
    sync_api_url: `https://${domains.syncApiDomain}`,
    vps_root_password: rootPassword,
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "purchase", 5, "Creating post-install script", "running");

  let postInstallScriptId: number | null = null;
  try {
    const scriptRes = await providerFetch(cfg.apiToken, "/api/vps/v1/post-install-scripts", {
      method: "POST",
      body: JSON.stringify({
        name: `sync-api-${localEnvId.slice(0, 8)}`,
        content: postInstallScript,
      }),
    });
    const scriptJson = await readJson(scriptRes) as Record<string, unknown> | null;
    if (!scriptRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "purchase", 5, `Post-install script creation failed: ${scriptRes.status}`, "failed", { response: scriptJson });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Failed to create post-install script (${scriptRes.status})`, details: scriptJson }, 502);
    }
    postInstallScriptId = Number((scriptJson as Record<string, unknown>)?.id || 0);
    if (!postInstallScriptId) {
      await recordEvent(user.client, user.id, localEnvId, "purchase", 5, "Post-install script created but no ID returned", "failed", { response: scriptJson });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: "Provider did not return a post-install script ID", details: scriptJson }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordEvent(user.client, user.id, localEnvId, "purchase", 5, message, "failed");
    await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await recordEvent(user.client, user.id, localEnvId, "purchase", 10, "Submitting purchase order", "running");

  let virtualMachineId = "";
  try {
    const setupObj: Record<string, unknown> = {
      template_id: Number(templateId),
      data_center_id: Number(datacenterId),
      hostname,
      password: rootPassword,
      post_install_script_id: postInstallScriptId,
    };
    if (publicKeyId) {
      setupObj.public_key = { id: Number(publicKeyId) };
    }
    const purchaseBody: Record<string, unknown> = {
      item_id: planId,
      setup: setupObj,
    };
    const purchaseRes = await providerFetch(cfg.apiToken, "/api/vps/v1/virtual-machines", {
      method: "POST",
      body: JSON.stringify(purchaseBody),
    });
    const purchaseJson = await readJson(purchaseRes);
    if (!purchaseRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "purchase", 10, `Purchase failed: ${purchaseRes.status}`, "failed", { response: purchaseJson, request: purchaseBody });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Provider purchase failed (${purchaseRes.status})`, details: purchaseJson }, 502);
    }
    const pj = (purchaseJson || {}) as Record<string, unknown>;
    const vm = (pj.virtual_machine || {}) as Record<string, unknown>;
    virtualMachineId = String(vm.id || pj.virtual_machine_id || pj.id || pj.vm_id || "");
    if (!virtualMachineId) {
      await recordEvent(user.client, user.id, localEnvId, "purchase", 15, "Purchase succeeded but no VM id returned", "failed", { response: purchaseJson });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: "Provider did not return a virtual machine id", details: purchaseJson }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordEvent(user.client, user.id, localEnvId, "purchase", 10, message, "failed");
    await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await user.client.from("local_environments").update({
    vps_id: virtualMachineId,
    vps_status: "installing",
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "boot", 60, "Server purchased and installing OS", "running", { vps_id: virtualMachineId });

  return jsonResponse({
    local_environment_id: localEnvId,
    vps_id: virtualMachineId,
    status: "installing",
  }, 202);
}

async function handlePoll(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as PollRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  const vmId = String(envRow.vps_id || "");
  if (!vmId) {
    return jsonResponse({ status: envRow.vps_status, ip: envRow.vps_ip || "" }, 200);
  }
  if (envRow.vps_status === "ready" || envRow.vps_status === "failed" || envRow.vps_status === "destroyed") {
    return jsonResponse({ status: envRow.vps_status, ip: envRow.vps_ip || "" }, 200);
  }

  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({ error: "Provider not configured" }, 503);
  }

  try {
    const res = await providerFetch(cfg.apiToken, `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}`);
    const j = await readJson(res);
    if (!res.ok) {
      return jsonResponse({ error: `Provider status failed (${res.status})`, details: j }, 502);
    }
    const detail = (j || {}) as Record<string, unknown>;
    const state = String(detail.state || detail.status || "").toLowerCase();
    const ipv4 = (detail.ipv4 as Array<Record<string, unknown>> | undefined) || [];
    const primaryIp = ipv4.length > 0 ? String(ipv4[0].address || "") : String(detail.ip || detail.public_ip || "");

    let vpsStatus: string = String(envRow.vps_status || "installing");
    let percent = 70;
    let phase = "boot";
    let message = "Server booting up";
    let runStatus: "running" | "succeeded" | "failed" = "running";

    if (state === "running" && primaryIp) {
      vpsStatus = "ready";
      percent = 100;
      phase = "ready";
      message = "Server is online";
      runStatus = "succeeded";
    } else if (state === "stopped" || state === "error" || state === "failed") {
      vpsStatus = "failed";
      percent = 70;
      phase = "boot";
      message = `Server entered state: ${state}`;
      runStatus = "failed";
    } else if (state === "installing" || state === "creating" || state === "initial") {
      vpsStatus = "installing";
      phase = "install";
      percent = 50;
      message = "Installing operating system";
    }

    const updates: Record<string, unknown> = {
      vps_status: vpsStatus,
      updated_at: new Date().toISOString(),
    };
    if (primaryIp) updates.vps_ip = primaryIp;
    if (vpsStatus === "ready") {
      updates.post_install_status = "completed";
    } else if (vpsStatus === "failed") {
      updates.post_install_status = "failed";
    }
    await user.client.from("local_environments").update(updates).eq("id", localEnvId);
    await recordEvent(user.client, user.id, localEnvId, phase, percent, message, runStatus, { state, ip: primaryIp });

    return jsonResponse({ status: vpsStatus, ip: primaryIp, state }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

interface ResumeSetupRequest {
  local_environment_id?: string;
  template_id?: string;
  datacenter_id?: string;
  public_key_id?: string;
}

async function handleResumeSetup(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as ResumeSetupRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({ error: "Server provider is not configured." }, 503);
  }

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  const vmId = String(envRow.vps_id || "");
  if (!vmId) {
    return jsonResponse({ error: "No VPS associated with this environment. Use /start instead." }, 400);
  }

  // Check current VM state before attempting setup
  try {
    const stateRes = await providerFetch(cfg.apiToken, `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}`);
    const stateJson = await readJson(stateRes) as Record<string, unknown> | null;
    if (stateRes.ok && stateJson) {
      const currentState = String(stateJson.state || "").toLowerCase();
      if (currentState === "running") {
        // VM is already running -- skip setup, just update status and let poll take over
        const ipv4 = (stateJson.ipv4 as Array<Record<string, unknown>> | undefined) || [];
        const primaryIp = ipv4.length > 0 ? String(ipv4[0].address || "") : String(stateJson.ip || stateJson.public_ip || "");
        const updates: Record<string, unknown> = {
          vps_status: "installing",
          updated_at: new Date().toISOString(),
        };
        if (primaryIp) updates.vps_ip = primaryIp;
        await user.client.from("local_environments").update(updates).eq("id", localEnvId);
        await recordEvent(user.client, user.id, localEnvId, "resume-setup", 60, "VM is already running, skipping setup", "running", { state: currentState, ip: primaryIp });
        return jsonResponse({
          local_environment_id: localEnvId,
          vps_id: vmId,
          status: "installing",
          message: "Server is already running. Polling will finalize status.",
        }, 202);
      }
      if (currentState === "stopped" || currentState === "error") {
        await recordEvent(user.client, user.id, localEnvId, "resume-setup", 20, `VM is in ${currentState} state`, "failed", { state: currentState });
        await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
        return jsonResponse({ error: `Server is in '${currentState}' state. It may need manual attention in the provider panel.` }, 409);
      }
      // state is "initial" or "installing" -- proceed with setup below
    }
  } catch {
    // Non-fatal: if state check fails, we still attempt setup
  }

  let templateId = (body.template_id || "").trim();
  const datacenterId = (body.datacenter_id || "").trim();
  const publicKeyId = (body.public_key_id || "").trim();

  if (!templateId) {
    try {
      const templates = await fetchTemplates(cfg.apiToken);
      const def = pickDefaultTemplate(templates);
      if (!def) return jsonResponse({ error: "Provider returned no usable OS templates." }, 502);
      templateId = def.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ error: `Failed to discover OS templates: ${message}` }, 502);
    }
  }

  const domains = serviceDomainSet(envRow);
  const hostname = domains.baseDomain;
  const rootPassword = generateRootPassword();
  const syncApiToken = String(envRow.sync_api_token || "") || generateSyncApiToken();
  const installUrl = cfg.syncApiInstallUrl || DEFAULT_INSTALL_URL;

  const urlCheck = await validateInstallUrl(installUrl);
  if (!urlCheck.ok) {
    return jsonResponse({ error: `Bootstrap script URL is not reachable: ${urlCheck.error || `status ${urlCheck.status}`}` }, 400);
  }

  const postInstallScript = buildPostInstallScript(installUrl, {
    syncApiToken,
    hostname,
    syncApiUrl: `https://${domains.syncApiDomain}`,
    apexDomain: String(envRow.apex_domain || ""),
    subdomain: String(envRow.subdomain || ""),
    ...domains,
  });

  await user.client.from("local_environments").update({
    vps_status: "provisioning",
    sync_api_token: syncApiToken,
    sync_api_url: `https://${domains.syncApiDomain}`,
    vps_root_password: rootPassword,
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "resume-setup", 20, "Creating post-install script for setup retry", "running");

  let postInstallScriptId: number | null = null;
  try {
    const scriptRes = await providerFetch(cfg.apiToken, "/api/vps/v1/post-install-scripts", {
      method: "POST",
      body: JSON.stringify({
        name: `sync-api-${localEnvId.slice(0, 8)}-r`,
        content: postInstallScript,
      }),
    });
    const scriptJson = await readJson(scriptRes) as Record<string, unknown> | null;
    if (!scriptRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "resume-setup", 20, `Post-install script creation failed: ${scriptRes.status}`, "failed", { response: scriptJson });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Failed to create post-install script (${scriptRes.status})`, details: scriptJson }, 502);
    }
    postInstallScriptId = Number((scriptJson as Record<string, unknown>)?.id || 0);
    if (!postInstallScriptId) {
      await recordEvent(user.client, user.id, localEnvId, "resume-setup", 20, "Post-install script created but no ID returned", "failed", { response: scriptJson });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: "Provider did not return a post-install script ID", details: scriptJson }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordEvent(user.client, user.id, localEnvId, "resume-setup", 20, message, "failed");
    await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await recordEvent(user.client, user.id, localEnvId, "resume-setup", 40, "Calling setup endpoint on existing VM", "running");

  try {
    const setupObj: Record<string, unknown> = {
      template_id: Number(templateId),
      hostname,
      password: rootPassword,
      post_install_script_id: postInstallScriptId,
    };
    if (datacenterId) {
      setupObj.data_center_id = Number(datacenterId);
    }
    if (publicKeyId) {
      setupObj.public_key = { id: Number(publicKeyId) };
    }
    const setupRes = await providerFetch(cfg.apiToken, `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}/setup`, {
      method: "POST",
      body: JSON.stringify(setupObj),
    });
    const setupJson = await readJson(setupRes);
    if (!setupRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "resume-setup", 40, `Setup failed: ${setupRes.status}`, "failed", { response: setupJson, request: setupObj });
      await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Provider setup failed (${setupRes.status})`, details: setupJson }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordEvent(user.client, user.id, localEnvId, "resume-setup", 40, message, "failed");
    await user.client.from("local_environments").update({ vps_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await user.client.from("local_environments").update({
    vps_status: "installing",
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "boot", 60, "Setup submitted, server is installing OS", "running", { vps_id: vmId });

  return jsonResponse({
    local_environment_id: localEnvId,
    vps_id: vmId,
    status: "installing",
  }, 202);
}

// --- Recreate: wipe OS and reinstall with post-install script ---

interface RecreateRequest {
  local_environment_id?: string;
  template_id?: string;
  post_install_script_url?: string;
}

async function handleRecreate(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as RecreateRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) {
    return jsonResponse({ error: "Server provider is not configured." }, 503);
  }

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  const vmId = String(envRow.vps_id || "");
  if (!vmId) {
    return jsonResponse({ error: "No VPS associated with this environment." }, 400);
  }

  let templateId = (body.template_id || "").trim();
  if (!templateId) {
    try {
      const templates = await fetchTemplates(cfg.apiToken);
      const def = pickDefaultTemplate(templates);
      if (!def) return jsonResponse({ error: "Provider returned no usable OS templates." }, 502);
      templateId = def.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonResponse({ error: `Failed to discover OS templates: ${message}` }, 502);
    }
  }

  const scriptUrl = (body.post_install_script_url || "").trim();
  const apexDomain = String(envRow.apex_domain || "");
  const domains = serviceDomainSet(envRow);
  const hostname = domains.baseDomain;
  const syncApiToken = String(envRow.sync_api_token || "") || generateSyncApiToken();

  await user.client.from("local_environments").update({
    vps_status: "provisioning",
    post_install_script_url: scriptUrl || null,
    post_install_status: "running",
    sync_api_token: syncApiToken,
    sync_api_url: `https://${domains.syncApiDomain}`,
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "recreate", 10, "Creating post-install script for recreate", "running");

  // Build the post-install script content
  let scriptContent: string;
  if (scriptUrl) {
    // Use the user-provided script URL (the jrp hostinger-post-install.sh)
    scriptContent = [
      "#!/bin/bash",
      "set -Eeuo pipefail",
      "exec > >(tee -a /post_install.log) 2>&1",
      `export BASE_DOMAIN=${shellQuote(domains.baseDomain)}`,
      `export LETSENCRYPT_EMAIL=${shellQuote(`admin@${apexDomain}`)}`,
      `export API_DOMAIN=${shellQuote(domains.apiDomain)}`,
      `export STUDIO_DOMAIN=${shellQuote(domains.studioDomain)}`,
      `export AUTH_DOMAIN=${shellQuote(domains.authDomain)}`,
      `export SYNC_API_DOMAIN=${shellQuote(domains.syncApiDomain)}`,
      `export SYNC_API_TOKEN=${shellQuote(syncApiToken)}`,
      `export JRP_REPO_URL="https://github.com/bzalk/jrp-supabase.git"`,
      `export JRP_REPO_BRANCH="main"`,
      `export JRP_INSTALL_DIR="/opt/jrp-supabase"`,
      "apt-get update",
      "apt-get install -y curl ca-certificates",
      `curl -fsSL ${shellQuote(scriptUrl)} -o /tmp/jrp-post-install.sh`,
      "chmod +x /tmp/jrp-post-install.sh",
      "/tmp/jrp-post-install.sh",
    ].join("\n");
  } else {
    // Fallback to our built-in sync-api install script
    const installUrl = cfg.syncApiInstallUrl || DEFAULT_INSTALL_URL;
    scriptContent = buildPostInstallScript(installUrl, {
      syncApiToken,
      hostname,
      syncApiUrl: `https://${domains.syncApiDomain}`,
      apexDomain,
      subdomain: String(envRow.subdomain || ""),
      ...domains,
    });
  }

  let postInstallScriptId: number | null = null;
  try {
    const scriptRes = await providerFetch(cfg.apiToken, "/api/vps/v1/post-install-scripts", {
      method: "POST",
      body: JSON.stringify({
        name: `recreate-${localEnvId.slice(0, 8)}-${Date.now()}`,
        content: scriptContent,
      }),
    });
    const scriptJson = await readJson(scriptRes) as Record<string, unknown> | null;
    if (!scriptRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "recreate", 10, `Script creation failed: ${scriptRes.status}`, "failed", { response: scriptJson });
      await user.client.from("local_environments").update({ vps_status: "failed", post_install_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Failed to create post-install script (${scriptRes.status})`, details: scriptJson }, 502);
    }
    postInstallScriptId = Number((scriptJson as Record<string, unknown>)?.id || 0);
    if (!postInstallScriptId) {
      await user.client.from("local_environments").update({ vps_status: "failed", post_install_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: "Provider did not return a post-install script ID" }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await user.client.from("local_environments").update({ vps_status: "failed", post_install_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await recordEvent(user.client, user.id, localEnvId, "recreate", 30, "Calling recreate on VPS (wipes OS and reinstalls)", "running");

  try {
    const recreateBody = {
      template_id: Number(templateId),
      post_install_script_id: postInstallScriptId,
    };
    const recreateRes = await providerFetch(cfg.apiToken, `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}/recreate`, {
      method: "POST",
      body: JSON.stringify(recreateBody),
    });
    const recreateJson = await readJson(recreateRes);
    if (!recreateRes.ok) {
      await recordEvent(user.client, user.id, localEnvId, "recreate", 30, `Recreate failed: ${recreateRes.status}`, "failed", { response: recreateJson });
      await user.client.from("local_environments").update({ vps_status: "failed", post_install_status: "failed" }).eq("id", localEnvId);
      return jsonResponse({ error: `Recreate failed (${recreateRes.status})`, details: recreateJson }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await user.client.from("local_environments").update({ vps_status: "failed", post_install_status: "failed" }).eq("id", localEnvId);
    return jsonResponse({ error: message }, 500);
  }

  await user.client.from("local_environments").update({
    vps_status: "installing",
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  await recordEvent(user.client, user.id, localEnvId, "recreate", 50, "Recreate submitted, OS reinstalling with post-install script", "running", { vps_id: vmId });

  return jsonResponse({
    local_environment_id: localEnvId,
    vps_id: vmId,
    status: "installing",
    message: "VPS is being recreated with the post-install script. This wipes and reinstalls the OS.",
  }, 202);
}

// --- VM Details: get full machine info from Hostinger ---

interface VmDetailsRequest {
  local_environment_id?: string;
}

async function handleVmDetails(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as VmDetailsRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  const vmId = String(envRow.vps_id || "");
  if (!vmId) return jsonResponse({ error: "No VPS associated with this environment." }, 400);

  const cfg = await loadProviderConfig(user.client, user.id);
  if (!cfg.apiToken) return jsonResponse({ error: "Provider not configured" }, 503);

  try {
    const res = await providerFetch(cfg.apiToken, `/api/vps/v1/virtual-machines/${encodeURIComponent(vmId)}`);
    const detail = await readJson(res) as Record<string, unknown> | null;
    if (!res.ok) {
      return jsonResponse({ error: `Provider returned ${res.status}`, details: detail }, 502);
    }

    const d = detail || {};
    const ipv4 = (d.ipv4 as Array<Record<string, unknown>> | undefined) || [];
    const primaryIp = ipv4.length > 0 ? String(ipv4[0].address || "") : String(d.ip || d.public_ip || "");
    const state = String(d.state || d.status || "").toLowerCase();

    return jsonResponse({
      vps_id: vmId,
      state,
      ip: primaryIp,
      hostname: d.hostname || "",
      template: d.template || d.os || null,
      cpus: d.cpus || d.vcpus || null,
      memory_mb: d.memory || d.ram || null,
      disk_gb: d.disk || d.storage || null,
      data_center: d.data_center || d.location || null,
      firewall: d.firewall || null,
      created_at: d.created_at || null,
      raw: d,
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

// --- Health Check: probe the server's services ---

interface HealthCheckRequest {
  local_environment_id?: string;
}

async function handleHealthCheck(req: Request, user: AuthedUser): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as HealthCheckRequest;
  const localEnvId = (body.local_environment_id || "").trim();
  if (!localEnvId) return jsonResponse({ error: "local_environment_id is required" }, 400);

  const { data: env, error: envErr } = await user.client
    .from("local_environments")
    .select("*")
    .eq("id", localEnvId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (envErr) return jsonResponse({ error: envErr.message }, 500);
  if (!env) return jsonResponse({ error: "Local environment not found" }, 404);

  const envRow = env as Record<string, unknown>;
  const ip = String(envRow.vps_ip || "");
  const domains = serviceDomainSet(envRow);
  const hostname = domains.baseDomain;

  if (!ip) return jsonResponse({ error: "No IP address known for this server." }, 400);

  const results: Record<string, unknown> = {
    ip,
    hostname,
    checked_at: new Date().toISOString(),
    tcp_443: false,
    supabase_api: false,
    studio: false,
    auth: false,
    sync_api: false,
  };

  const probe = async (url: string, timeoutMs = 8000): Promise<{ ok: boolean; status?: number; error?: string }> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
      clearTimeout(timer);
      // Any HTTP response (including 401/403) means the service is up
      return { ok: res.status < 500, status: res.status };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed" };
    }
  };

  // TCP probe via direct IP HTTPS (may get cert error but TCP connects)
  const directHttps = await probe(`https://${ip}/`);
  results.tcp_443 = directHttps.ok || (directHttps.error?.includes("certificate") ?? false) || (directHttps.status !== undefined);

  // Probe the 4 service subdomains
  if (domains.baseDomain) {
    const [supaRes, studioRes, authRes, syncRes] = await Promise.all([
      probe(`https://${domains.apiDomain}/rest/v1/`),
      probe(`https://${domains.studioDomain}/`),
      probe(`https://${domains.authDomain}/`),
      probe(`https://${domains.syncApiDomain}/health`),
    ]);

    results.supabase_api = supaRes.ok;
    results.supabase_api_status = supaRes.status;
    results.supabase_api_error = supaRes.error;

    results.studio = studioRes.ok;
    results.studio_status = studioRes.status;
    results.studio_error = studioRes.error;

    results.auth = authRes.ok;
    results.auth_status = authRes.status;
    results.auth_error = authRes.error;

    results.sync_api = syncRes.ok;
    results.sync_api_status = syncRes.status;
    results.sync_api_error = syncRes.error;
  }

  // Save results to DB
  await user.client.from("local_environments").update({
    last_health_check_at: new Date().toISOString(),
    health_check_results: results,
    updated_at: new Date().toISOString(),
  }).eq("id", localEnvId);

  return jsonResponse(results, 200);
}

// --- Configure DNS via Netlify API ---

const NETLIFY_API = "https://api.netlify.com/api/v1";

async function handleConfigureDns(req: Request, user: AuthedUser): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { local_environment_id?: string };
    const localEnvId = body.local_environment_id;
    if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

    const { data: envRow } = await user.client
      .from("local_environments")
      .select("*")
      .eq("id", localEnvId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!envRow) return jsonResponse({ error: "Environment not found" }, 404);
    if (!envRow.vps_ip) return jsonResponse({ error: "Server has no IP assigned yet" }, 400);

    // Load Netlify token from user_settings
    const { data: settings } = await user.client
      .from("user_settings")
      .select("netlify_api_token")
      .eq("user_id", user.id)
      .maybeSingle();
    const netlifyToken = (settings?.netlify_api_token as string) || "";
    if (!netlifyToken) {
      return jsonResponse({ error: "Netlify API token not configured. Please add it in settings." }, 400);
    }

    const apexDomain = envRow.apex_domain as string;
    const ip = envRow.vps_ip as string;
    const domains = serviceDomainSet(envRow as Record<string, unknown>);

    // Find the DNS zone for this apex domain
    const zonesRes = await fetch(`${NETLIFY_API}/dns_zones`, {
      headers: { Authorization: `Bearer ${netlifyToken}`, "Content-Type": "application/json" },
    });
    if (!zonesRes.ok) {
      const errText = await zonesRes.text();
      return jsonResponse({ error: `Netlify API error listing zones: ${zonesRes.status} ${errText}` }, 502);
    }
    const zones = (await zonesRes.json()) as Array<{ id: string; name: string }>;
    const zone = zones.find(z => z.name === apexDomain);
    if (!zone) {
      return jsonResponse({ error: `No Netlify DNS zone found for "${apexDomain}". Make sure the domain is managed by Netlify DNS.` }, 404);
    }

    // Get existing records for this zone
    const existingRes = await fetch(`${NETLIFY_API}/dns_zones/${zone.id}/dns_records`, {
      headers: { Authorization: `Bearer ${netlifyToken}`, "Content-Type": "application/json" },
    });
    if (!existingRes.ok) {
      return jsonResponse({ error: `Failed to list existing DNS records: ${existingRes.status}` }, 502);
    }
    const existingRecords = (await existingRes.json()) as Array<{ type: string; hostname: string; value: string }>;

    // Determine which records we need
    const desiredHostnames = Array.from(new Set([
      domains.baseDomain,
      domains.apiDomain,
      domains.studioDomain,
      domains.authDomain,
      domains.syncApiDomain,
    ].filter(Boolean)));

    const results: Array<{ hostname: string; status: string; message?: string }> = [];

    for (const hostname of desiredHostnames) {
      const existing = existingRecords.find(r => r.type === "A" && r.hostname === hostname && r.value === ip);
      if (existing) {
        results.push({ hostname, status: "exists" });
        continue;
      }

      // Create the A record
      const createRes = await fetch(`${NETLIFY_API}/dns_zones/${zone.id}/dns_records`, {
        method: "POST",
        headers: { Authorization: `Bearer ${netlifyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "A", hostname, value: ip, ttl: 3600 }),
      });

      if (createRes.ok) {
        results.push({ hostname, status: "created" });
      } else {
        const errText = await createRes.text();
        results.push({ hostname, status: "error", message: `${createRes.status}: ${errText}` });
      }
    }

    const allConfigured = results.every(r => r.status === "created" || r.status === "exists");

    if (allConfigured) {
      await user.client.from("local_environments").update({
        dns_a_record_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", localEnvId);

      const created = results.filter(r => r.status === "created").length;
      const existed = results.filter(r => r.status === "exists").length;
      await recordEvent(user.client, user.id, localEnvId, "dns", 100,
        `DNS configured via Netlify (${created} created, ${existed} already existed)`, "succeeded",
        { records: results });
    } else {
      const failed = results.filter(r => r.status === "error");
      await recordEvent(user.client, user.id, localEnvId, "dns", 50,
        `DNS configuration partially failed (${failed.length} errors)`, "failed",
        { records: results });
    }

    return jsonResponse({ records: results, all_configured: allConfigured }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

// --- Repair SSL: SSH into server and run repair script ---

const REPAIR_SSL_SCRIPT_URL = "https://raw.githubusercontent.com/bzalk/jrp-supabase/main/scripts/repair-traefik-ssl.sh";
const REPAIR_SYNC_API_POSTGRES_CLIENT_SCRIPT_URL = "https://raw.githubusercontent.com/bzalk/jrp-supabase/main/scripts/repair-sync-api-postgres-client.sh";

function execSshCommand(
  host: string,
  password: string,
  command: string,
  onProgress?: (stdout: string) => void,
  timeoutMs = 5 * 60 * 1000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error("SSH command timed out after " + Math.round(timeoutMs / 60000) + " minutes"));
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err: Error | undefined, stream: unknown) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        const s = stream as { on: (ev: string, cb: (...args: unknown[]) => void) => unknown; stderr: { on: (ev: string, cb: (d: unknown) => void) => void } };
        s.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          resolve({ code: code || 0, stdout, stderr });
        });
        s.on("data", (data: unknown) => {
          stdout += String(data);
          if (onProgress) onProgress(stdout);
        });
        s.stderr.on("data", (data: unknown) => { stderr += String(data); });
      });
    });
    conn.on("error", (err: Error) => { clearTimeout(timeout); reject(err); });
    conn.connect({ host, port: 22, username: "root", password, readyTimeout: 30000 });
  });
}

async function handleRepairSsl(req: Request, user: AuthedUser): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { local_environment_id?: string };
    const localEnvId = body.local_environment_id;
    if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

    const { data: envRow } = await user.client
      .from("local_environments")
      .select("*")
      .eq("id", localEnvId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!envRow) return jsonResponse({ error: "Environment not found" }, 404);

    const ip = envRow.vps_ip as string;
    const password = envRow.vps_root_password as string;
    const sshCommand = `ssh root@${ip} 'curl -fsSL ${REPAIR_SSL_SCRIPT_URL} | bash'`;

    if (!ip) return jsonResponse({ error: "No VPS IP address found" }, 400);
    if (!password) {
      return jsonResponse({
        error: "No root password stored for this environment. Run the repair script manually via SSH.",
        ssh_command: sshCommand,
      }, 400);
    }

    await recordEvent(user.client, user.id, localEnvId, "repair-ssl", 10,
      "Connecting to server via SSH to run SSL repair script", "running");

    const command = `curl -fsSL ${REPAIR_SSL_SCRIPT_URL} | bash`;
    let lastProgressUpdate = 0;
    const result = await execSshCommand(ip, password, command, (stdout) => {
      const now = Date.now();
      if (now - lastProgressUpdate > 4000) {
        lastProgressUpdate = now;
        const lastLine = stdout.trim().split("\n").pop() || "";
        EdgeRuntime.waitUntil(
          recordEvent(user.client, user.id, localEnvId, "repair-ssl", 50,
            `Executing: ${lastLine.slice(0, 120)}`, "running", { stdout_tail: stdout.slice(-300) })
        );
      }
    });

    if (result.code === 0) {
      await recordEvent(user.client, user.id, localEnvId, "repair-ssl", 100,
        "SSL repair script completed successfully", "succeeded", { stdout_tail: result.stdout.slice(-500) });
      return jsonResponse({
        status: "completed",
        message: "SSL repair script ran successfully. Certificates should now be valid.",
        output: result.stdout.slice(-2000),
        ssh_command: sshCommand,
      }, 200);
    } else {
      await recordEvent(user.client, user.id, localEnvId, "repair-ssl", 80,
        `SSL repair script exited with code ${result.code}`, "failed", { stdout_tail: result.stdout.slice(-500), stderr_tail: result.stderr.slice(-500) });
      return jsonResponse({
        status: "failed",
        message: `Repair script exited with code ${result.code}. Check the output below or run manually via SSH.`,
        output: (result.stdout + "\n" + result.stderr).slice(-2000),
        ssh_command: sshCommand,
      }, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message, ssh_command: "" }, 500);
  }
}

// --- Repair Sync API Postgres client: rebuild sync-api with selected pg_dump major ---

async function handleRepairSyncApiPostgresClient(req: Request, user: AuthedUser): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      local_environment_id?: string;
      postgres_client_major?: string | number;
    };
    const localEnvId = body.local_environment_id;
    if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

    const major = String(body.postgres_client_major || "17").trim();
    if (!/^[0-9]{2}$/.test(major)) {
      return jsonResponse({ error: "postgres_client_major must be a two-digit major version, for example 17" }, 400);
    }

    const { data: envRow } = await user.client
      .from("local_environments")
      .select("*")
      .eq("id", localEnvId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!envRow) return jsonResponse({ error: "Environment not found" }, 404);

    const ip = envRow.vps_ip as string;
    const password = envRow.vps_root_password as string;
    const sshCommand = `ssh root@${ip} 'curl -fsSL ${REPAIR_SYNC_API_POSTGRES_CLIENT_SCRIPT_URL} | UPDATE_REPO=true bash -s -- ${major}'`;

    if (!ip) return jsonResponse({ error: "No VPS IP address found" }, 400);
    if (!password) {
      return jsonResponse({
        error: "No root password stored for this environment. Run the repair script manually via SSH.",
        ssh_command: sshCommand,
      }, 400);
    }

    await recordEvent(user.client, user.id, localEnvId, "repair-sync-api-client", 10,
      `Connecting to server to install PostgreSQL client ${major} for sync-api`, "running");

    const command = `curl -fsSL ${REPAIR_SYNC_API_POSTGRES_CLIENT_SCRIPT_URL} | UPDATE_REPO=true bash -s -- ${shellQuote(major)}`;
    let lastProgressUpdate = 0;
    const result = await execSshCommand(ip, password, command, (stdout) => {
      const now = Date.now();
      if (now - lastProgressUpdate > 5000) {
        lastProgressUpdate = now;
        const lastLine = stdout.trim().split("\n").pop() || "";
        EdgeRuntime.waitUntil(
          recordEvent(user.client, user.id, localEnvId, "repair-sync-api-client", 50,
            `Executing: ${lastLine.slice(0, 140)}`, "running", { stdout_tail: stdout.slice(-400), postgres_client_major: major })
        );
      }
    }, 15 * 60 * 1000);

    if (result.code === 0) {
      await recordEvent(user.client, user.id, localEnvId, "repair-sync-api-client", 100,
        `sync-api PostgreSQL client ${major} repair completed`, "succeeded", { stdout_tail: result.stdout.slice(-500), postgres_client_major: major });
      return jsonResponse({
        status: "completed",
        message: `sync-api PostgreSQL client ${major} repair completed.`,
        output: result.stdout.slice(-4000),
        ssh_command: sshCommand,
      }, 200);
    } else {
      await recordEvent(user.client, user.id, localEnvId, "repair-sync-api-client", 80,
        `sync-api PostgreSQL client repair exited with code ${result.code}`, "failed", { stdout_tail: result.stdout.slice(-500), stderr_tail: result.stderr.slice(-500), postgres_client_major: major });
      return jsonResponse({
        status: "failed",
        message: `sync-api PostgreSQL client repair exited with code ${result.code}. Check the output below or run manually via SSH.`,
        output: (result.stdout + "\n" + result.stderr).slice(-4000),
        ssh_command: sshCommand,
      }, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message, ssh_command: "" }, 500);
  }
}

// --- Reset VPS: SSH into server and run full reset + reinstall ---

const RESET_VPS_SCRIPT_URL = "https://raw.githubusercontent.com/bzalk/jrp-supabase/main/scripts/reset-vps.sh";

async function handleResetVps(req: Request, user: AuthedUser): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { local_environment_id?: string };
    const localEnvId = body.local_environment_id;
    if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

    const { data: envRow } = await user.client
      .from("local_environments")
      .select("*")
      .eq("id", localEnvId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!envRow) return jsonResponse({ error: "Environment not found" }, 404);

    const ip = envRow.vps_ip as string;
    const password = envRow.vps_root_password as string;
    const domains = serviceDomainSet(envRow as Record<string, unknown>);
    const baseDomain = domains.baseDomain;
    const syncApiToken = String(envRow.sync_api_token || "") || generateSyncApiToken();
    const visibleEnv = [
      "CONFIRM_RESET=CONFIRM",
      `BASE_DOMAIN=${baseDomain}`,
      `API_DOMAIN=${domains.apiDomain}`,
      `STUDIO_DOMAIN=${domains.studioDomain}`,
      `AUTH_DOMAIN=${domains.authDomain}`,
      `SYNC_API_DOMAIN=${domains.syncApiDomain}`,
      "SYNC_API_TOKEN=<token>",
    ].join(" ");
    const sshCommand = `ssh root@${ip} '${visibleEnv} curl -fsSL ${RESET_VPS_SCRIPT_URL} | bash'`;

    if (!ip) return jsonResponse({ error: "No VPS IP address found" }, 400);
    if (!password) {
      return jsonResponse({
        error: "No root password stored for this environment. Run the reset script manually via SSH.",
        ssh_command: sshCommand,
      }, 400);
    }
    if (!baseDomain) return jsonResponse({ error: "No apex_domain configured for this environment" }, 400);

    await user.client.from("local_environments").update({
      sync_api_token: syncApiToken,
      sync_api_url: `https://${domains.syncApiDomain}`,
      updated_at: new Date().toISOString(),
    }).eq("id", localEnvId);

    await recordEvent(user.client, user.id, localEnvId, "reset-vps", 5,
      "Connecting to server via SSH to run full VPS reset", "running");

    const command = [
      "CONFIRM_RESET=CONFIRM",
      `BASE_DOMAIN=${shellQuote(baseDomain)}`,
      `API_DOMAIN=${shellQuote(domains.apiDomain)}`,
      `STUDIO_DOMAIN=${shellQuote(domains.studioDomain)}`,
      `AUTH_DOMAIN=${shellQuote(domains.authDomain)}`,
      `SYNC_API_DOMAIN=${shellQuote(domains.syncApiDomain)}`,
      `SYNC_API_TOKEN=${shellQuote(syncApiToken)}`,
      `curl -fsSL ${RESET_VPS_SCRIPT_URL} | bash`,
    ].join(" ");
    let lastProgressUpdate = 0;
    const result = await execSshCommand(ip, password, command, (stdout) => {
      const now = Date.now();
      if (now - lastProgressUpdate > 5000) {
        lastProgressUpdate = now;
        const lastLine = stdout.trim().split("\n").pop() || "";
        EdgeRuntime.waitUntil(
          recordEvent(user.client, user.id, localEnvId, "reset-vps", 50,
            lastLine.slice(0, 150) || "Running reset script...", "running", { stdout_tail: stdout.slice(-400) })
        );
      }
    }, 15 * 60 * 1000);

    if (result.code === 0) {
      // Reset local environment state back to post-install step
      await user.client.from("local_environments").update({
        post_install_status: "pending",
        dns_a_record_verified_at: null,
        health_check_results: null,
        last_health_check_at: null,
        sync_api_token: syncApiToken,
        sync_api_url: `https://${domains.syncApiDomain}`,
        connection_mode: null,
        updated_at: new Date().toISOString(),
      }).eq("id", localEnvId);

      // Remove any existing project binding since the environment is wiped
      await user.client.from("local_environment_bindings")
        .delete()
        .eq("local_environment_id", localEnvId);

      await recordEvent(user.client, user.id, localEnvId, "reset-vps", 100,
        "VPS reset completed successfully", "succeeded", { stdout_tail: result.stdout.slice(-500) });
      return jsonResponse({
        status: "completed",
        message: "VPS reset and reinstall completed successfully.",
        output: result.stdout.slice(-4000),
        ssh_command: sshCommand,
      }, 200);
    } else {
      await recordEvent(user.client, user.id, localEnvId, "reset-vps", 80,
        `VPS reset script exited with code ${result.code}`, "failed", { stdout_tail: result.stdout.slice(-500), stderr_tail: result.stderr.slice(-500) });
      return jsonResponse({
        status: "failed",
        message: `Reset script exited with code ${result.code}. Check the output below or run manually via SSH.`,
        output: (result.stdout + "\n" + result.stderr).slice(-4000),
        ssh_command: sshCommand,
      }, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message, ssh_command: "" }, 500);
  }
}

// --- Repair Sync Token: SSH into server and update the sync-api bearer token ---

async function handleRepairSyncToken(req: Request, user: AuthedUser): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { local_environment_id?: string };
    const localEnvId = body.local_environment_id;
    if (!localEnvId) return jsonResponse({ error: "local_environment_id required" }, 400);

    const { data: envRow } = await user.client
      .from("local_environments")
      .select("*")
      .eq("id", localEnvId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!envRow) return jsonResponse({ error: "Environment not found" }, 404);

    const ip = envRow.vps_ip as string;
    const password = envRow.vps_root_password as string;
    if (!ip) return jsonResponse({ error: "No VPS IP address found" }, 400);
    if (!password) return jsonResponse({ error: "No root password stored for this environment." }, 400);

    // Use existing token or generate a new one
    let syncApiToken = String(envRow.sync_api_token || "");
    if (!syncApiToken) {
      syncApiToken = generateSyncApiToken();
      await user.client.from("local_environments").update({
        sync_api_token: syncApiToken,
        updated_at: new Date().toISOString(),
      }).eq("id", localEnvId);
    }

    await recordEvent(user.client, user.id, localEnvId, "repair-sync-token", 10,
      "Connecting to server via SSH to update sync-api token", "running");

    // Update the token in the sync-api .env file and restart the service
    const script = [
      `TOKEN=${shellQuote(syncApiToken)}`,
      // Try common locations for the sync-api env/config
      `for ENV_FILE in /opt/jrp-supabase/.env /opt/sync-api/.env /etc/sync-api/.env; do`,
      `  if [ -f "$ENV_FILE" ]; then`,
      `    if grep -q "^SYNC_API_TOKEN=" "$ENV_FILE" 2>/dev/null; then`,
      `      sed -i "s|^SYNC_API_TOKEN=.*|SYNC_API_TOKEN=$TOKEN|" "$ENV_FILE"`,
      `    else`,
      `      echo "SYNC_API_TOKEN=$TOKEN" >> "$ENV_FILE"`,
      `    fi`,
      `    echo "Updated $ENV_FILE"`,
      `  fi`,
      `done`,
      // Also update docker-compose env if present
      `if [ -f /opt/jrp-supabase/docker-compose.yml ]; then`,
      `  cd /opt/jrp-supabase`,
      `  if docker compose ps sync-api --format json 2>/dev/null | grep -q running; then`,
      `    docker compose restart sync-api && echo "Restarted sync-api container"`,
      `  elif systemctl is-active sync-api >/dev/null 2>&1; then`,
      `    systemctl restart sync-api && echo "Restarted sync-api service"`,
      `  else`,
      `    echo "Could not find running sync-api to restart"`,
      `  fi`,
      `elif systemctl is-active sync-api >/dev/null 2>&1; then`,
      `  systemctl restart sync-api && echo "Restarted sync-api service"`,
      `fi`,
      `echo "DONE"`,
    ].join("\n");

    const result = await execSshCommand(ip, password, script, undefined, 60_000);

    if (result.code === 0 && result.stdout.includes("DONE")) {
      await recordEvent(user.client, user.id, localEnvId, "repair-sync-token", 100,
        "Sync API token updated successfully", "succeeded", { stdout_tail: result.stdout.slice(-300) });
      return jsonResponse({
        status: "completed",
        message: "Sync API token has been updated on the server.",
        output: result.stdout.slice(-2000),
      }, 200);
    } else {
      await recordEvent(user.client, user.id, localEnvId, "repair-sync-token", 80,
        `Token update exited with code ${result.code}`, "failed", { stdout_tail: result.stdout.slice(-300), stderr_tail: result.stderr.slice(-300) });
      return jsonResponse({
        status: "failed",
        message: `Token repair exited with code ${result.code}.`,
        output: (result.stdout + "\n" + result.stderr).slice(-2000),
      }, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const op = url.pathname.split("/").pop() || "";

    if (op === "list-plans" && req.method === "GET") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleListPlans(auth);
    }
    if (op === "list-templates" && req.method === "GET") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleListTemplates(auth);
    }
    if (op === "list-data-centers" && req.method === "GET") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleListDataCenters(auth);
    }
    if (op === "validate-install-url" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      const body = (await req.json().catch(() => ({}))) as { url?: string };
      const url = (body.url || "").trim();
      if (!url) return jsonResponse({ ok: false, error: "url is required" }, 400);
      const result = await validateInstallUrl(url);
      return jsonResponse(result, 200);
    }
    if (op === "start" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleStart(req, auth);
    }
    if (op === "resume-setup" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleResumeSetup(req, auth);
    }
    if (op === "recreate" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleRecreate(req, auth);
    }
    if (op === "vm-details" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleVmDetails(req, auth);
    }
    if (op === "health-check" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleHealthCheck(req, auth);
    }
    if (op === "poll" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handlePoll(req, auth);
    }
    if (op === "configure-dns" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleConfigureDns(req, auth);
    }
    if (op === "repair-ssl" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleRepairSsl(req, auth);
    }
    if (op === "repair-sync-api-client" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleRepairSyncApiPostgresClient(req, auth);
    }
    if (op === "reset-vps" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleResetVps(req, auth);
    }
    if (op === "repair-sync-token" && req.method === "POST") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      return await handleRepairSyncToken(req, auth);
    }
    return jsonResponse({ error: "Unknown operation" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
