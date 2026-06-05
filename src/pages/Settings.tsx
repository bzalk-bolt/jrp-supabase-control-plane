import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Key, CheckCircle, AlertCircle, Wifi, Cloud, Lock, Trash2, ExternalLink } from 'lucide-react';
import { syncApi, settingsService } from '../services';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';
import ProviderConfigCard from '../components/ProviderConfigCard';

type TestState = { kind: 'ok' | 'error'; message?: string } | null;

export default function Settings() {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabase PAT section
  const [supabasePat, setSupabasePat] = useState('');
  const [supabaseSessionOnly, setSupabaseSessionOnly] = useState(false);
  const [supabaseHasStored, setSupabaseHasStored] = useState(false);
  const [supabaseUpdatedAt, setSupabaseUpdatedAt] = useState<string | null>(null);
  const [supabaseDirty, setSupabaseDirty] = useState(false);
  const [supabaseSaving, setSupabaseSaving] = useState(false);
  const [supabaseTesting, setSupabaseTesting] = useState(false);
  const [supabaseTestResult, setSupabaseTestResult] = useState<TestState>(null);
  const [supabaseSaved, setSupabaseSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsService.getSyncToken().then(setToken).catch(() => {}),
      settingsService.getSupabaseAccessToken().then(info => {
        setSupabasePat(info.token);
        setSupabaseSessionOnly(info.sessionOnly);
        setSupabaseHasStored(info.hasStoredToken);
        setSupabaseUpdatedAt(info.updatedAt);
        if (info.token) {
          syncApi.setSupabaseAccessTokenCache(info.token);
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setTestResult(null);
    try {
      await settingsService.saveSyncToken(token.trim());
      syncApi.setTokenCache(token.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setTestResult('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await settingsService.saveSyncToken(token.trim());
      syncApi.setTokenCache(token.trim());
      await syncApi.listEnvironments();
      setTestResult('ok');
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveSupabase() {
    setSupabaseSaving(true);
    setSupabaseSaved(false);
    setSupabaseTestResult(null);
    try {
      const trimmed = supabasePat.trim();
      await settingsService.saveSupabaseAccessToken(trimmed, supabaseSessionOnly);
      syncApi.setSupabaseAccessTokenCache(trimmed);
      setSupabaseHasStored(!supabaseSessionOnly && !!trimmed);
      setSupabaseUpdatedAt(new Date().toISOString());
      setSupabaseDirty(false);
      setSupabaseSaved(true);
      setTimeout(() => setSupabaseSaved(false), 2000);
    } catch (e) {
      setSupabaseTestResult({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to save token' });
    } finally {
      setSupabaseSaving(false);
    }
  }

  async function handleTestSupabase() {
    setSupabaseTesting(true);
    setSupabaseTestResult(null);
    try {
      const trimmed = supabasePat.trim();
      const res = await syncApi.listSupabaseOrganizations(trimmed);
      const count = res.organizations?.length || 0;
      setSupabaseTestResult({
        kind: 'ok',
        message: `Connected. Found ${count} organization${count === 1 ? '' : 's'}.`,
      });
    } catch (e) {
      setSupabaseTestResult({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Connection failed',
      });
    } finally {
      setSupabaseTesting(false);
    }
  }

  async function handleClearSupabase() {
    setSupabaseSaving(true);
    try {
      await settingsService.clearSupabaseAccessToken();
      syncApi.setSupabaseAccessTokenCache('');
      setSupabasePat('');
      setSupabaseSessionOnly(false);
      setSupabaseHasStored(false);
      setSupabaseUpdatedAt(null);
      setSupabaseDirty(false);
      setSupabaseTestResult(null);
    } catch (e) {
      setSupabaseTestResult({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to clear token',
      });
    } finally {
      setSupabaseSaving(false);
    }
  }

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure your API connections.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden max-w-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <SettingsIcon className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Sync API</h2>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Key className="w-3.5 h-3.5 text-gray-500" />
              <label className="text-sm font-medium text-gray-300">API Token</label>
            </div>
            <p className="text-xs text-gray-500 mb-3">Your SYNC_API_TOKEN for authenticating with the Sync API.</p>
            <input
              type="password"
              value={token}
              onChange={e => { setToken(e.target.value); setSaved(false); setTestResult(null); }}
              placeholder="Enter your API token..."
              className="input-field font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              {saved ? <CheckCircle className="w-4 h-4" /> : null}
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Token'}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !token.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wifi className="w-4 h-4" />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
              testResult === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {testResult === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {testResult === 'ok' ? 'Connection successful! API is reachable and token is valid.' : 'Connection failed. Check your token and try again.'}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden max-w-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <Cloud className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Supabase Account</h2>
          {supabaseHasStored && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-600/15 text-emerald-400 border border-emerald-600/20">
              <CheckCircle className="w-2.5 h-2.5" />
              Connected
            </span>
          )}
          {!supabaseHasStored && supabaseSessionOnly && supabasePat && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <Lock className="w-2.5 h-2.5" />
              Session only
            </span>
          )}
        </div>
        <div className="p-6 space-y-5">
          <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 flex items-start gap-2.5">
            <Cloud className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div className="text-xs text-gray-400 leading-relaxed">
              Connect your Supabase account to discover organizations and projects when running an import.
              {' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Generate a personal access token
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Key className="w-3.5 h-3.5 text-gray-500" />
              <label className="text-sm font-medium text-gray-300">Personal Access Token</label>
            </div>
            <p className="text-xs text-gray-500 mb-3">Used only for account discovery (organizations, projects). Stored RLS-protected unless session-only is enabled.</p>
            <input
              type="password"
              value={supabasePat}
              onChange={e => {
                setSupabasePat(e.target.value);
                setSupabaseDirty(true);
                setSupabaseSaved(false);
                setSupabaseTestResult(null);
              }}
              placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="input-field font-mono"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={supabaseSessionOnly}
              onChange={e => {
                setSupabaseSessionOnly(e.target.checked);
                setSupabaseDirty(true);
              }}
              className="mt-0.5 w-4 h-4 rounded bg-gray-800 border-gray-700 text-emerald-600 focus:ring-emerald-600/50 focus:ring-offset-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-medium text-gray-300">Session-only (do not persist)</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Token will be cleared when you close this tab. Recommended if you don't want the token written to the database.
              </p>
            </div>
          </label>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSaveSupabase}
              disabled={supabaseSaving || (!supabaseDirty && !supabaseSaved)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {supabaseSaved ? <CheckCircle className="w-4 h-4" /> : null}
              {supabaseSaving ? 'Saving...' : supabaseSaved ? 'Saved' : 'Save Token'}
            </button>
            <button
              onClick={handleTestSupabase}
              disabled={supabaseTesting || !supabasePat.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wifi className="w-4 h-4" />
              {supabaseTesting ? 'Testing...' : 'Test Connection'}
            </button>
            {(supabaseHasStored || supabasePat) && (
              <button
                onClick={handleClearSupabase}
                disabled={supabaseSaving}
                className="ml-auto inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disconnect
              </button>
            )}
          </div>

          {supabaseTestResult && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              supabaseTestResult.kind === 'ok'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {supabaseTestResult.kind === 'ok'
                ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{supabaseTestResult.message}</span>
            </div>
          )}

          {supabaseUpdatedAt && (
            <div className="text-xs text-gray-500">
              Last updated {new Date(supabaseUpdatedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      <ProviderConfigCard />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden max-w-2xl">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">API Endpoint</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg">
            <span className="text-xs font-mono text-gray-400">https://sync-api.jamrockdev.com</span>
            <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
