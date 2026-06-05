import { useEffect, useState, useMemo } from 'react';
import { Code2, AlertTriangle, ExternalLink } from 'lucide-react';
import { syncApi } from '../services';
import type {
  DatabaseFunctionsResponse,
  DatabaseFunction,
  DatabaseFunctionIdentity,
} from '../types/api';
import SourceComparisonModal from './SourceComparisonModal';

function fnKey(f: DatabaseFunctionIdentity): string {
  return `${f.schema}.${f.name}(${f.identity_arguments})`;
}

type ViewMode = 'diffs' | 'no-source' | 'no-target' | 'all';

export default function DatabaseFunctionsView({ envName, openFnKey, onSourceChange, sourceLabel, targetLabel }: {
  envName: string;
  openFnKey?: string;
  onSourceChange?: (key: string | null) => void;
  sourceLabel?: string;
  targetLabel?: string;
}) {
  const [data, setData] = useState<DatabaseFunctionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('diffs');
  const [fnFilter, setFnFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    syncApi.getDatabaseFunctions(envName)
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [envName]);

  const { sourceMap, targetMap, allKeys, missingInTargetSet, missingInSourceSet, differsSet, totalDiffs } = useMemo(() => {
    if (!data) return { sourceMap: new Map<string, DatabaseFunction>(), targetMap: new Map<string, DatabaseFunction>(), allKeys: [] as string[], missingInTargetSet: new Set<string>(), missingInSourceSet: new Set<string>(), differsSet: new Set<string>(), totalDiffs: 0 };

    const sourceSide = data.databases.find(d => d.role === 'source');
    const targetSide = data.databases.find(d => d.role === 'target');
    const sMap = new Map<string, DatabaseFunction>();
    const tMap = new Map<string, DatabaseFunction>();

    sourceSide?.functions.forEach(f => sMap.set(fnKey(f), f));
    targetSide?.functions.forEach(f => tMap.set(fnKey(f), f));

    const keys = Array.from(new Set([...sMap.keys(), ...tMap.keys()])).sort();
    const mitSet = new Set(data.comparison.functions_missing_in_target.map(fnKey));
    const misSet = new Set(data.comparison.functions_missing_in_source.map(fnKey));
    const dSet = new Set(data.comparison.function_definition_differences.map(fnKey));

    return {
      sourceMap: sMap,
      targetMap: tMap,
      allKeys: keys,
      missingInTargetSet: mitSet,
      missingInSourceSet: misSet,
      differsSet: dSet,
      totalDiffs: mitSet.size + misSet.size + dSet.size,
    };
  }, [data]);

  const filteredKeys = useMemo(() => {
    return allKeys.filter(key => {
      const isDiff = differsSet.has(key);
      const isMissingTarget = missingInTargetSet.has(key);
      const isMissingSource = missingInSourceSet.has(key);

      if (viewMode === 'diffs' && !isDiff && !isMissingTarget && !isMissingSource) return false;
      if (viewMode === 'no-source' && !isMissingSource) return false;
      if (viewMode === 'no-target' && !isMissingTarget) return false;

      if (fnFilter) {
        const lowerFilter = fnFilter.toLowerCase();
        if (!key.toLowerCase().includes(lowerFilter)) return false;
      }

      return true;
    });
  }, [allKeys, viewMode, fnFilter, missingInTargetSet, missingInSourceSet, differsSet]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
    );
  }

  if (!data) return null;

  if (allKeys.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
        <Code2 className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No database functions found.</p>
      </div>
    );
  }

  const viewModes: { id: ViewMode; label: string }[] = [
    { id: 'diffs', label: 'Diffs' },
    { id: 'no-source', label: 'No Source' },
    { id: 'no-target', label: 'No Target' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
            {viewModes.map(mode => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  viewMode === mode.id
                    ? 'bg-gray-700 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {totalDiffs > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {totalDiffs} {totalDiffs === 1 ? 'difference' : 'differences'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{filteredKeys.length} functions</span>
          <input
            type="text"
            placeholder="Filter..."
            value={fnFilter}
            onChange={e => setFnFilter(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-gray-600"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800/60">
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Function</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-20">Language</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-28">Returns</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-20">Volatility</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-24">Status</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {filteredKeys.map(key => {
              const sf = sourceMap.get(key);
              const tf = targetMap.get(key);
              const fn = sf || tf;
              if (!fn) return null;
              const missingTarget = missingInTargetSet.has(key);
              const missingSource = missingInSourceSet.has(key);
              const differs = differsSet.has(key);
              const hasDiff = missingTarget || missingSource || differs;

              return (
                <tr
                  key={key}
                  className={`transition-colors ${hasDiff ? 'bg-amber-500/[0.03] hover:bg-gray-800/30' : 'hover:bg-gray-800/30'}`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-200">{fn.schema}.{fn.name}</span>
                      {fn.identity_arguments && (
                        <span className="text-gray-500 text-[10px] truncate max-w-[180px]">({fn.identity_arguments})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-400">{fn.language}</td>
                  <td className="px-4 py-2 font-mono text-gray-500 truncate max-w-[120px]">{fn.returns}</td>
                  <td className="px-4 py-2 text-gray-500 text-[10px]">{fn.volatility}</td>
                  <td className="px-4 py-2 text-center">
                    {missingTarget ? (
                      <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">no target</span>
                    ) : missingSource ? (
                      <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">no source</span>
                    ) : differs ? (
                      <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">differs</span>
                    ) : (
                      <span className="text-emerald-500/50 text-[10px]">match</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => onSourceChange?.(key)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-all mx-auto"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Source
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openFnKey && (
        <SourceComparisonModal
          type="db-function"
          envName={envName}
          fnKey={openFnKey}
          sourceFn={sourceMap.get(openFnKey)}
          targetFn={targetMap.get(openFnKey)}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onClose={() => onSourceChange?.(null)}
        />
      )}
    </div>
  );
}
