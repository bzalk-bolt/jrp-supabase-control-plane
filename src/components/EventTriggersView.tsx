import { useEffect, useState, useMemo } from 'react';
import { Radio, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { syncApi } from '../services';
import type {
  DatabaseTriggersResponse,
  EventTrigger,
  EventTriggerIdentity,
} from '../types/api';

function etKey(t: EventTriggerIdentity): string {
  return t.name;
}

type ViewMode = 'diffs' | 'no-source' | 'no-target' | 'all';

export default function EventTriggersView({ envName, onCountLoaded, viewMode: externalViewMode, onViewModeChange }: {
  envName: string;
  onCountLoaded?: (count: number) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}) {
  const [data, setData] = useState<DatabaseTriggersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('diffs');
  const [trigFilter, setTrigFilter] = useState('');

  const viewMode = externalViewMode ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  useEffect(() => {
    setLoading(true);
    syncApi.getDatabaseTriggers(envName)
      .then(d => {
        setData(d);
        const sourceSide = d.databases.find(db => db.role === 'source');
        const targetSide = d.databases.find(db => db.role === 'target');
        const sKeys = new Set(sourceSide?.event_triggers.map(t => t.name) || []);
        const tKeys = new Set(targetSide?.event_triggers.map(t => t.name) || []);
        const allCount = new Set([...sKeys, ...tKeys]).size;
        onCountLoaded?.(allCount);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [envName]);

  const { sourceMap, targetMap, allKeys, missingInTargetSet, missingInSourceSet, differsSet, totalDiffs } = useMemo(() => {
    if (!data) return { sourceMap: new Map(), targetMap: new Map(), allKeys: [], missingInTargetSet: new Set<string>(), missingInSourceSet: new Set<string>(), differsSet: new Set<string>(), totalDiffs: 0 };

    const sourceSide = data.databases.find(d => d.role === 'source');
    const targetSide = data.databases.find(d => d.role === 'target');
    const sMap = new Map<string, EventTrigger>();
    const tMap = new Map<string, EventTrigger>();

    sourceSide?.event_triggers.forEach(t => sMap.set(t.name, t));
    targetSide?.event_triggers.forEach(t => tMap.set(t.name, t));

    const keys = Array.from(new Set([...sMap.keys(), ...tMap.keys()])).sort();
    const mitSet = new Set(data.comparison.event_triggers_missing_in_target.map(etKey));
    const misSet = new Set(data.comparison.event_triggers_missing_in_source.map(etKey));
    const dSet = new Set(data.comparison.event_trigger_definition_differences.map(etKey));

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
      const isMissingTarget = missingInTargetSet.has(key);
      const isMissingSource = missingInSourceSet.has(key);
      const isDiff = differsSet.has(key);

      if (viewMode === 'diffs' && !isDiff && !isMissingTarget && !isMissingSource) return false;
      if (viewMode === 'no-source' && !isMissingSource) return false;
      if (viewMode === 'no-target' && !isMissingTarget) return false;

      if (trigFilter) {
        const lf = trigFilter.toLowerCase();
        if (!key.toLowerCase().includes(lf)) return false;
      }

      return true;
    });
  }, [allKeys, viewMode, trigFilter, missingInTargetSet, missingInSourceSet, differsSet]);

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
        <Radio className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No event triggers found.</p>
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
          <span className="text-xs text-gray-500">{filteredKeys.length} triggers</span>
          <input
            type="text"
            placeholder="Filter..."
            value={trigFilter}
            onChange={e => setTrigFilter(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-gray-600"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800/60">
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Trigger</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-28">Event</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-36">Function</th>
              <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-20">Mode</th>
              <th className="text-center px-4 py-2.5 text-gray-500 font-medium w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {filteredKeys.map(key => {
              const st = sourceMap.get(key);
              const tt = targetMap.get(key);
              const trigger = (st || tt) as EventTrigger;
              if (!trigger) return null;
              const missingTarget = missingInTargetSet.has(key);
              const missingSource = missingInSourceSet.has(key);
              const differs = differsSet.has(key);
              const hasDiff = missingTarget || missingSource || differs;
              const isSelected = selectedTrigger === key;

              return (
                <EventTriggerRow
                  key={key}
                  trigger={trigger}
                  sourceTrigger={st}
                  targetTrigger={tt}
                  missingTarget={missingTarget}
                  missingSource={missingSource}
                  differs={differs}
                  hasDiff={hasDiff}
                  isSelected={isSelected}
                  onToggle={() => setSelectedTrigger(isSelected ? null : key)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventTriggerRow({ trigger, sourceTrigger, targetTrigger, missingTarget, missingSource, differs, hasDiff, isSelected, onToggle }: {
  trigger: EventTrigger;
  sourceTrigger?: EventTrigger;
  targetTrigger?: EventTrigger;
  missingTarget: boolean;
  missingSource: boolean;
  differs: boolean;
  hasDiff: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors ${
          isSelected ? 'bg-gray-800/60' : hasDiff ? 'bg-amber-500/[0.03] hover:bg-gray-800/30' : 'hover:bg-gray-800/30'
        }`}
      >
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            {isSelected ? <ChevronDown className="w-3 h-3 text-emerald-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
            <span className="font-mono text-gray-200">{trigger.name}</span>
            {trigger.tags && trigger.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {trigger.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-[9px] px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-500">{tag}</span>
                ))}
                {trigger.tags.length > 3 && <span className="text-[9px] text-gray-600">+{trigger.tags.length - 3}</span>}
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-2 text-gray-400">{trigger.event}</td>
        <td className="px-4 py-2 font-mono text-gray-500 text-[10px] truncate max-w-[140px]">{trigger.function_schema}.{trigger.function_name}</td>
        <td className="px-4 py-2 text-gray-500 text-[10px]">{trigger.enabled_mode}</td>
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
      </tr>
      {isSelected && (sourceTrigger || targetTrigger) && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="bg-gray-950 border-t border-gray-800 px-5 py-4 space-y-3">
              <div className="flex items-center gap-4 text-[10px] text-gray-500">
                {trigger.comment && <span className="italic truncate max-w-[300px]">{trigger.comment}</span>}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <EventDefBlock label="Source" trigger={sourceTrigger} color="teal" />
                <EventDefBlock label="Target" trigger={targetTrigger} color="sky" />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EventDefBlock({ label, trigger, color }: {
  label: string;
  trigger?: EventTrigger;
  color: 'teal' | 'sky';
}) {
  if (!trigger) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className={`text-[10px] uppercase tracking-wider mb-2 ${color === 'teal' ? 'text-teal-500/70' : 'text-sky-500/70'}`}>
          {label}
        </div>
        <div className="text-xs text-gray-500 italic">Not present</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-800 ${
        color === 'teal' ? 'bg-teal-500/5' : 'bg-sky-500/5'
      }`}>
        <span className={`text-[10px] uppercase tracking-wider ${color === 'teal' ? 'text-teal-500/70' : 'text-sky-500/70'}`}>
          {label}
        </span>
        <span className="text-[9px] font-mono text-gray-600" title={trigger.definition_sha256}>
          {trigger.definition_sha256.slice(0, 12)}
        </span>
      </div>
      <div className="max-h-56 overflow-auto">
        <pre className="text-[11px] font-mono text-gray-300 p-3 leading-relaxed whitespace-pre-wrap break-all">
          {trigger.definition}
        </pre>
      </div>
    </div>
  );
}
