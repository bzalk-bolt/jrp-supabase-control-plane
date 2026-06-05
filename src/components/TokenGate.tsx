import { useState } from 'react';
import { Key, ArrowRight, Wifi, AlertCircle } from 'lucide-react';
import { syncApi, settingsService } from '../services';

interface Props {
  onConnected: () => void;
}

export default function TokenGate({ onConnected }: Props) {
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setTesting(true);
    setError('');

    try {
      await settingsService.saveSyncToken(token.trim());
      syncApi.setTokenCache(token.trim());
      await syncApi.listEnvironments();
      onConnected();
    } catch {
      syncApi.setTokenCache('');
      setError('Connection failed. Please check your token and try again.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center mx-auto mb-5">
            <Wifi className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Connect to Sync API</h1>
          <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
            Enter your API token to connect to the database migration service.
          </p>
        </div>

        <form onSubmit={handleConnect} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Key className="w-3.5 h-3.5 text-gray-500" />
              API Token
            </label>
            <input
              type="password"
              value={token}
              onChange={e => { setToken(e.target.value); setError(''); }}
              placeholder="Enter your SYNC_API_TOKEN..."
              className="input-field font-mono"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2">
              This is the bearer token used to authenticate with the Sync API.
            </p>
          </div>

          <button
            type="submit"
            disabled={testing || !token.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
          >
            {testing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
