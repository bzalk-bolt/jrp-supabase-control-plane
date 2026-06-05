import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, ArrowRight, Search, Download } from 'lucide-react';
import CreateEnvironmentModal from '../components/CreateEnvironmentModal';
import { useEnvironments } from '../contexts/EnvironmentsContext';

export default function Environments() {
  const { environments, identities, error, refresh } = useEnvironments();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = environments.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.source_env.toLowerCase().includes(search.toLowerCase()) ||
    e.target_env.toLowerCase().includes(search.toLowerCase())
  );

  const isEmpty = environments.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Environments</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your database sync targets.</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2">
            <Link
              to="/import"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 text-sm font-medium rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Import from Supabase
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New manually
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!isEmpty && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search environments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 transition-all"
          />
        </div>
      )}

      {isEmpty ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/import"
            className="group bg-gray-900 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl p-6 transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500/15 transition-colors">
              <Download className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-white">Import from Supabase</h3>
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded">
                Recommended
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Pull the schema and (optionally) data from a hosted Supabase project. Guided wizard.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 group-hover:text-emerald-200">
              Start import
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          <button
            onClick={() => setShowCreate(true)}
            className="group bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-6 text-left transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-4">
              <Database className="w-5 h-5 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">Create manually</h3>
            <p className="text-sm text-gray-400 mb-4">
              Configure source and target databases by hand. Best for existing local stacks or custom setups.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-300 group-hover:text-white">
              New environment
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(env => (
            <div
              key={env.name}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group"
            >
              <div className="flex items-center justify-between">
                <Link to={`/environments/${env.name}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Database className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-100 truncate">{env.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {identities[env.name] ? (
                        <>
                          <span className="text-xs font-mono text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{identities[env.name].source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-600" />
                          <span className="text-xs font-mono text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{identities[env.name].target}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-600">Loading...</span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    to={`/environments/${env.name}`}
                    className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors inline-flex"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
              {env.source_db_url && (
                <div className="mt-3 pt-3 border-t border-gray-800/50">
                  <div className="text-xs text-gray-500 font-mono truncate">Source: {env.source_db_url}</div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div className="text-center py-8 text-sm text-gray-500">No environments match "{search}"</div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateEnvironmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}
    </div>
  );
}
