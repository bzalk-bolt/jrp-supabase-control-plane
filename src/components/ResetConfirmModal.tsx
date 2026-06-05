import { useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  direction: 'source' | 'destination';
  sourceName: string;
  targetName: string;
  loading?: boolean;
}

export default function ResetConfirmModal({ isOpen, onClose, onConfirm, direction, sourceName, targetName, loading }: Props) {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  const overwrittenName = direction === 'destination' ? targetName : sourceName;
  const truthName = direction === 'destination' ? sourceName : targetName;
  const confirmPhrase = overwrittenName;
  const isConfirmed = confirmText === confirmPhrase;

  function handleClose() {
    setConfirmText('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-red-500/30 rounded-xl w-full max-w-lg shadow-2xl shadow-red-500/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-500/20 bg-red-500/5 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Reset {direction === 'destination' ? 'Destination' : 'Source'}
              </h3>
              <p className="text-xs text-red-300/70">Destructive action - cannot be undone</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Direction Diagram */}
          <div className="flex items-center gap-3 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <div className="flex-1 text-center">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-2 ${
                direction === 'destination'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <span className={`text-xs font-bold ${
                  direction === 'destination' ? 'text-emerald-400' : 'text-red-400'
                }`}>S</span>
              </div>
              <p className="text-xs text-gray-400 mb-0.5">Source</p>
              <p className="text-sm font-medium text-gray-200 truncate max-w-[140px] mx-auto" title={sourceName}>
                {sourceName}
              </p>
              {direction === 'destination' && (
                <span className="inline-block mt-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                  Source of truth
                </span>
              )}
              {direction === 'source' && (
                <span className="inline-block mt-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                  Will be overwritten
                </span>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              <ArrowRight className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] text-gray-500">copies to</span>
            </div>

            <div className="flex-1 text-center">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-2 ${
                direction === 'source'
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <span className={`text-xs font-bold ${
                  direction === 'source' ? 'text-emerald-400' : 'text-red-400'
                }`}>T</span>
              </div>
              <p className="text-xs text-gray-400 mb-0.5">Target</p>
              <p className="text-sm font-medium text-gray-200 truncate max-w-[140px] mx-auto" title={targetName}>
                {targetName}
              </p>
              {direction === 'source' && (
                <span className="inline-block mt-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                  Source of truth
                </span>
              )}
              {direction === 'destination' && (
                <span className="inline-block mt-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                  Will be overwritten
                </span>
              )}
            </div>
          </div>

          {/* Warning Text */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-red-200/90 leading-relaxed">
              All data in <span className="font-mono font-semibold text-red-300">{overwrittenName}</span> will be
              permanently replaced with data from <span className="font-mono font-semibold text-white">{truthName}</span>.
              This includes the database, edge functions, and all associated objects.
            </p>
          </div>

          {/* Confirm Input */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Type <span className="font-mono font-semibold text-white bg-gray-800 px-1.5 py-0.5 rounded">{confirmPhrase}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50 font-mono transition-all"
              autoFocus
              disabled={loading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 border border-red-600 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Resetting...
              </span>
            ) : (
              `Reset ${direction === 'destination' ? 'Destination' : 'Source'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
