import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Sync-Token, X-Supabase-Access-Token, X-Local-Environment-Id",
  "Access-Control-Expose-Headers": "X-Proxy-Source, X-Upstream-Status, X-Upstream-Url, X-Proxy-Error",
};

const DEFAULT_SYNC_API_BASE = "https://sync-api.jamrockdev.com";

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function resolveSyncTarget(localEnvId: string): Promise<{ url: string; token: string } | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("local_environments")
    .select("sync_api_url, sync_api_token")
    .eq("id", localEnvId)
    .maybeSingle();

  if (error || !data || !data.sync_api_url) return null;
  return { url: data.sync_api_url, token: data.sync_api_token || "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  const targetPath = reqUrl.searchParams.get("path");

  if (!targetPath) {
    console.log("[sync-proxy] missing path param");
    return jsonResponse(
      { error: "Missing 'path' query parameter", source: "proxy" },
      400,
      { "X-Proxy-Source": "proxy", "X-Proxy-Error": "missing-path" },
    );
  }

  const localEnvId = req.headers.get("X-Local-Environment-Id") || null;
  let syncApiBase = DEFAULT_SYNC_API_BASE;
  let syncTokenOverride: string | null = null;

  if (localEnvId) {
    const resolved = await resolveSyncTarget(localEnvId);
    if (!resolved) {
      return jsonResponse(
        { error: "Local environment not found or has no sync_api_url configured", source: "proxy" },
        404,
        { "X-Proxy-Source": "proxy", "X-Proxy-Error": "env-not-found" },
      );
    }
    syncApiBase = resolved.url.replace(/\/$/, "");
    syncTokenOverride = resolved.token;
  }

  const targetUrl = `${syncApiBase}${targetPath}`;
  const syncToken = syncTokenOverride || req.headers.get("X-Sync-Token") || "";
  const supabaseAccessToken = req.headers.get("X-Supabase-Access-Token") || "";

  console.log(
    `[sync-proxy] ${req.method} ${targetPath} -> ${targetUrl} ` +
      `localEnvId=${localEnvId || "default"} syncToken=${syncToken ? "yes" : "no"} supabasePat=${supabaseAccessToken ? "yes" : "no"}`,
  );

  const headers: Record<string, string> = {};
  if (syncToken) headers["Authorization"] = `Bearer ${syncToken}`;
  if (supabaseAccessToken) headers["X-Supabase-Access-Token"] = supabaseAccessToken;

  const fetchOptions: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = body;
    }
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, fetchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream fetch failed";
    console.error(`[sync-proxy] upstream fetch threw: ${message} url=${targetUrl}`);
    return jsonResponse(
      {
        error: `Proxy could not reach upstream: ${message}`,
        source: "proxy",
        upstream_url: targetUrl,
      },
      502,
      {
        "X-Proxy-Source": "proxy",
        "X-Upstream-Url": targetUrl,
        "X-Proxy-Error": "upstream-unreachable",
      },
    );
  }

  const responseBody = await response.text();
  console.log(
    `[sync-proxy] upstream ${response.status} ${targetUrl} bodyLen=${responseBody.length}`,
  );

  return new Response(responseBody, {
    status: response.status,
    headers: {
      ...corsHeaders,
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "X-Proxy-Source": "upstream",
      "X-Upstream-Status": String(response.status),
      "X-Upstream-Url": targetUrl,
    },
  });
});
