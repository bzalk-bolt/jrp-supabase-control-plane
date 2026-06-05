import { supabase } from '../lib/supabase';

interface UserSettings {
  id: string;
  user_id: string;
  sync_api_token: string;
  supabase_access_token: string | null;
  supabase_token_session_only: boolean;
  supabase_token_updated_at: string | null;
  vps_api_token: string;
  vps_default_plan_id: string;
  vps_default_template_id: string;
  vps_datacenter_id: string;
  vps_public_key_id: string;
  sync_api_image: string;
  netlify_api_token: string;
  created_at: string;
  updated_at: string;
}

export async function getSyncToken(): Promise<string> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('sync_api_token')
    .maybeSingle();
  if (error) throw error;
  return data?.sync_api_token || '';
}

export async function saveSyncToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_settings')
      .update({ sync_api_token: token, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_settings')
      .insert({ user_id: user.id, sync_api_token: token });
    if (error) throw error;
  }
}

export async function getUserSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface SupabaseTokenInfo {
  token: string;
  sessionOnly: boolean;
  updatedAt: string | null;
  hasStoredToken: boolean;
}

export async function getSupabaseAccessToken(): Promise<SupabaseTokenInfo> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('supabase_access_token, supabase_token_session_only, supabase_token_updated_at')
    .maybeSingle();
  if (error) throw error;
  return {
    token: data?.supabase_access_token || '',
    sessionOnly: data?.supabase_token_session_only || false,
    updatedAt: data?.supabase_token_updated_at || null,
    hasStoredToken: !!data?.supabase_access_token,
  };
}

export async function saveSupabaseAccessToken(token: string, sessionOnly: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const persistedToken = sessionOnly ? null : token;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_settings')
      .update({
        supabase_access_token: persistedToken,
        supabase_token_session_only: sessionOnly,
        supabase_token_updated_at: now,
        updated_at: now,
      })
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_settings')
      .insert({
        user_id: user.id,
        sync_api_token: '',
        supabase_access_token: persistedToken,
        supabase_token_session_only: sessionOnly,
        supabase_token_updated_at: now,
      });
    if (error) throw error;
  }
}

export async function clearSupabaseAccessToken(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_settings')
    .update({
      supabase_access_token: null,
      supabase_token_session_only: false,
      supabase_token_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);
  if (error) throw error;
}

export interface ProviderConfig {
  vps_api_token: string;
  sync_api_install_url: string;
  netlify_api_token: string;
}

const PROVIDER_FIELDS: Array<keyof ProviderConfig> = [
  'vps_api_token',
  'sync_api_install_url',
  'netlify_api_token',
];

export async function getProviderConfig(): Promise<ProviderConfig> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(PROVIDER_FIELDS.join(', '))
    .maybeSingle();
  if (error) throw error;
  const row = (data || {}) as Record<string, string | null>;
  const out: ProviderConfig = {
    vps_api_token: '',
    sync_api_install_url: '',
    netlify_api_token: '',
  };
  for (const k of PROVIDER_FIELDS) out[k] = (row[k] as string) || '';
  return out;
}

export async function saveProviderConfig(patch: Partial<ProviderConfig>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of PROVIDER_FIELDS) {
    if (patch[k] !== undefined) updateRow[k] = patch[k];
  }

  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_settings')
      .update(updateRow)
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_settings')
      .insert({ user_id: user.id, sync_api_token: '', ...updateRow });
    if (error) throw error;
  }
}
