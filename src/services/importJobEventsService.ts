import { supabase } from '../lib/supabase';
import type { ImportJobProgress, ImportPhase } from '../types/api';

export interface ImportJobEventRecord {
  id: string;
  user_id: string;
  plan_id: string;
  job_id: string;
  phase: ImportPhase | string | null;
  percent: number | null;
  message: string | null;
  status: string | null;
  details: Record<string, unknown> | null;
  output_tail: string | null;
  recorded_at_ms: number | null;
  created_at: string;
}

export interface ImportJobEventInsert {
  plan_id: string;
  job_id: string;
  phase?: ImportPhase | string | null;
  percent?: number | null;
  message?: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
  output_tail?: string | null;
  recorded_at_ms?: number | null;
}

export async function recordJobEvent(input: ImportJobEventInsert): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const row = {
    user_id: user.id,
    plan_id: input.plan_id,
    job_id: input.job_id,
    phase: input.phase ?? null,
    percent: input.percent ?? null,
    message: input.message ?? null,
    status: input.status ?? null,
    details: input.details ?? null,
    output_tail: input.output_tail ?? null,
    recorded_at_ms: input.recorded_at_ms ?? Date.now(),
  };

  const { error } = await supabase.from('import_job_events').insert(row);
  if (error) console.error('[importJobEvents] insert failed', error.message);
}

export async function listJobEvents(planId: string, jobId?: string): Promise<ImportJobEventRecord[]> {
  let query = supabase
    .from('import_job_events')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  if (jobId) query = query.eq('job_id', jobId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ImportJobEventRecord[];
}

export function eventsAreEquivalent(
  prev: ImportJobProgress | null | undefined,
  next: ImportJobProgress | null | undefined,
  prevStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): boolean {
  if (prevStatus !== nextStatus) return false;
  if (!prev || !next) return prev === next;
  if (prev.phase !== next.phase) return false;
  if (Math.round(prev.percent ?? 0) !== Math.round(next.percent ?? 0)) return false;
  if ((prev.message || '') !== (next.message || '')) return false;
  return true;
}
