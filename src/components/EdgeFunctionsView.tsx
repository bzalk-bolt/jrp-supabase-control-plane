import { useEffect, useState, useMemo } from 'react';
import { Zap, AlertTriangle, Lock, Unlock, ExternalLink } from 'lucide-react';
import { syncApi } from '../services';
import type {
  EdgeFunctionsResponse,
  EdgeFunction,
  EdgeFunctionSourceDifference,
} from '../types/api';
import SourceComparisonModal from './SourceComparisonModal';

export default function EdgeFunctionsView({ envName, openSlug, onSourceChange, sourceLabel, targetLabel }: {
  envName: string;
  openSlug?: string;
  onSourceChange?: (slug: string | null) => void;
  sourceLabel?: string;
  targetLabel?: string;
}) {
  const [data, setData] = useState<EdgeFunctionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'diffs' | 'no-source' | 'no-target' | 'all'>('diffs');
  const [fnFilter, setFnFilter] = useState('');
  const viewingSlug = openSlug ?? null;

  function setViewingSlug(slug: string | null) {
    onSourceChange?.(slug);
  }

  useEffect(() => {
    setLoading(true);
    syncApi.getEdgeFunctions(envName)
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [envName]);

  const { sourceSide, targetSide, sourceMap, targetMap, allSlugs, missingInTargetSet, missingInSourceSet, sourceDiffMap, totalDiffs } = useMemo(() => {
    if (!data) return { sourceSide: undefined, targetSide: undefined, sourceMap: new Map<string, EdgeFunction>(), targetMap: new Map<string, EdgeFunction>(), allSlugs: [] as string[], missingInTargetSet: new Set<string>(), missingInSourceSet: new Set<string>(), sourceDiffMap: new Map<string, EdgeFunctionSourceDifference>(), totalDiffs: 0 };

    const src = data.edge_functions.find(s => s.role === 'source');
    const tgt = data.edge_functions.find(s => s.role === 'target');
    const sourceFns = src?.functions || [];
    const targetFns = tgt?.functions || [];
    const { comparison } = data;

    const sMap = new Map(sourceFns.map(f => [f.slug, f]));
    const tMap = new Map(targetFns.map(f => [f.slug, f]));
    const slugs = Array.from(new Set([...sourceFns.map(f => f.slug), ...targetFns.map(f => f.slug)])).sort();

    const mitSet = new Set(comparison.functions_missing_in_target.map(f => f.slug));
    const misSet = new Set(comparison.functions_missing_in_source.map(f => f.slug));
    const sdMap = new Map(comparison.function_source_differences.map(d => [d.slug, d]));

    return {
      sourceSide: src,
      targetSide: tgt,
      sourceMap: sMap,
      targetMap: tMap,
      allSlugs: slugs,
      missingInTargetSet: mitSet,
      missingInSourceSet: misSet,
      sourceDiffMap: sdMap,
      totalDiffs: mitSet.size + misSet.size + sdMap.size,
    };
  }, [data]);

  const filteredSlugs = useMemo(() => {
    return allSlugs.filter(slug => {
      const isMissingTarget = missingInTargetSet.has(slug);
      const isMissingSource = missingInSourceSet.has(slug);
      const isDiff = sourceDiffMap.has(slug);

      if (viewMode === 'diffs' && !isDiff && !isMissingTarget && !isMissingSource) return false;
      if (viewMode === 'no-source' && !isMissingSource) return false;
      if (viewMode === 'no-target' && !isMissingTarget) return false;

      if (fnFilter && !slug.toLowerCase().includes(fnFilter.toLowerCase())) return false;

      return true;
    });
  }, [allSlugs, viewMode, fnFilter, missingInTargetSet, missingInSourceSet, sourceDiffMap]);

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

  if (allSlugs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
        <Zap className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No edge functions deployed in either environment.</p>
      </div>
    );
  }

  const viewModes: { id: typeof viewMode; label: string }[] = [
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
          {(!sourceSide?.available || !targetSide?.available) && (
            <span className="text-[10px] text-amber-400/70">
              {!sourceSide?.available && 'Source unavailable'}
              {!sourceSide?.available && !targetSide?.available && ' / '}
              {!targetSide?.available && 'Target unavailable'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{filteredSlugs.length} functions</span>
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
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-[40%]">Function</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-12">JWT</th>
              <th className="text-center px-4 py-2.5 text-teal-500/70 font-medium">Source</th>
              <th className="text-center px-4 py-2.5 text-sky-500/70 font-medium">Target</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-28">Status</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {filteredSlugs.map(slug => {
              const sf = sourceMap.get(slug);
              const tf = targetMap.get(slug);
              const missingTarget = missingInTargetSet.has(slug);
              const missingSource = missingInSourceSet.has(slug);
              const sourceDiff = sourceDiffMap.get(slug);

              return (
                <EdgeFunctionRow
                  key={slug}
                  slug={slug}
                  sourceFn={sf}
                  targetFn={tf}
                  missingTarget={missingTarget}
                  missingSource={missingSource}
                  sourceDiff={sourceDiff}
                  onViewSource={() => setViewingSlug(slug)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {viewingSlug && (
        <SourceComparisonModal
          type="edge-function"
          envName={envName}
          slug={viewingSlug}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onClose={() => setViewingSlug(null)}
        />
      )}
    </div>
  );
}

function EdgeFunctionRow({ slug, sourceFn, targetFn, missingTarget, missingSource, sourceDiff, onViewSource }: {
  slug: string;
  sourceFn?: EdgeFunction;
  targetFn?: EdgeFunction;
  missingTarget: boolean;
  missingSource: boolean;
  sourceDiff?: EdgeFunctionSourceDifference;
  onViewSource: () => void;
}) {
  const fn = sourceFn || targetFn;
  const hasDiff = missingTarget || missingSource || !!sourceDiff;

  return (
    <tr className={`transition-colors ${hasDiff ? 'bg-amber-500/[0.03] hover:bg-gray-800/30' : 'hover:bg-gray-800/30'}`}>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400/60 shrink-0" />
          <span className="font-mono text-gray-200">{slug}</span>
          {fn?.name && fn.name !== slug && (
            <span className="text-gray-500 text-[10px] truncate max-w-[120px]">{fn.name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        {fn?.verify_jwt ? (
          <Lock className="w-3 h-3 text-emerald-400/60 inline" />
        ) : (
          <Unlock className="w-3 h-3 text-gray-600 inline" />
        )}
      </td>
      <td className="px-4 py-2 text-center">
        {sourceFn ? (
          <span className="text-[10px] text-gray-400">v{sourceFn.version ?? '?'}</span>
        ) : (
          <span className="text-gray-600">--</span>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        {targetFn ? (
          <span className="text-[10px] text-gray-400">v{targetFn.version ?? '?'}</span>
        ) : (
          <span className="text-gray-600">--</span>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        {missingTarget ? (
          <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">no target</span>
        ) : missingSource ? (
          <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">no source</span>
        ) : sourceDiff ? (
          <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">differs</span>
        ) : (
          <span className="text-emerald-500/50 text-[10px]">match</span>
        )}
      </td>
      <td className="px-4 py-2 text-center">
        <button
          onClick={onViewSource}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-all mx-auto"
        >
          <ExternalLink className="w-3 h-3" />
          Source
        </button>
      </td>
    </tr>
  );
}
