import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ChevronRight, Clock, AlertCircle, Loader2, CheckCircle2, Play, RefreshCw } from 'lucide-react';
import { syncApi } from '../services';
import type { MigrationSummary, MigrationDetail } from '../types/api';
import SqlCodeBlock from './SqlCodeBlock';

interface MigrationsPanelProps {
  envName: string;
  localEnvironmentId?: string;
  compact?: boolean;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '\u2014';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

function StatusBadge({ status }: { status: MigrationSummary['status'] }) {
  const config = {
    promoted: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: CheckCircle2 },
    pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', icon: Clock },
    running: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: Play },
    failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: AlertCircle },
  };
  const c = config[status];
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text} border ${c.border}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

export default function MigrationsPanel({ envName, localEnvironmentId, compact = false }: MigrationsPanelProps) {
  const [migrations, setMigrations] = useState<MigrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [detail, setDetail] = useState<MigrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'sql' | 'statements'>('sql');

  const loadMigrations = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await syncApi.listMigrations(envName, localEnvironmentId);
      setMigrations(res.migrations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load migrations');
    } finally {
      setLoading(false);
    }
  }, [envName, localEnvironmentId]);

  useEffect(() => {
    loadMigrations();
  }, [loadMigrations]);

  async function handleExpand(version: string) {
    if (expandedVersion === version) {
      setExpandedVersion(null);
      setDetail(null);
      return;
    }
    setExpandedVersion(version);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await syncApi.getMigrationDetail(envName, version, localEnvironmentId);
      setDetail(res.migration);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : 'Failed to load migration detail');
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error && migrations.length === 0) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-red-400">{error}</span>
        <button
          onClick={loadMigrations}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 hover:text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  if (migrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-3">
          <ScrollText className="w-5 h-5 text-gray-500" />
        </div>
        <p className="text-sm text-gray-400">No migrations found for this environment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-px">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 mb-3">{error}</div>
      )}

      {migrations.map((m, idx) => {
        const isExpanded = expandedVersion === m.version;
        const isFirst = idx === 0;
        const isLast = idx === migrations.length - 1 && !isExpanded;

        return (
          <div key={m.version}>
            {/* Row */}
            <button
              onClick={() => handleExpand(m.version)}
              className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-all hover:bg-gray-800/70 border border-gray-800 ${
                isExpanded
                  ? 'bg-gray-800/80 border-b-0 rounded-t-xl'
                  : `bg-gray-900/40 ${isFirst ? 'rounded-t-xl' : ''} ${isLast ? 'rounded-b-xl' : ''}`
              }`}
            >
              {/* Chevron */}
              <ChevronRight
                className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              />

              {/* Name & version */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-100 truncate">
                    {m.name || `migration_${m.version}`}
                  </span>
                  {m.error_message && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                </div>
                <span className="text-[11px] font-mono text-gray-500">{m.version}</span>
              </div>

              {/* Meta pills */}
              <div className="flex items-center gap-3 shrink-0">
                {!compact && (
                  <span className="text-xs text-gray-500 tabular-nums text-right whitespace-nowrap">
                    {m.statement_count} <span className="text-gray-600">stmts</span>
                  </span>
                )}
                <StatusBadge status={m.status} />
                {!compact && (
                  <span className="text-xs text-gray-500 tabular-nums w-12 text-right">{formatDuration(m.duration_ms)}</span>
                )}
                <span className="text-xs text-gray-500 w-16 text-right">{formatRelativeTime(m.promoted_at)}</span>
              </div>
            </button>

            {/* Expanded detail - seamless continuation of the row */}
            {isExpanded && (
              <div className={`border border-gray-800 border-t-0 bg-gray-900/60 ${idx === migrations.length - 1 ? 'rounded-b-xl' : ''} overflow-hidden`}>
                {/* Info bar + view toggle */}
                <div className="px-5 py-3 flex items-center justify-between bg-gray-850/50 border-b border-gray-800/60">
                  <div className="flex items-center gap-5 text-xs text-gray-400">
                    <span>
                      <span className="text-gray-500">Source</span>{' '}
                      <span className="text-gray-200 font-mono">{m.source_environment}</span>
                    </span>
                    <span>
                      <span className="text-gray-500">Target</span>{' '}
                      <span className="text-gray-200 font-mono">{m.target_environment}</span>
                    </span>
                    {m.batch_label && (
                      <span>
                        <span className="text-gray-500">Batch</span>{' '}
                        <span className="text-gray-200">{m.batch_label}</span>
                      </span>
                    )}
                    {m.started_at && (
                      <span>
                        <span className="text-gray-500">Started</span>{' '}
                        <span className="text-gray-200">{formatRelativeTime(m.started_at)}</span>
                      </span>
                    )}
                  </div>
                  {detail && (
                    <div className="flex items-center bg-gray-800/80 rounded-lg p-0.5 border border-gray-700/50">
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewMode('sql'); }}
                        className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                          viewMode === 'sql'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Full SQL
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewMode('statements'); }}
                        className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                          viewMode === 'statements'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Statements ({m.statement_count})
                      </button>
                    </div>
                  )}
                </div>

                {/* Error message */}
                {m.error_message && (
                  <div className="mx-4 mt-3 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400 font-mono leading-relaxed">{m.error_message}</p>
                  </div>
                )}

                {/* SQL content */}
                <div className="p-4">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                    </div>
                  ) : detail ? (
                    viewMode === 'sql' ? (
                      <SqlCodeBlock code={detail.sql} maxHeight="500px" />
                    ) : (
                      <div className="space-y-3">
                        {detail.statements.map((stmt, i) => (
                          <div key={i}>
                            <div className="px-1 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                              Statement {i + 1}
                            </div>
                            <SqlCodeBlock code={stmt} maxHeight="300px" />
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
