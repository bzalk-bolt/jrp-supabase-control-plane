import { useState, useRef, useEffect } from 'react';
import { Database, ChevronDown, Search, Server } from 'lucide-react';
import type { Environment } from '../types/api';
import type { EnvironmentMeta } from '../contexts/EnvironmentsContext';

interface Props {
  environments: Environment[];
  selected: string | null;
  onSelect: (name: string) => void;
  loading?: boolean;
  sourceLabel?: string;
  targetLabel?: string;
  meta?: Record<string, EnvironmentMeta>;
}

export default function EnvironmentSelector({ environments, selected, onSelect, loading, sourceLabel, targetLabel, meta }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = environments.filter(env =>
    env.name.toLowerCase().includes(filter.toLowerCase())
  );

  const selectedEnv = environments.find(e => e.name === selected);
  const selectedMeta = selected && meta ? meta[selected] : undefined;

  function getEnvIcon(envName: string) {
    const m = meta?.[envName];
    if (m?.source === 'self-hosted') {
      return (
        <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
          <Server className="w-3.5 h-3.5 text-sky-400" />
        </div>
      );
    }
    return (
      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
        <Database className="w-3.5 h-3.5 text-blue-400" />
      </div>
    );
  }

  function getEnvSubtext(envName: string) {
    const m = meta?.[envName];
    if (m?.source === 'self-hosted' && m.domain) {
      return <div className="text-[10px] text-sky-400/70 truncate">Self-hosted at {m.domain}</div>;
    }
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-xl text-sm transition-all min-w-[240px] disabled:opacity-50"
      >
        {selectedEnv ? getEnvIcon(selectedEnv.name) : (
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Database className="w-3.5 h-3.5 text-blue-400" />
          </div>
        )}
        <div className="flex-1 text-left">
          {selectedEnv ? (
            <>
              <div className="text-gray-200 font-medium">{selectedEnv.name}</div>
              {selectedMeta?.source === 'self-hosted' && selectedMeta.domain ? (
                <div className="text-[10px] text-sky-400/70 truncate">Self-hosted at {selectedMeta.domain}</div>
              ) : sourceLabel && targetLabel ? (
                <div className="text-[10px] font-mono truncate">
                  <span className="text-teal-400">{sourceLabel}</span>
                  <span className="text-gray-500"> {'\u2192'} </span>
                  <span className="text-sky-400">{targetLabel}</span>
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-gray-500">Select environment...</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-800">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Filter environments..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-500 text-center">No environments match</div>
            ) : (
              filtered.map(env => (
                <button
                  key={env.name}
                  onClick={() => {
                    onSelect(env.name);
                    setOpen(false);
                    setFilter('');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    env.name === selected
                      ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                      : 'hover:bg-gray-800/60 border-l-2 border-transparent'
                  }`}
                >
                  {getEnvIcon(env.name)}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${env.name === selected ? 'text-emerald-400' : 'text-gray-200'}`}>
                      {env.name}
                    </div>
                    {getEnvSubtext(env.name) || (
                      env.name === selected && sourceLabel && targetLabel ? (
                        <div className="text-[10px] font-mono truncate">
                          <span className="text-teal-400">{sourceLabel}</span>
                          <span className="text-gray-500"> {'\u2192'} </span>
                          <span className="text-sky-400">{targetLabel}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
