import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface DnsVerifyResult {
  domain: string;
  record_name: string;
  expected_token: string;
  records: string[];
  matched: boolean;
  checked_at: string;
}

export async function verifyDnsTxt(input: {
  domain: string;
  expectedToken: string;
  recordName?: string;
}): Promise<DnsVerifyResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token || SUPABASE_ANON_KEY;

  const url = `${SUPABASE_URL}/functions/v1/dns-verify`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      domain: input.domain,
      expected_token: input.expectedToken,
      record_name: input.recordName,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `DNS verify failed: ${res.status}`);
  }
  return body as DnsVerifyResult;
}
