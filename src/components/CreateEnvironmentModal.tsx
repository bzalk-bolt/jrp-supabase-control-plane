import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Download, ArrowRight } from 'lucide-react';
import { syncApi } from '../services';
import type { EnvironmentCreateRequest } from '../types/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateEnvironmentModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<EnvironmentCreateRequest>({
    name: '',
    source_env: 'dev',
    target_env: 'stage',
    source_container: 'supabase-db',
    target_db_url: '',
    sync_storage_buckets: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await syncApi.createEnvironment(form);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create environment');
    } finally {
      setSubmitting(false);
    }
  }

  function update(field: keyof EnvironmentCreateRequest, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">New Environment</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Link
            to="/import"
            onClick={onClose}
            className="group flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 rounded-lg transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-emerald-200">Importing from a hosted Supabase project?</div>
              <div className="text-xs text-emerald-300/70 mt-0.5">The Import wizard sets this up for you in a few guided steps.</div>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-300 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </Link>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g., hosted-staging"
              pattern="^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$"
              className="input-field"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Source Env">
              <input
                type="text"
                value={form.source_env || ''}
                onChange={e => update('source_env', e.target.value)}
                placeholder="dev"
                className="input-field"
              />
            </Field>
            <Field label="Target Env">
              <input
                type="text"
                value={form.target_env || ''}
                onChange={e => update('target_env', e.target.value)}
                placeholder="stage"
                className="input-field"
              />
            </Field>
          </div>
          <Field label="Source Container">
            <input
              type="text"
              value={form.source_container || ''}
              onChange={e => update('source_container', e.target.value)}
              placeholder="supabase-db"
              className="input-field"
            />
          </Field>
          <Field label="Target Database URL">
            <input
              type="text"
              value={form.target_db_url || ''}
              onChange={e => update('target_db_url', e.target.value)}
              placeholder="postgresql://..."
              className="input-field font-mono text-xs"
            />
          </Field>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="sync_storage"
              checked={form.sync_storage_buckets}
              onChange={e => update('sync_storage_buckets', e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-emerald-600 focus:ring-emerald-600/20"
            />
            <label htmlFor="sync_storage" className="text-sm text-gray-300">Sync storage buckets</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
            >
              {submitting ? 'Creating...' : 'Create Environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
