import { useEffect, useState } from 'react';
import { Server, Save, CheckCircle, AlertCircle, Eye, EyeOff, FlaskConical, Loader2 } from 'lucide-react';
import { settingsService } from '../services';
import type { ProviderConfig } from '../services/settingsService';
import { vpsProvisionService } from '../services';

const FIELD_DEFS: Array<{
  key: keyof ProviderConfig;
  label: string;
  placeholder: string;
  description: string;
  secret?: boolean;
  required?: boolean;
  testable?: boolean;
}> = [
  {
    key: 'vps_api_token',
    label: 'Server provider API token',
    placeholder: 'paste token here',
    description: 'Used server-side to provision the VPS. Stored encrypted at rest by Supabase.',
    secret: true,
    required: true,
  },
  {
    key: 'sync_api_install_url',
    label: 'Bootstrap script URL (optional)',
    placeholder: 'https://example.com/install.sh',
    description: 'HTTPS URL of a shell script run on first boot. The platform exports HOSTNAME, SYNC_API_TOKEN, SYNC_API_URL, BASE_DOMAIN, and explicit service domains before executing it. Leave blank to use the platform default.',
    testable: true,
  },
  {
    key: 'netlify_api_token',
    label: 'Netlify API token (optional)',
    placeholder: 'optional',
    description: 'Used only when the user opts into automatic DNS via Netlify.',
    secret: true,
  },
];

export default function ProviderConfigCard() {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [draft, setDraft] = useState<ProviderConfig | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  useEffect(() => {
    settingsService.getProviderConfig().then(c => {
      setConfig(c);
      setDraft(c);
    }).catch(e => {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to load' });
    });
  }, []);

  const dirty = !!config && !!draft && FIELD_DEFS.some(f => (draft[f.key] || '') !== (config[f.key] || ''));

  function update(key: keyof ProviderConfig, value: string) {
    setDraft(d => d ? { ...d, [key]: value } : d);
    if (key === 'sync_api_install_url') setTestResult(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      await settingsService.saveProviderConfig(draft);
      setConfig(draft);
      setStatus({ kind: 'ok', message: 'Saved' });
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  async function testInstallUrl() {
    if (!draft?.sync_api_install_url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await vpsProvisionService.validateInstallUrl(draft.sync_api_install_url);
      if (r.ok) {
        setTestResult({ kind: 'ok', message: `Reachable - ${r.status} - ${r.size} bytes` });
      } else {
        setTestResult({ kind: 'error', message: r.error || `Unreachable (${r.status || 'no response'})` });
      }
    } catch (e) {
      setTestResult({ kind: 'error', message: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden max-w-2xl">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        <Server className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-200">Server provider</h2>
        <span className="ml-auto text-xs text-gray-500">Used for spinning up local environment hosts</span>
      </div>
      <div className="p-6 space-y-5">
        {!draft ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          FIELD_DEFS.map(field => {
            const v = draft[field.key] || '';
            const isRevealed = revealed[field.key];
            return (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  {field.label}
                  {field.required && <span className="text-amber-400 ml-1">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={field.secret && !isRevealed ? 'password' : 'text'}
                    value={v}
                    onChange={e => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full pr-10 px-3 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50"
                    autoComplete="off"
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() => setRevealed(r => ({ ...r, [field.key]: !r[field.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                      title={isRevealed ? 'Hide' : 'Show'}
                    >
                      {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                {field.testable && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={testInstallUrl}
                      disabled={testing || !v}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-750 disabled:bg-gray-900 disabled:text-gray-600 text-gray-200 text-xs font-medium rounded transition-colors"
                    >
                      {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                      Test URL
                    </button>
                    {testResult?.kind === 'ok' && (
                      <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {testResult.message}
                      </span>
                    )}
                    {testResult?.kind === 'error' && (
                      <span className="text-xs text-red-400 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {testResult.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          {status?.kind === 'ok' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {status.message}
            </span>
          )}
          {status?.kind === 'error' && (
            <span className="inline-flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {status.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
