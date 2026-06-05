import { useEffect, useState } from 'react';
import { ArrowLeft, FileCode, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { syncApi } from '../services';
import type {
  EdgeFunctionDetailResponse,
  EdgeFunctionDetailSide,
  EdgeFunctionSourceFile,
  DatabaseFunction,
} from '../types/api';

interface EdgeFunctionSourceModalProps {
  type: 'edge-function';
  envName: string;
  slug: string;
  sourceLabel?: string;
  targetLabel?: string;
  onClose: () => void;
}

interface DbFunctionSourceModalProps {
  type: 'db-function';
  envName: string;
  fnKey: string;
  sourceFn?: DatabaseFunction;
  targetFn?: DatabaseFunction;
  sourceLabel?: string;
  targetLabel?: string;
  onClose: () => void;
}

type SourceComparisonModalProps = EdgeFunctionSourceModalProps | DbFunctionSourceModalProps;

export default function SourceComparisonModal(props: SourceComparisonModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-hidden">
      {props.type === 'edge-function' ? (
        <EdgeFunctionContent envName={props.envName} slug={props.slug} sourceLabel={props.sourceLabel} targetLabel={props.targetLabel} onClose={props.onClose} />
      ) : (
        <DbFunctionContent
          envName={props.envName}
          fnKey={props.fnKey}
          sourceFn={props.sourceFn}
          targetFn={props.targetFn}
          sourceLabel={props.sourceLabel}
          targetLabel={props.targetLabel}
          onClose={props.onClose}
        />
      )}
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <div className="h-5 w-px bg-gray-800" />
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-white font-mono truncate">{title}</h1>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <button
        onClick={onClose}
        className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function EdgeFunctionContent({ envName, slug, sourceLabel, targetLabel, onClose }: { envName: string; slug: string; sourceLabel?: string; targetLabel?: string; onClose: () => void }) {
  const [data, setData] = useState<EdgeFunctionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    syncApi.getEdgeFunctionSource(envName, slug)
      .then(d => {
        setData(d);
        const paths = getAllFilePaths(d.sources);
        if (paths.length > 0) setActiveFile(paths[0]);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [envName, slug]);

  if (loading) {
    return (
      <>
        <ModalHeader title={slug} subtitle="Edge function source comparison" onClose={onClose} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <ModalHeader title={slug} subtitle="Edge function source comparison" onClose={onClose} />
        <div className="flex-1 p-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
        </div>
      </>
    );
  }

  if (!data) return null;

  const comparison = data.comparison;
  const sourceSide = data.sources.find(s => s.role === 'source');
  const targetSide = data.sources.find(s => s.role === 'target');
  const sourceFiles = sourceSide?.function?.files || [];
  const targetFiles = targetSide?.function?.files || [];
  const sourceFileMap = new Map(sourceFiles.map(f => [f.path, f]));
  const targetFileMap = new Map(targetFiles.map(f => [f.path, f]));
  const allPaths = getAllFilePaths(data.sources);

  const activeSourceFile = activeFile ? sourceFileMap.get(activeFile) : undefined;
  const activeTargetFile = activeFile ? targetFileMap.get(activeFile) : undefined;

  return (
    <>
      <ModalHeader title={slug} subtitle="Edge function source comparison" onClose={onClose} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {comparison?.source_matches_target && (
          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            Source and target files match completely
            {comparison.source_sha256 && (
              <span className="text-xs text-emerald-500/60 font-mono ml-2">SHA: {comparison.source_sha256.slice(0, 20)}</span>
            )}
          </div>
        )}

        {(!sourceSide?.available || !targetSide?.available) && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            {!sourceSide?.available && !targetSide?.available
              ? 'Both source and target are unavailable'
              : !sourceSide?.available
                ? `Source unavailable${sourceSide?.error ? `: ${sourceSide.error}` : ''}`
                : `Target unavailable${targetSide?.error ? `: ${targetSide.error}` : ''}`
            }
          </div>
        )}

        {allPaths.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-10 text-center">
            <FileCode className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No source files available for this function.</p>
          </div>
        ) : (
          <>
            <FileTabs
              paths={allPaths}
              activeFile={activeFile}
              onSelect={setActiveFile}
              sourceFileMap={sourceFileMap}
              targetFileMap={targetFileMap}
            />

            {activeFile && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[500px]">
                <FileSourcePanel
                  label={sourceLabel || 'Source'}
                  environment={sourceSide?.environment || 'source'}
                  file={activeSourceFile}
                  color="teal"
                />
                <FileSourcePanel
                  label={targetLabel || 'Target'}
                  environment={targetSide?.environment || 'target'}
                  file={activeTargetFile}
                  color="sky"
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DbFunctionContent({ envName, fnKey, sourceFn, targetFn, sourceLabel, targetLabel, onClose }: {
  envName: string;
  fnKey: string;
  sourceFn?: DatabaseFunction;
  targetFn?: DatabaseFunction;
  sourceLabel?: string;
  targetLabel?: string;
  onClose: () => void;
}) {
  return (
    <>
      <ModalHeader title={fnKey} subtitle={`Database function source comparison - ${envName}`} onClose={onClose} />
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-[500px]">
          <DbDefinitionPanel label={sourceLabel || 'Source'} fn={sourceFn} color="teal" />
          <DbDefinitionPanel label={targetLabel || 'Target'} fn={targetFn} color="sky" />
        </div>
      </div>
    </>
  );
}

function DbDefinitionPanel({ label, fn, color }: {
  label: string;
  fn?: DatabaseFunction;
  color: 'teal' | 'sky';
}) {
  const bgClass = color === 'teal' ? 'bg-teal-500/5' : 'bg-sky-500/5';
  const textClass = color === 'teal' ? 'text-teal-400' : 'text-sky-400';

  if (!fn) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col">
        <div className={`flex items-center px-4 py-2.5 border-b border-gray-800 ${bgClass}`}>
          <span className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}>{label}</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-gray-500 italic">Function not present in {label.toLowerCase()}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-800 ${bgClass}`}>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}>{label}</span>
          <span className="text-[10px] text-gray-500 font-mono">{fn.language}</span>
          <span className="text-[10px] text-gray-600">{fn.volatility}</span>
          {fn.security_definer && <span className="text-[10px] text-amber-400 font-medium">SECURITY DEFINER</span>}
        </div>
        <span className="text-[10px] font-mono text-gray-600" title={`SHA-256: ${fn.definition_sha256}`}>
          {fn.definition_sha256.slice(0, 16)}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="text-[12px] font-mono text-gray-300 p-4 leading-relaxed whitespace-pre overflow-x-auto">
          {fn.definition.split('\n').map((line, i) => (
            <div key={i} className="flex hover:bg-gray-800/30">
              <span className="select-none text-gray-700 text-right pr-4 w-10 shrink-0">{i + 1}</span>
              <span className="flex-1">{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function FileTabs({ paths, activeFile, onSelect, sourceFileMap, targetFileMap }: {
  paths: string[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  sourceFileMap: Map<string, EdgeFunctionSourceFile>;
  targetFileMap: Map<string, EdgeFunctionSourceFile>;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap bg-gray-900 border border-gray-800 rounded-lg p-2">
      {paths.map(path => {
        const sf = sourceFileMap.get(path);
        const tf = targetFileMap.get(path);
        const matches = sf && tf && sf.sha256 === tf.sha256;
        const missing = !sf || !tf;

        return (
          <button
            key={path}
            onClick={() => onSelect(path)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-md transition-all ${
              activeFile === path
                ? 'bg-gray-800 text-white border border-gray-700'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 shrink-0" />
            <span>{path}</span>
            {matches && <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />}
            {!matches && !missing && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
            {missing && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function FileSourcePanel({ label, environment, file, color }: {
  label: string;
  environment: string;
  file?: EdgeFunctionSourceFile;
  color: 'teal' | 'sky';
}) {
  const bgClass = color === 'teal' ? 'bg-teal-500/5' : 'bg-sky-500/5';
  const textClass = color === 'teal' ? 'text-teal-400' : 'text-sky-400';

  if (!file) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col">
        <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-800 ${bgClass}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}>{label}</span>
            <span className="text-[10px] text-gray-600 font-mono">{environment}</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-gray-500 italic">File not present in {label.toLowerCase()}</p>
        </div>
      </div>
    );
  }

  const content = getFileContent(file);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-800 ${bgClass}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}>{label}</span>
          <span className="text-[10px] text-gray-600 font-mono">{environment}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>{formatBytes(file.size_bytes)}</span>
          <span className="font-mono" title={`SHA-256: ${file.sha256}`}>{file.sha256.slice(0, 16)}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="text-[12px] font-mono text-gray-300 p-4 leading-relaxed whitespace-pre overflow-x-auto">
          {content.split('\n').map((line, i) => (
            <div key={i} className="flex hover:bg-gray-800/30">
              <span className="select-none text-gray-700 text-right pr-4 w-10 shrink-0">{i + 1}</span>
              <span className="flex-1">{line}</span>
            </div>
          ))}
        </pre>
        {file.truncated && (
          <div className="px-4 py-2 text-xs text-amber-400/70 border-t border-gray-800 bg-gray-900">
            File was truncated
          </div>
        )}
      </div>
    </div>
  );
}

function getAllFilePaths(sources: EdgeFunctionDetailSide[]): string[] {
  const paths = new Set<string>();
  for (const side of sources) {
    if (side.function?.files) {
      for (const f of side.function.files) {
        paths.add(f.path);
      }
    }
  }
  return Array.from(paths).sort();
}

function getFileContent(file: EdgeFunctionSourceFile): string {
  if (file.content) return file.content;
  if (file.content_base64) {
    try {
      return atob(file.content_base64);
    } catch {
      return '[base64 decode error]';
    }
  }
  return '[no content]';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
