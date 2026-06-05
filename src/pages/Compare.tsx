import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Table2, HardDrive, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Zap, Code2, Activity, Radio, ArrowLeftRight, Shield, GitBranch, Loader2, ScrollText } from 'lucide-react';
import { syncApi } from '../services';
import type { Branch, BranchesResponse, EnvironmentIdentity, DatabaseStatsResponse, DatabaseStats, TableStats, StatsComparison } from '../types/api';
import AppLoadingSkeleton from '../components/AppLoadingSkeleton';
import EnvironmentSelector from '../components/EnvironmentSelector';
import { useEnvironments } from '../contexts/EnvironmentsContext';
import TableDetailPanel from '../components/TableDetailPanel';
import EdgeFunctionsView from '../components/EdgeFunctionsView';
import DatabaseFunctionsView from '../components/DatabaseFunctionsView';
import TableTriggersView from '../components/TableTriggersView';
import EventTriggersView from '../components/EventTriggersView';
import MigrationsPanel from '../components/MigrationsPanel';

const SYSTEM_SCHEMAS = new Set([
  'auth', '_realtime', 'realtime', 'storage', 'net',
  'vault', 'supabase_functions', 'supabase_migrations',
]);

const LAST_ENV_KEY = 'syncdb_compare_last_env';

type TabId = 'tables' | 'system-tables' | 'edge-functions' | 'db-functions' | 'table-triggers' | 'event-triggers' | 'storage' | 'migrations';

export default function Compare() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { environments, meta } = useEnvironments();
  const [selectedEnv, setSelectedEnv] = useState<string | null>(name || localStorage.getItem(LAST_ENV_KEY));

  const [stats, setStats] = useState<DatabaseStatsResponse | null>(null);
  const [identity, setIdentity] = useState<EnvironmentIdentity | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Branch state
  const [branchData, setBranchData] = useState<BranchesResponse | null>(null);
  const [switching, setSwitching] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('tables');
  const [tableViewMode, setTableViewMode] = useState<'diffs' | 'no-source' | 'no-target' | 'all'>('diffs');
  const [tableFilter, setTableFilter] = useState('');
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set(['public']));
  const [selectedTable, setSelectedTable] = useState<{ schema: string; table: string } | null>(null);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  const sourceParam = searchParams.get('source');

  const setSourceParam = useCallback((value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('source', value);
      else next.delete('source');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (sourceParam) {
      if (sourceParam.startsWith('edge:')) setActiveTab('edge-functions');
      else if (sourceParam.startsWith('fn:')) setActiveTab('db-functions');
    }
  }, []);

  useEffect(() => {
    if (!selectedEnv && environments.length > 0) {
      const last = localStorage.getItem(LAST_ENV_KEY);
      const pick = last && environments.find(e => e.name === last) ? last : environments[0].name;
      handleSelectEnv(pick);
    }
  }, [environments]);

  useEffect(() => {
    if (name && name !== selectedEnv) {
      setSelectedEnv(name);
    }
  }, [name]);

  useEffect(() => {
    if (selectedEnv) {
      loadStats();
    }
  }, [selectedEnv]);

  function handleSelectEnv(envName: string) {
    setSelectedEnv(envName);
    localStorage.setItem(LAST_ENV_KEY, envName);
    navigate(`/compare/${envName}`, { replace: true });
    setStats(null);
    setSelectedTable(null);
  }

  async function loadStats() {
    if (!selectedEnv) return;
    try {
      setStatsLoading(true);
      setError('');
      const [data] = await Promise.all([
        syncApi.getEnvironmentStats(selectedEnv, true),
        syncApi.getEnvironmentIdentity(selectedEnv).then(setIdentity).catch(() => setIdentity(null)),
        syncApi.listBranches(selectedEnv).then(setBranchData).catch(() => setBranchData(null)),
      ]);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleBranchSwitch(branch: Branch) {
    try {
      setError('');
      setSwitching(true);
      const job = await syncApi.switchBranch(branch.name, { autosave: true });
      const result = await syncApi.pollJob(job.id);
      if (result.status === 'failed') {
        throw new Error(result.output || 'Branch switch failed');
      }
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch branch');
    } finally {
      setSwitching(false);
    }
  }

  const sourceProject = identity?.projects.find(p => p.role === 'source');
  const targetProject = identity?.projects.find(p => p.role === 'target');

  async function handleRefresh() {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }

  function toggleSchema(schema: string) {
    setExpandedSchemas(prev => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  }

  const handleTableClick = useCallback((schema: string, table: string) => {
    setSelectedTable(prev =>
      prev?.schema === schema && prev?.table === table ? null : { schema, table }
    );
  }, []);

  useEffect(() => {
    if (!selectedEnv) return;

    syncApi.getEdgeFunctions(selectedEnv).then(d => {
      const sourceFns = d.edge_functions.find(s => s.role === 'source')?.functions || [];
      const targetFns = d.edge_functions.find(s => s.role === 'target')?.functions || [];
      const count = new Set([...sourceFns.map(f => f.slug), ...targetFns.map(f => f.slug)]).size;
      setTabCounts(prev => ({ ...prev, 'edge-functions': count }));
    }).catch(() => {});

    syncApi.getDatabaseFunctions(selectedEnv).then(d => {
      const sourceSide = d.databases.find(db => db.role === 'source');
      const targetSide = d.databases.find(db => db.role === 'target');
      const sKeys = sourceSide?.functions.map(f => `${f.schema}.${f.name}(${f.identity_arguments})`) || [];
      const tKeys = targetSide?.functions.map(f => `${f.schema}.${f.name}(${f.identity_arguments})`) || [];
      const count = new Set([...sKeys, ...tKeys]).size;
      setTabCounts(prev => ({ ...prev, 'db-functions': count }));
    }).catch(() => {});

    syncApi.getDatabaseTriggers(selectedEnv).then(d => {
      const sourceSide = d.databases.find(db => db.role === 'source');
      const targetSide = d.databases.find(db => db.role === 'target');
      const sTriggers = sourceSide?.table_triggers.map(t => `${t.schema}.${t.table}.${t.name}`) || [];
      const tTriggers = targetSide?.table_triggers.map(t => `${t.schema}.${t.table}.${t.name}`) || [];
      const triggerCount = new Set([...sTriggers, ...tTriggers]).size;
      setTabCounts(prev => ({ ...prev, 'table-triggers': triggerCount }));

      const sEvents = sourceSide?.event_triggers.map(t => t.name) || [];
      const tEvents = targetSide?.event_triggers.map(t => t.name) || [];
      const eventCount = new Set([...sEvents, ...tEvents]).size;
      setTabCounts(prev => ({ ...prev, 'event-triggers': eventCount }));
    }).catch(() => {});

    syncApi.listMigrations(selectedEnv).then(d => {
      setTabCounts(prev => ({ ...prev, 'migrations': d.migrations?.length ?? 0 }));
    }).catch(() => {});
  }, [selectedEnv]);

  const source = stats?.databases.find(d => d.role === 'source');
  const target = stats?.databases.find(d => d.role === 'target');
  const comparison = stats?.comparison;

  const allTableKeys = useMemo(() => {
    if (!source && !target) return { user: 0, system: 0 };
    const all = new Set([
      ...(source?.tables.map(t => `${t.schema}.${t.name}`) || []),
      ...(target?.tables.map(t => `${t.schema}.${t.name}`) || []),
    ]);
    let user = 0;
    let system = 0;
    all.forEach(key => {
      const schema = key.split('.')[0];
      if (SYSTEM_SCHEMAS.has(schema)) system++;
      else user++;
    });
    return { user, system };
  }, [source, target]);

  const tableCount = allTableKeys.user;
  const systemTableCount = allTableKeys.system;


  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-4">
          <ArrowLeftRight className="w-6 h-6 text-gray-500" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">No environments configured</h2>
        <p className="text-sm text-gray-400 max-w-sm mb-6">Create an environment to start comparing databases.</p>
        <a
          href="/environments"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go to Environments
        </a>
      </div>
    );
  }

  if (statsLoading && !stats) {
    return <AppLoadingSkeleton />;
  }

  const storageCount = source || target
    ? new Set([
        ...(source?.storage_buckets.map(b => b.id) || []),
        ...(target?.storage_buckets.map(b => b.id) || []),
      ]).size
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <EnvironmentSelector
            environments={environments}
            selected={selectedEnv}
            onSelect={handleSelectEnv}
            loading={false}
            sourceLabel={sourceProject?.name}
            targetLabel={targetProject?.name}
            meta={meta}
          />
          {branchData && branchData.branches.length > 0 && (
            <CompareBranchSwitcher
              branches={branchData.branches}
              activeBranch={branchData.branches.find(b => b.active) || null}
              switching={switching}
              onSwitch={handleBranchSwitch}
            />
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || statsLoading || switching}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {stats && comparison ? (
        <>
          <TabNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={{
              tables: tableCount,
              'system-tables': systemTableCount,
              storage: storageCount,
              'edge-functions': tabCounts['edge-functions'],
              'db-functions': tabCounts['db-functions'],
              'table-triggers': tabCounts['table-triggers'],
              'event-triggers': tabCounts['event-triggers'],
              'migrations': tabCounts['migrations'],
            }}
          />

          {activeTab === 'tables' && (
            <TablesView
              envName={selectedEnv!}
              source={source}
              target={target}
              comparison={comparison}
              viewMode={tableViewMode}
              setViewMode={setTableViewMode}
              systemOnly={false}
              tableFilter={tableFilter}
              setTableFilter={setTableFilter}
              expandedSchemas={expandedSchemas}
              toggleSchema={toggleSchema}
              selectedTable={selectedTable}
              onTableClick={handleTableClick}
            />
          )}

          {activeTab === 'system-tables' && (
            <TablesView
              envName={selectedEnv!}
              source={source}
              target={target}
              comparison={comparison}
              viewMode={tableViewMode}
              setViewMode={setTableViewMode}
              systemOnly={true}
              tableFilter={tableFilter}
              setTableFilter={setTableFilter}
              expandedSchemas={expandedSchemas}
              toggleSchema={toggleSchema}
              selectedTable={selectedTable}
              onTableClick={handleTableClick}
            />
          )}

          {activeTab === 'storage' && (
            <StorageView source={source} target={target} comparison={comparison} />
          )}

          {activeTab === 'edge-functions' && (
            <EdgeFunctionsView
              envName={selectedEnv!}
              openSlug={sourceParam?.startsWith('edge:') ? sourceParam.slice(5) : undefined}
              onSourceChange={(slug) => setSourceParam(slug ? `edge:${slug}` : null)}
              sourceLabel={sourceProject?.name}
              targetLabel={targetProject?.name}
            />
          )}

          {activeTab === 'db-functions' && (
            <DatabaseFunctionsView
              envName={selectedEnv!}
              openFnKey={sourceParam?.startsWith('fn:') ? sourceParam.slice(3) : undefined}
              onSourceChange={(key) => setSourceParam(key ? `fn:${key}` : null)}
              sourceLabel={sourceProject?.name}
              targetLabel={targetProject?.name}
            />
          )}

          {activeTab === 'table-triggers' && (
            <TableTriggersView envName={selectedEnv!} />
          )}

          {activeTab === 'event-triggers' && (
            <EventTriggersView envName={selectedEnv!} />
          )}

          {activeTab === 'migrations' && (
            <MigrationsPanel envName={selectedEnv!} />
          )}
        </>
      ) : null}
    </div>
  );
}


function TabNav({ activeTab, onTabChange, counts }: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  counts: Partial<Record<TabId, number | undefined>>;
}) {
  const tabs: { id: TabId; label: string; icon: typeof Table2 }[] = [
    { id: 'tables', label: 'Tables', icon: Table2 },
    { id: 'system-tables', label: 'System Tables', icon: Shield },
    { id: 'edge-functions', label: 'Edge Functions', icon: Zap },
    { id: 'db-functions', label: 'Functions', icon: Code2 },
    { id: 'table-triggers', label: 'Table Triggers', icon: Activity },
    { id: 'event-triggers', label: 'Event Triggers', icon: Radio },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'migrations', label: 'Migrations', icon: ScrollText },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-gray-800 overflow-x-auto scrollbar-hidden">
      {tabs.map(tab => {
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {count != null && count > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 bg-gray-700 text-gray-300 text-[10px] font-semibold rounded-full">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type TableViewMode = 'diffs' | 'no-source' | 'no-target' | 'all';

function TablesView({ envName, source, target, comparison, viewMode, setViewMode, systemOnly, tableFilter, setTableFilter, expandedSchemas, toggleSchema, selectedTable, onTableClick }: {
  envName: string;
  source?: DatabaseStats;
  target?: DatabaseStats;
  comparison: StatsComparison;
  viewMode: TableViewMode;
  setViewMode: (v: TableViewMode) => void;
  systemOnly: boolean;
  tableFilter: string;
  setTableFilter: (v: string) => void;
  expandedSchemas: Set<string>;
  toggleSchema: (schema: string) => void;
  selectedTable: { schema: string; table: string } | null;
  onTableClick: (schema: string, table: string) => void;
}) {
  const sourceMap = useMemo(() => {
    const m = new Map<string, TableStats>();
    source?.tables.forEach(t => m.set(`${t.schema}.${t.name}`, t));
    return m;
  }, [source]);

  const targetMap = useMemo(() => {
    const m = new Map<string, TableStats>();
    target?.tables.forEach(t => m.set(`${t.schema}.${t.name}`, t));
    return m;
  }, [target]);

  const missingInTargetSet = useMemo(() => {
    const s = new Set<string>();
    comparison.tables_missing_in_target.forEach(t => s.add(`${t.schema}.${t.name}`));
    return s;
  }, [comparison]);

  const missingInSourceSet = useMemo(() => {
    const s = new Set<string>();
    comparison.tables_missing_in_source.forEach(t => s.add(`${t.schema}.${t.name}`));
    return s;
  }, [comparison]);

  const schemaGroups = useMemo(() => {
    const allKeys = Array.from(new Set([...sourceMap.keys(), ...targetMap.keys()])).sort();
    const groups: Map<string, { key: string; source?: TableStats; target?: TableStats; status: 'no-source' | 'no-target' | 'diff' | 'match' }[]> = new Map();

    for (const key of allKeys) {
      const [schema] = key.split('.');
      const isSystem = SYSTEM_SCHEMAS.has(schema);
      if (systemOnly && !isSystem) continue;
      if (!systemOnly && isSystem) continue;

      const s = sourceMap.get(key);
      const t = targetMap.get(key);

      let status: 'no-source' | 'no-target' | 'diff' | 'match' = 'match';
      if (missingInTargetSet.has(key)) status = 'no-target';
      else if (missingInSourceSet.has(key)) status = 'no-source';
      else if (s && t && s.column_count !== t.column_count) status = 'diff';

      if (viewMode === 'diffs' && status === 'match') continue;
      if (viewMode === 'no-source' && status !== 'no-source') continue;
      if (viewMode === 'no-target' && status !== 'no-target') continue;

      const tableName = key.slice(schema.length + 1);
      if (tableFilter && !tableName.toLowerCase().includes(tableFilter.toLowerCase())) continue;

      if (!groups.has(schema)) groups.set(schema, []);
      groups.get(schema)!.push({ key, source: s, target: t, status });
    }

    return groups;
  }, [sourceMap, targetMap, missingInTargetSet, missingInSourceSet, viewMode, systemOnly, tableFilter]);

  const totalVisible = Array.from(schemaGroups.values()).reduce((sum, g) => sum + g.length, 0);

  const viewModes: { id: TableViewMode; label: string }[] = [
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
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{totalVisible} tables</span>
          <input
            type="text"
            placeholder="Filter..."
            value={tableFilter}
            onChange={e => setTableFilter(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-gray-600"
          />
        </div>
      </div>

      {totalVisible === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500/40 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {viewMode === 'diffs' ? 'No structural differences found. All tables match.' : viewMode === 'all' ? 'No tables found.' : 'No tables match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from(schemaGroups.entries()).map(([schema, tables]) => (
            <SchemaAccordion
              key={schema}
              schema={schema}
              tables={tables}
              expanded={expandedSchemas.has(schema)}
              onToggle={() => toggleSchema(schema)}
              envName={envName}
              selectedTable={selectedTable}
              onTableClick={onTableClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaAccordion({ schema, tables, expanded, onToggle, envName, selectedTable, onTableClick }: {
  schema: string;
  tables: { key: string; source?: TableStats; target?: TableStats; status: 'no-source' | 'no-target' | 'diff' | 'match' }[];
  expanded: boolean;
  onToggle: () => void;
  envName: string;
  selectedTable: { schema: string; table: string } | null;
  onTableClick: (schema: string, table: string) => void;
}) {
  const diffCount = tables.filter(t => t.status !== 'match').length;
  const isSystem = SYSTEM_SCHEMAS.has(schema);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <span className={`text-sm font-mono font-medium ${isSystem ? 'text-gray-400' : 'text-white'}`}>{schema}</span>
          <span className="text-xs text-gray-500">{tables.length} {tables.length === 1 ? 'table' : 'tables'}</span>
        </div>
        <div className="flex items-center gap-2">
          {diffCount > 0 ? (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-medium text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {diffCount} {diffCount === 1 ? 'diff' : 'diffs'}
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-medium text-emerald-400">
              <CheckCircle className="w-3 h-3" /> synced
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800/60">
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Table</th>
                <th className="text-right px-4 py-2 text-teal-500/70 font-medium whitespace-nowrap">Source Rows</th>
                <th className="text-right px-4 py-2 text-sky-500/70 font-medium whitespace-nowrap">Target Rows</th>
                <th className="text-right px-4 py-2 text-teal-500/70 font-medium whitespace-nowrap">Source Cols</th>
                <th className="text-right px-4 py-2 text-sky-500/70 font-medium whitespace-nowrap">Target Cols</th>
                <th className="text-right px-4 py-2 text-teal-500/70 font-medium whitespace-nowrap">Source Size</th>
                <th className="text-right px-4 py-2 text-sky-500/70 font-medium whitespace-nowrap">Target Size</th>
                <th className="text-center px-4 py-2 text-gray-500 font-medium whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {tables.map(({ key, source, target, status }) => {
                const tableName = key.slice(schema.length + 1);
                const isSelected = selectedTable?.schema === schema && selectedTable?.table === tableName;

                return (
                  <TableRow
                    key={key}
                    schema={schema}
                    tableName={tableName}
                    source={source}
                    target={target}
                    status={status}
                    isSelected={isSelected}
                    envName={envName}
                    onTableClick={onTableClick}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TableRow({ schema, tableName, source, target, status, isSelected, envName, onTableClick }: {
  schema: string;
  tableName: string;
  source?: TableStats;
  target?: TableStats;
  status: 'no-source' | 'no-target' | 'diff' | 'match';
  isSelected: boolean;
  envName: string;
  onTableClick: (schema: string, table: string) => void;
}) {
  const hasDiff = status !== 'match';

  return (
    <>
      <tr
        onClick={() => onTableClick(schema, tableName)}
        className={`cursor-pointer transition-colors ${
          isSelected ? 'bg-gray-800/60' : hasDiff ? 'bg-amber-500/[0.03] hover:bg-gray-800/30' : 'hover:bg-gray-800/30'
        }`}
      >
        <td className="px-4 py-2 text-gray-200 font-mono">
          <div className="flex items-center gap-2">
            {isSelected ? <ChevronDown className="w-3 h-3 text-emerald-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />}
            {tableName}
          </div>
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {source ? source.row_count.toLocaleString() : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {target ? target.row_count.toLocaleString() : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {source?.column_count != null ? source.column_count : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {target?.column_count != null ? target.column_count : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {source?.total_bytes != null ? formatBytes(source.total_bytes) : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-right font-mono text-gray-400">
          {target?.total_bytes != null ? formatBytes(target.total_bytes) : <span className="text-gray-600">--</span>}
        </td>
        <td className="px-4 py-2 text-center whitespace-nowrap">
          {status === 'no-target' && (
            <span className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">no target</span>
          )}
          {status === 'no-source' && (
            <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">no source</span>
          )}
          {status === 'diff' && (
            <span className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-400">diff</span>
          )}
          {status === 'match' && (
            <span className="text-emerald-500/50 text-[10px]">match</span>
          )}
        </td>
      </tr>
      {isSelected && (
        <tr>
          <td colSpan={8} className="p-0">
            <TableDetailPanel envName={envName} schema={schema} table={tableName} />
          </td>
        </tr>
      )}
    </>
  );
}

function StorageView({ source, target, comparison }: {
  source?: DatabaseStats;
  target?: DatabaseStats;
  comparison: StatsComparison;
}) {
  const sourceBuckets = source?.storage_buckets || [];
  const targetBuckets = target?.storage_buckets || [];
  const allIds = Array.from(new Set([...sourceBuckets.map(b => b.id), ...targetBuckets.map(b => b.id)]));
  const missingInTarget = new Set(comparison.storage_buckets_missing_in_target.map(b => b.id));
  const missingInSource = new Set(comparison.storage_buckets_missing_in_source.map(b => b.id));

  if (allIds.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
        <HardDrive className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No storage buckets configured.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">{allIds.length} {allIds.length === 1 ? 'bucket' : 'buckets'}</span>
        {(missingInTarget.size > 0 || missingInSource.size > 0) && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {missingInTarget.size + missingInSource.size} missing
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-800/50">
        {allIds.map(id => {
          const sb = sourceBuckets.find(b => b.id === id);
          const tb = targetBuckets.find(b => b.id === id);
          const bucket = sb || tb;
          const isMissingTarget = missingInTarget.has(id);
          const isMissingSource = missingInSource.has(id);

          return (
            <div key={id} className={`px-5 py-3 flex items-center justify-between ${isMissingTarget || isMissingSource ? 'bg-amber-500/[0.03]' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-mono text-gray-200">{bucket?.name || id}</div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                    {bucket?.public && <span>Public</span>}
                    {bucket?.file_size_limit && <span>{formatBytes(bucket.file_size_limit)} limit</span>}
                    {bucket?.allowed_mime_types && <span>{bucket.allowed_mime_types.length} MIME types</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500">Source:</span>
                  {sb ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-red-400">missing</span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500">Target:</span>
                  {tb ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-red-400">missing</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareBranchSwitcher({ branches, activeBranch, switching, onSwitch }: {
  branches: Branch[];
  activeBranch: Branch | null;
  switching: boolean;
  onSwitch: (branch: Branch) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const otherBranches = branches.filter(b => !b.active);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !switching && setOpen(!open)}
        disabled={switching}
        className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-xl text-sm transition-all min-w-[180px] disabled:opacity-60"
      >
        {switching ? (
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        )}
        <div className="flex-1 text-left">
          <div className="text-gray-200 font-medium truncate">
            {switching ? 'Switching...' : activeBranch?.name || 'No branch'}
          </div>
          {activeBranch?.source_branch && !switching && (
            <div className="text-[10px] text-gray-500">
              from <span className="text-teal-400/70 font-mono">{activeBranch.source_branch}</span>
            </div>
          )}
        </div>
        {otherBranches.length > 0 && !switching && (
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && otherBranches.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Switch source branch</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {otherBranches.map(branch => (
              <button
                key={branch.name}
                onClick={() => {
                  setOpen(false);
                  onSwitch(branch);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate">{branch.name}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-2">
                    <span>{branch.mode === 'full' ? 'Full' : 'App-only'}</span>
                    {branch.source_branch && (
                      <span>from <span className="font-mono text-teal-400/70">{branch.source_branch}</span></span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
