import { useEffect, useState } from 'react';
import { Columns3, Key, List } from 'lucide-react';
import { syncApi } from '../services';
import type { TableStatsResponse, TableSideStats, ColumnStats, IndexStats } from '../types/api';

export default function TableDetailPanel({ envName, schema, table }: {
  envName: string;
  schema: string;
  table: string;
}) {
  const [data, setData] = useState<TableStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    syncApi.getTableStats(envName, schema, table)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [envName, schema, table]);

  if (loading) {
    return (
      <div className="px-6 py-6 bg-gray-950 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Loading table details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-4 bg-gray-950 border-t border-gray-800">
        <div className="text-xs text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const sourceSide = data.tables.find(t => t.role === 'source');
  const targetSide = data.tables.find(t => t.role === 'target');

  return (
    <div className="bg-gray-950 border-t border-gray-800 px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          {schema}.{table}
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          {sourceSide && (
            <span>PK: <span className="font-mono text-gray-400">{sourceSide.primary_key.join(', ') || 'none'}</span></span>
          )}
          {sourceSide?.kind && (
            <span>Type: <span className="text-gray-400">{sourceSide.kind}</span></span>
          )}
        </div>
      </div>

      <ColumnsComparison source={sourceSide} target={targetSide} />
      <IndexesComparison source={sourceSide} target={targetSide} />
    </div>
  );
}

function ColumnsComparison({ source, target }: { source?: TableSideStats; target?: TableSideStats }) {
  const sourceColMap = new Map<string, ColumnStats>();
  source?.columns.forEach(c => sourceColMap.set(c.name, c));

  const targetColMap = new Map<string, ColumnStats>();
  target?.columns.forEach(c => targetColMap.set(c.name, c));

  const allNames = Array.from(new Set([
    ...(source?.columns.map(c => c.name) || []),
    ...(target?.columns.map(c => c.name) || []),
  ]));

  allNames.sort((a, b) => {
    const aPos = sourceColMap.get(a)?.ordinal_position ?? targetColMap.get(a)?.ordinal_position ?? 999;
    const bPos = sourceColMap.get(b)?.ordinal_position ?? targetColMap.get(b)?.ordinal_position ?? 999;
    return aPos - bPos;
  });

  const hasDiffs = allNames.some(name => {
    const sc = sourceColMap.get(name);
    const tc = targetColMap.get(name);
    if (!sc || !tc) return true;
    return sc.data_type !== tc.data_type || sc.type_name !== tc.type_name || sc.is_nullable !== tc.is_nullable || sc.default !== tc.default;
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <Columns3 className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-300">Columns ({allNames.length})</span>
        {hasDiffs && (
          <span className="ml-auto text-[10px] text-amber-400 font-medium">has differences</span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="border-b border-gray-800/60">
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Column</th>
              <th className="text-left px-3 py-1.5 text-teal-500/70 font-medium">Source Type</th>
              <th className="text-left px-3 py-1.5 text-sky-500/70 font-medium">Target Type</th>
              <th className="text-center px-3 py-1.5 text-teal-500/70 font-medium">Src Null</th>
              <th className="text-center px-3 py-1.5 text-sky-500/70 font-medium">Tgt Null</th>
              <th className="text-center px-3 py-1.5 text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/30">
            {allNames.map(name => {
              const sc = sourceColMap.get(name);
              const tc = targetColMap.get(name);
              const onlyInSource = sc && !tc;
              const onlyInTarget = !sc && tc;
              const typeMismatch = sc && tc && (sc.data_type !== tc.data_type || sc.type_name !== tc.type_name);
              const nullMismatch = sc && tc && sc.is_nullable !== tc.is_nullable;

              let status: 'match' | 'source-only' | 'target-only' | 'mismatch' = 'match';
              if (onlyInSource) status = 'source-only';
              else if (onlyInTarget) status = 'target-only';
              else if (typeMismatch || nullMismatch) status = 'mismatch';

              return (
                <tr key={name} className={status !== 'match' ? 'bg-amber-500/[0.04]' : ''}>
                  <td className="px-3 py-1.5 font-mono text-gray-200">{name}</td>
                  <td className={`px-3 py-1.5 font-mono ${typeMismatch ? 'text-amber-400' : 'text-gray-400'}`}>
                    {sc?.type_name || <span className="text-gray-600">--</span>}
                  </td>
                  <td className={`px-3 py-1.5 font-mono ${typeMismatch ? 'text-amber-400' : 'text-gray-400'}`}>
                    {tc?.type_name || <span className="text-gray-600">--</span>}
                  </td>
                  <td className={`px-3 py-1.5 text-center ${nullMismatch ? 'text-amber-400' : 'text-gray-500'}`}>
                    {sc ? (sc.is_nullable ? 'Y' : 'N') : <span className="text-gray-600">--</span>}
                  </td>
                  <td className={`px-3 py-1.5 text-center ${nullMismatch ? 'text-amber-400' : 'text-gray-500'}`}>
                    {tc ? (tc.is_nullable ? 'Y' : 'N') : <span className="text-gray-600">--</span>}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {status === 'source-only' && <span className="text-[9px] text-red-400 font-medium">src only</span>}
                    {status === 'target-only' && <span className="text-[9px] text-amber-400 font-medium">tgt only</span>}
                    {status === 'mismatch' && <span className="text-[9px] text-amber-400 font-medium">differs</span>}
                    {status === 'match' && <span className="text-[9px] text-emerald-500/50">ok</span>}
                  </td>
                </tr>
              );
            })}
            {allNames.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-500">No columns</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IndexesComparison({ source, target }: { source?: TableSideStats; target?: TableSideStats }) {
  const sourceIdxMap = new Map<string, IndexStats>();
  source?.indexes.forEach(i => sourceIdxMap.set(i.name, i));

  const targetIdxMap = new Map<string, IndexStats>();
  target?.indexes.forEach(i => targetIdxMap.set(i.name, i));

  const allNames = Array.from(new Set([...sourceIdxMap.keys(), ...targetIdxMap.keys()])).sort();

  const hasDiffs = allNames.some(name => {
    const si = sourceIdxMap.get(name);
    const ti = targetIdxMap.get(name);
    if (!si || !ti) return true;
    return si.definition !== ti.definition || si.is_unique !== ti.is_unique || si.is_primary !== ti.is_primary;
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <List className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-300">Indexes ({allNames.length})</span>
        {hasDiffs && (
          <span className="ml-auto text-[10px] text-amber-400 font-medium">has differences</span>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {allNames.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-gray-500">No indexes</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="border-b border-gray-800/60">
                <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Index</th>
                <th className="text-center px-3 py-1.5 text-teal-500/70 font-medium">Src Uniq</th>
                <th className="text-center px-3 py-1.5 text-sky-500/70 font-medium">Tgt Uniq</th>
                <th className="text-center px-3 py-1.5 text-gray-500 font-medium">PK</th>
                <th className="text-center px-3 py-1.5 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {allNames.map(name => {
                const si = sourceIdxMap.get(name);
                const ti = targetIdxMap.get(name);
                const onlyInSource = si && !ti;
                const onlyInTarget = !si && ti;
                const defMismatch = si && ti && si.definition !== ti.definition;

                let status: 'match' | 'source-only' | 'target-only' | 'mismatch' = 'match';
                if (onlyInSource) status = 'source-only';
                else if (onlyInTarget) status = 'target-only';
                else if (defMismatch) status = 'mismatch';

                return (
                  <tr key={name} className={status !== 'match' ? 'bg-amber-500/[0.04]' : ''}>
                    <td className="px-3 py-1.5 font-mono text-gray-300 max-w-[220px] truncate" title={si?.definition || ti?.definition}>{name}</td>
                    <td className="px-3 py-1.5 text-center text-gray-500">
                      {si ? (si.is_unique ? 'Y' : 'N') : <span className="text-gray-600">--</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center text-gray-500">
                      {ti ? (ti.is_unique ? 'Y' : 'N') : <span className="text-gray-600">--</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {(si?.is_primary || ti?.is_primary) && <Key className="w-3 h-3 text-amber-400 inline" />}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {status === 'source-only' && <span className="text-[9px] text-red-400 font-medium">src only</span>}
                      {status === 'target-only' && <span className="text-[9px] text-amber-400 font-medium">tgt only</span>}
                      {status === 'mismatch' && <span className="text-[9px] text-amber-400 font-medium">differs</span>}
                      {status === 'match' && <span className="text-[9px] text-emerald-500/50">ok</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
