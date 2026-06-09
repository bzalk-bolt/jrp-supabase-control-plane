import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Database, ArrowRight, ArrowLeftRight, Filter, Table2, Shield, ChevronDown, Check, Download } from 'lucide-react';
import { syncApi } from '../services';
import type { Environment, DatabaseStatsResponse } from '../types/api';
import { useEnvironments } from '../contexts/EnvironmentsContext';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';

type IdentityMap = Record<string, { source?: string; target?: string }>;
type TableTypeFilter = 'public' | 'system' | 'all';

const SYSTEM_SCHEMAS = new Set([
  'auth', '_realtime', 'realtime', 'storage', 'net',
  'vault', 'supabase_functions', 'supabase_migrations',
]);

function matchesTableType(schema: string, filter: TableTypeFilter): boolean {
  if (filter === 'all') return true;
  const isSystem = SYSTEM_SCHEMAS.has(schema);
  return filter === 'system' ? isSystem : !isSystem;
}

interface EnvStats {
  name: string;
  stats: DatabaseStatsResponse;
}

export default function Dashboard() {
  const { environments, identities, meta } = useEnvironments();
  const [loading, setLoading] = useState(true);
  const [envStats, setEnvStats] = useState<EnvStats[]>([]);
  const [selectedEnvs, setSelectedEnvs] = useState<Set<string>>(new Set());
  const [tableTypeFilter, setTableTypeFilter] = useState<TableTypeFilter>('public');

  useEffect(() => {
    if (environments.length === 0) {
      setLoading(false);
      return;
    }
    setSelectedEnvs(new Set(environments.map(e => e.name)));

    async function loadStats() {
      try {
        const statsResults = await Promise.allSettled(
          environments.map(env => {
            const envMeta = meta[env.name];
            const localEnvId = envMeta?.source === 'self-hosted' && envMeta.localEnvironmentId
              ? envMeta.localEnvironmentId
              : undefined;
            return syncApi.getEnvironmentStats(env.name, true, localEnvId).then(stats => ({ name: env.name, stats }));
          })
        );
        const fulfilled = statsResults
          .filter((r): r is PromiseFulfilledResult<EnvStats> => r.status === 'fulfilled')
          .map(r => r.value);
        setEnvStats(fulfilled);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [environments, meta]);

  const filteredStats = useMemo(() => {
    return envStats.filter(es => selectedEnvs.has(es.name));
  }, [envStats, selectedEnvs]);

  const aggregateData = useMemo(() => {
    if (filteredStats.length === 0) return null;

    let totalTables = 0;
    let matchedTables = 0;
    let missingInTarget = 0;
    let missingInSource = 0;
    let columnDiffs = 0;
    let totalEdgeFunctions = 0;
    let totalDbFunctions = 0;
    let totalBuckets = 0;
    let bucketDiffs = 0;

    for (const es of filteredStats) {
      const { comparison, databases } = es.stats;
      const source = databases.find(d => d.role === 'source');
      const target = databases.find(d => d.role === 'target');

      const sourceTables = (source?.tables || []).filter(t => matchesTableType(t.schema, tableTypeFilter));
      const targetTables = (target?.tables || []).filter(t => matchesTableType(t.schema, tableTypeFilter));
      const sourceKeys = new Set(sourceTables.map(t => `${t.schema}.${t.name}`));
      const targetKeys = new Set(targetTables.map(t => `${t.schema}.${t.name}`));
      const allKeys = new Set([...sourceKeys, ...targetKeys]);
      totalTables += allKeys.size;

      const mitSet = new Set(
        comparison.tables_missing_in_target
          .filter(t => matchesTableType(t.schema, tableTypeFilter))
          .map(t => `${t.schema}.${t.name}`)
      );
      const misSet = new Set(
        comparison.tables_missing_in_source
          .filter(t => matchesTableType(t.schema, tableTypeFilter))
          .map(t => `${t.schema}.${t.name}`)
      );
      missingInTarget += mitSet.size;
      missingInSource += misSet.size;

      let colDiffs = 0;
      for (const key of allKeys) {
        if (!mitSet.has(key) && !misSet.has(key)) {
          const s = sourceTables.find(t => `${t.schema}.${t.name}` === key);
          const t = targetTables.find(t => `${t.schema}.${t.name}` === key);
          if (s && t && s.column_count !== t.column_count) colDiffs++;
        }
      }
      columnDiffs += colDiffs;
      matchedTables += allKeys.size - mitSet.size - misSet.size - colDiffs;

      const sBuckets = source?.storage_buckets || [];
      const tBuckets = target?.storage_buckets || [];
      const allBuckets = new Set([...sBuckets.map(b => b.id), ...tBuckets.map(b => b.id)]);
      totalBuckets += allBuckets.size;
      bucketDiffs += comparison.storage_buckets_missing_in_target.length + comparison.storage_buckets_missing_in_source.length;

      totalEdgeFunctions += 0;
      totalDbFunctions += 0;
    }

    return {
      totalTables,
      matchedTables,
      missingInTarget,
      missingInSource,
      columnDiffs,
      totalEdgeFunctions,
      totalDbFunctions,
      totalBuckets,
      bucketDiffs,
    };
  }, [filteredStats, tableTypeFilter]);

  const perEnvBreakdown = useMemo(() => {
    return filteredStats.map(es => {
      const { comparison, databases } = es.stats;
      const source = databases.find(d => d.role === 'source');
      const target = databases.find(d => d.role === 'target');

      const sourceTables = (source?.tables || []).filter(t => matchesTableType(t.schema, tableTypeFilter));
      const targetTables = (target?.tables || []).filter(t => matchesTableType(t.schema, tableTypeFilter));
      const sourceKeys = new Set(sourceTables.map(t => `${t.schema}.${t.name}`));
      const targetKeys = new Set(targetTables.map(t => `${t.schema}.${t.name}`));
      const allKeys = new Set([...sourceKeys, ...targetKeys]);
      const total = allKeys.size;

      const mitSet = new Set(
        comparison.tables_missing_in_target
          .filter(t => matchesTableType(t.schema, tableTypeFilter))
          .map(t => `${t.schema}.${t.name}`)
      );
      const misSet = new Set(
        comparison.tables_missing_in_source
          .filter(t => matchesTableType(t.schema, tableTypeFilter))
          .map(t => `${t.schema}.${t.name}`)
      );

      let colDiffs = 0;
      for (const key of allKeys) {
        if (!mitSet.has(key) && !misSet.has(key)) {
          const s = source?.tables.find(t => `${t.schema}.${t.name}` === key);
          const t = target?.tables.find(t => `${t.schema}.${t.name}` === key);
          if (s && t && s.column_count !== t.column_count) colDiffs++;
        }
      }

      const diffs = mitSet.size + misSet.size + colDiffs;
      const matched = total - diffs;
      const syncPercent = total > 0 ? Math.round((matched / total) * 100) : 100;

      return {
        name: es.name,
        total,
        matched,
        diffs,
        missingInTarget: mitSet.size,
        missingInSource: misSet.size,
        columnDiffs: colDiffs,
        syncPercent,
      };
    });
  }, [filteredStats, tableTypeFilter]);

  function toggleEnv(name: string) {
    setSelectedEnvs(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelectedEnvs(new Set(environments.map(e => e.name)));
  }

  function clearAll() {
    setSelectedEnvs(new Set());
  }

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  if (environments.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Overview of your database sync environments.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
            <Download className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Get started by importing a project</h2>
          <p className="text-sm text-gray-400 max-w-md mb-6">
            The Import wizard pulls the schema (and optionally data) from a hosted Supabase project into a local environment in a few guided steps.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/import"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
            >
              <Download className="w-4 h-4" />
              Import from Supabase
            </Link>
            <Link
              to="/environments"
              className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              or create one manually
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">High-level sync health across your environments.</p>
        </div>
        <Link
          to="/environments"
          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Manage Environments <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <FilterBar
        environments={environments}
        selectedEnvs={selectedEnvs}
        toggleEnv={toggleEnv}
        selectAll={selectAll}
        clearAll={clearAll}
        tableTypeFilter={tableTypeFilter}
        setTableTypeFilter={setTableTypeFilter}
      />

      {filteredStats.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-12 text-center">
          <Filter className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Select at least one environment to view sync metrics.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SyncHealthDonut data={aggregateData} envCount={filteredStats.length} />
            <DriftBreakdownChart data={aggregateData} />
            <EnvVerticalBars perEnvBreakdown={perEnvBreakdown} />
          </div>

          <EnvironmentListCard environments={environments} identities={identities} selectedEnvs={selectedEnvs} />
        </>
      )}
    </div>
  );
}

function FilterBar({ environments, selectedEnvs, toggleEnv, selectAll, clearAll, tableTypeFilter, setTableTypeFilter }: {
  environments: Environment[];
  selectedEnvs: Set<string>;
  toggleEnv: (name: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  tableTypeFilter: TableTypeFilter;
  setTableTypeFilter: (v: TableTypeFilter) => void;
}) {
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEnvDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const tableTypes: { id: TableTypeFilter; label: string; icon: typeof Table2 }[] = [
    { id: 'public', label: 'Public', icon: Table2 },
    { id: 'system', label: 'System', icon: Shield },
    { id: 'all', label: 'All', icon: Database },
  ];

  const selectedCount = selectedEnvs.size;
  const totalCount = environments.length;
  const label = selectedCount === totalCount
    ? 'All environments'
    : selectedCount === 0
      ? 'No environments'
      : `${selectedCount} of ${totalCount} environments`;

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Environment multi-select dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setEnvDropdownOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-300 bg-gray-900/50 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg transition-all"
        >
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <span>{label}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${envDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {envDropdownOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Environments</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectAll}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded transition-colors"
                >
                  All
                </button>
                <span className="text-gray-700 text-[10px]">|</span>
                <button
                  onClick={clearAll}
                  className="text-[10px] text-gray-400 hover:text-gray-300 px-1.5 py-0.5 rounded transition-colors"
                >
                  None
                </button>
              </div>
            </div>
            <div className="py-1 max-h-[240px] overflow-y-auto">
              {environments.map(env => {
                const isActive = selectedEnvs.has(env.name);
                return (
                  <button
                    key={env.name}
                    onClick={() => toggleEnv(env.name)}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-gray-800/60 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      isActive
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-gray-600 bg-transparent'
                    }`}>
                      {isActive && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <Database className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className={`text-xs truncate ${isActive ? 'text-gray-200' : 'text-gray-500'}`}>
                      {env.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Table type toggle */}
      <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-lg p-0.5">
        {tableTypes.map(tt => (
          <button
            key={tt.id}
            onClick={() => setTableTypeFilter(tt.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              tableTypeFilter === tt.id
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <tt.icon className="w-3 h-3" />
            {tt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SyncHealthDonut({ data, envCount }: {
  data: AggregateData | null;
  envCount: number;
}) {
  if (!data) return null;

  const { totalTables, matchedTables, missingInTarget, missingInSource, columnDiffs } = data;
  const syncPercent = totalTables > 0 ? Math.round((matchedTables / totalTables) * 100) : 100;

  const segments = [
    { value: matchedTables, color: '#10b981' },
    { value: columnDiffs, color: '#f59e0b' },
    { value: missingInTarget, color: '#ef4444' },
    { value: missingInSource, color: '#6366f1' },
  ].filter(s => s.value > 0);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-4">Overall Sync Health</div>
      <div className="flex items-center justify-center">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={radius} fill="none" stroke="#1f2937" strokeWidth="14" />
            {segments.map((seg, i) => {
              const segLength = totalTables > 0 ? (seg.value / totalTables) * circumference : 0;
              const el = (
                <circle
                  key={i}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${segLength} ${circumference - segLength}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  transform="rotate(-90 80 80)"
                  className="transition-all duration-700"
                />
              );
              offset += segLength;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{syncPercent}%</span>
            <span className="text-[10px] text-gray-500">synced</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <LegendItem color="bg-emerald-500" label="Matched" value={matchedTables} />
        <LegendItem color="bg-amber-500" label="Col Diffs" value={columnDiffs} />
        <LegendItem color="bg-red-500" label="No Target" value={missingInTarget} />
        <LegendItem color="bg-indigo-500" label="No Source" value={missingInSource} />
      </div>
      <div className="text-center mt-3 text-[10px] text-gray-600">
        {totalTables} tables across {envCount} {envCount === 1 ? 'environment' : 'environments'}
      </div>
    </div>
  );
}

function DriftBreakdownChart({ data }: { data: AggregateData | null }) {
  if (!data) return null;

  const { missingInTarget, missingInSource, columnDiffs, totalBuckets, bucketDiffs } = data;
  const categories = [
    { label: 'Missing in Target', value: missingInTarget, color: 'bg-red-500', textColor: 'text-red-400' },
    { label: 'Missing in Source', value: missingInSource, color: 'bg-sky-500', textColor: 'text-sky-400' },
    { label: 'Column Differences', value: columnDiffs, color: 'bg-amber-500', textColor: 'text-amber-400' },
    { label: 'Bucket Drift', value: bucketDiffs, color: 'bg-teal-500', textColor: 'text-teal-400' },
  ];

  const max = Math.max(...categories.map(c => c.value), 1);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-4">Drift Breakdown</div>
      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">{cat.label}</span>
              <span className={`text-xs font-semibold ${cat.value > 0 ? cat.textColor : 'text-gray-600'}`}>{cat.value}</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${cat.color}`}
                style={{ width: `${(cat.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {totalBuckets > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-800 text-[10px] text-gray-600">
          {totalBuckets} storage {totalBuckets === 1 ? 'bucket' : 'buckets'} tracked
        </div>
      )}
    </div>
  );
}

function EnvVerticalBars({ perEnvBreakdown }: {
  perEnvBreakdown: { name: string; total: number; matched: number; missingInTarget: number; missingInSource: number; columnDiffs: number }[];
}) {
  const maxVal = Math.max(...perEnvBreakdown.flatMap(e => [e.matched, e.columnDiffs, e.missingInTarget, e.missingInSource]), 1);
  const barHeight = 120;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-4">Table Status by Environment</div>
      <div className="flex-1 flex flex-col gap-4 min-h-[160px]">
        {perEnvBreakdown.map(env => (
          <div key={env.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-300 font-medium truncate" title={env.name}>{env.name}</span>
              <span className="text-[10px] text-gray-500">{env.total} tables</span>
            </div>
            <div className="flex items-end gap-1.5 h-[${barHeight}px]" style={{ height: `${barHeight}px` }}>
              <BarSegment value={env.matched} max={maxVal} height={barHeight} color="bg-emerald-500" label={env.matched} />
              <BarSegment value={env.columnDiffs} max={maxVal} height={barHeight} color="bg-amber-500" label={env.columnDiffs} />
              <BarSegment value={env.missingInTarget} max={maxVal} height={barHeight} color="bg-red-500" label={env.missingInTarget} />
              <BarSegment value={env.missingInSource} max={maxVal} height={barHeight} color="bg-sky-500" label={env.missingInSource} />
            </div>
          </div>
        ))}
        {perEnvBreakdown.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4">No data available</p>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-800">
        <LegendItem color="bg-emerald-500" label="Matched" compact />
        <LegendItem color="bg-amber-500" label="Col Diff" compact />
        <LegendItem color="bg-red-500" label="No Target" compact />
        <LegendItem color="bg-sky-500" label="No Source" compact />
      </div>
    </div>
  );
}

function BarSegment({ value, max, height, color, label }: { value: number; max: number; height: number; color: string; label: number }) {
  const barH = max > 0 ? (value / max) * height : 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-end h-full">
      {value > 0 && <span className="text-[9px] text-gray-500 mb-1">{label}</span>}
      <div
        className={`w-full rounded-t transition-all duration-500 ${value > 0 ? color : 'bg-gray-800'}`}
        style={{ height: `${Math.max(barH, value > 0 ? 4 : 2)}px` }}
      />
    </div>
  );
}


function EnvironmentListCard({ environments, identities, selectedEnvs }: {
  environments: Environment[];
  identities: IdentityMap;
  selectedEnvs: Set<string>;
}) {
  const filtered = environments.filter(e => selectedEnvs.has(e.name));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Environments</h2>
        <Link to="/environments" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
          Manage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-800/60">
        {filtered.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-gray-500">No environments selected</div>
        ) : (
          filtered.map(env => (
            <div
              key={env.name}
              className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <Link
                to={`/environments/${env.name}`}
                className="flex items-center gap-3 group flex-1 min-w-0"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200 group-hover:text-emerald-400 transition-colors truncate">{env.name}</div>
                  {identities[env.name] && (
                    <div className="text-[10px] font-mono truncate">
                      <span className="text-teal-400">{identities[env.name].source}</span>
                      <span className="text-gray-600"> → </span>
                      <span className="text-sky-400">{identities[env.name].target}</span>
                    </div>
                  )}
                </div>
              </Link>
              <Link
                to={`/compare/${env.name}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors shrink-0 ml-3"
              >
                <ArrowLeftRight className="w-3 h-3" />
                Compare
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label, value, compact }: { color: string; label: string; value?: number; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-[10px] text-gray-400">{label}</span>
      {value != null && <span className="text-[10px] font-semibold text-gray-300 ml-auto">{value}</span>}
    </div>
  );
}

interface AggregateData {
  totalTables: number;
  matchedTables: number;
  missingInTarget: number;
  missingInSource: number;
  columnDiffs: number;
  totalEdgeFunctions: number;
  totalDbFunctions: number;
  totalBuckets: number;
  bucketDiffs: number;
}
