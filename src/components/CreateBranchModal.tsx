import { useState, useEffect } from 'react';
import { X, GitBranch, Loader2, Check } from 'lucide-react';
import { syncApi } from '../services';
import type { BranchCreateRequest, BranchSchema } from '../types/api';

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateBranchModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<BranchCreateRequest>({
    name: '',
    mode: 'app-only',
    include_storage_files: false,
    schemas: [],
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showOverwrite, setShowOverwrite] = useState(false);

  // Schema picker state
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [availableSchemas, setAvailableSchemas] = useState<BranchSchema[]>([]);
  const [defaultSchemas, setDefaultSchemas] = useState<string[]>(['public']);

  useEffect(() => {
    loadSchemas();
  }, []);

  async function loadSchemas() {
    try {
      setSchemasLoading(true);
      const data = await syncApi.getBranchSchemas();
      setAvailableSchemas(data.database.schemas);
      setDefaultSchemas(data.database.default_app_schemas);
      setForm(prev => ({ ...prev, schemas: data.database.default_app_schemas }));
    } catch {
      // Fall back to just "public" if the endpoint is unavailable
      setDefaultSchemas(['public']);
      setForm(prev => ({ ...prev, schemas: ['public'] }));
    } finally {
      setSchemasLoading(false);
    }
  }

  function validateName(name: string): string | null {
    if (!name.trim()) return 'Branch name is required';
    if (!NAME_PATTERN.test(name)) {
      return 'Must start with a letter or number, only letters, numbers, hyphens, and underscores allowed (max 63 chars)';
    }
    return null;
  }

  function toggleSchema(name: string) {
    setForm(prev => {
      const current = prev.schemas || [];
      const next = current.includes(name)
        ? current.filter(s => s !== name)
        : [...current, name];
      return { ...prev, schemas: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameError = validateName(form.name);
    if (nameError) {
      setError(nameError);
      return;
    }

    if (form.mode === 'app-only' && (!form.schemas || form.schemas.length === 0)) {
      setError('Select at least one schema for app-only mode');
      return;
    }

    const payload: BranchCreateRequest = {
      ...form,
      schemas: form.mode === 'app-only' ? form.schemas : undefined,
    };

    try {
      setSubmitting(true);
      setError('');
      const job = await syncApi.createBranch(payload);
      const result = await syncApi.pollJob(job.id);
      if (result.status === 'failed') {
        throw new Error(result.output || 'Branch creation failed');
      }
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create branch';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('conflict')) {
        setShowOverwrite(true);
        setError('A branch with this name already exists. Enable overwrite to replace it.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleModeChange(mode: 'full' | 'app-only') {
    setForm(prev => ({
      ...prev,
      mode,
      include_storage_files: mode === 'full',
      schemas: mode === 'app-only' ? defaultSchemas : [],
    }));
  }

  const selectableSchemas = availableSchemas.filter(s => s.selectable_for_app_only);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Create Branch</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Branch Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="feature-checkout-redesign"
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Mode</label>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => handleModeChange('app-only')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  form.mode === 'app-only'
                    ? 'bg-emerald-600/15 text-emerald-400 border-r border-emerald-600/30'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200 border-r border-gray-700'
                }`}
              >
                App Only
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('full')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  form.mode === 'full'
                    ? 'bg-emerald-600/15 text-emerald-400'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                Full
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {form.mode === 'app-only'
                ? 'Snapshots selected application schemas only. Faster for feature work.'
                : 'Full database dump including all platform schemas and storage.'}
            </p>
          </div>

          {form.mode === 'app-only' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Schemas</label>
              {schemasLoading ? (
                <div className="flex items-center gap-2 px-3.5 py-3 bg-gray-800 border border-gray-700 rounded-lg">
                  <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                  <span className="text-sm text-gray-500">Loading schemas...</span>
                </div>
              ) : selectableSchemas.length === 0 ? (
                <div className="px-3.5 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-500">
                  No selectable schemas found. The "public" schema will be used by default.
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {selectableSchemas.map(schema => {
                    const selected = (form.schemas || []).includes(schema.name);
                    return (
                      <button
                        key={schema.name}
                        type="button"
                        onClick={() => toggleSchema(schema.name)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors border-b border-gray-700/50 last:border-b-0 ${
                          selected ? 'bg-emerald-600/10' : 'hover:bg-gray-750 hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          selected
                            ? 'bg-emerald-600 border-emerald-600'
                            : 'border-gray-600 bg-gray-900'
                        }`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono text-gray-200">{schema.name}</span>
                        </div>
                        <div className="text-xs text-gray-500 flex-shrink-0">
                          {schema.table_count} table{schema.table_count !== 1 ? 's' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {(form.schemas || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(form.schemas || []).map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600/10 border border-emerald-600/20 rounded text-xs font-mono text-emerald-400">
                      {s}
                      <button type="button" onClick={() => toggleSchema(s)} className="hover:text-emerald-200">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Include Storage Files</label>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, include_storage_files: !prev.include_storage_files }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.include_storage_files ? 'bg-emerald-600' : 'bg-gray-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.include_storage_files ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Before checkout table changes..."
              rows={2}
              className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/20 transition-all resize-none"
            />
          </div>

          {showOverwrite && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.overwrite || false}
                onChange={e => setForm(prev => ({ ...prev, overwrite: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-600/20"
              />
              <span className="text-sm text-amber-400">Overwrite existing branch snapshot</span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 border border-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Branch'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
