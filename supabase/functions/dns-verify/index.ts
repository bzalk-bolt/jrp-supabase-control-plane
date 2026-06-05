import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface VerifyRequest {
  domain?: string;
  expected_token?: string;
  record_name?: string;
}

interface DohAnswer {
  name: string;
  type: number;
  TTL?: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

async function lookupTxt(name: string): Promise<string[]> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`;
  const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
  if (!res.ok) {
    throw new Error(`DoH lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as DohResponse;
  if (data.Status !== 0) {
    return [];
  }
  if (!data.Answer) return [];
  return data.Answer
    .filter(a => a.type === 16)
    .map(a => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as VerifyRequest;
    const domain = (body.domain || "").trim().toLowerCase();
    const expectedToken = (body.expected_token || "").trim();
    const recordName = (body.record_name || `_jamrock-verify.${domain}`).trim().toLowerCase();

    if (!domain || !expectedToken) {
      return jsonResponse({ error: "domain and expected_token are required" }, 400);
    }

    const records = await lookupTxt(recordName);
    const matched = records.includes(expectedToken);

    return jsonResponse({
      domain,
      record_name: recordName,
      expected_token: expectedToken,
      records,
      matched,
      checked_at: new Date().toISOString(),
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
