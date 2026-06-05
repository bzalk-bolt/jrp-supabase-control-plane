import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Job, JobSummary } from '../types/api';

export interface JobHistoryRecord {
  id: string;
  user_id: string;
  kind: string;
  environment: string;
  status: string;
  command: string[] | null;
  exit_code: number | null;
  output: string;
  created_at_ms: number | null;
  started_at_ms: number | null;
  finished_at_ms: number | null;
  saved_at: string;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

export async function saveJob(job: Job): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('job_history').upsert({
    id: job.id,
    user_id: userId,
    kind: job.kind,
    environment: job.environment,
    status: job.status,
    command: job.command || null,
    exit_code: job.exit_code ?? null,
    output: job.output || '',
    created_at_ms: job.created_at_ms || null,
    started_at_ms: job.started_at_ms || null,
    finished_at_ms: job.finished_at_ms || null,
  }, { onConflict: 'id' });
}

export async function saveJobSummary(job: JobSummary): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('job_history').upsert({
    id: job.id,
    user_id: userId,
    kind: job.kind,
    environment: job.environment,
    status: job.status,
    command: job.command || null,
    exit_code: job.exit_code ?? null,
    output: '',
    created_at_ms: job.created_at_ms || null,
    started_at_ms: job.started_at_ms || null,
    finished_at_ms: job.finished_at_ms || null,
  }, { onConflict: 'id' });
}

export async function loadJobById(jobId: string): Promise<Job | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('job_history')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    kind: data.kind as Job['kind'],
    environment: data.environment,
    status: data.status as Job['status'],
    command: data.command || undefined,
    exit_code: data.exit_code,
    output: data.output || '',
    created_at_ms: data.created_at_ms,
    started_at_ms: data.started_at_ms,
    finished_at_ms: data.finished_at_ms,
  };
}

export async function loadJobHistory(): Promise<JobSummary[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('job_history')
    .select('id, kind, environment, status, command, exit_code, created_at_ms, started_at_ms, finished_at_ms')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    kind: row.kind as JobSummary['kind'],
    environment: row.environment,
    status: row.status as JobSummary['status'],
    command: row.command || undefined,
    exit_code: row.exit_code,
    created_at_ms: row.created_at_ms,
    started_at_ms: row.started_at_ms,
    finished_at_ms: row.finished_at_ms,
  }));
}

export async function mergeWithApiJobs(apiJobs: JobSummary[]): Promise<JobSummary[]> {
  const localJobs = await loadJobHistory();

  // Merge: API jobs take priority (fresher status), local fills in anything missing
  const merged = new Map<string, JobSummary>();
  for (const job of localJobs) {
    merged.set(job.id, job);
  }
  for (const job of apiJobs) {
    merged.set(job.id, job);
  }

  // Save any API jobs we haven't seen locally
  const localIds = new Set(localJobs.map(j => j.id));
  for (const job of apiJobs) {
    if (!localIds.has(job.id)) {
      saveJobSummary(job);
    } else {
      // Update status if changed
      const local = localJobs.find(j => j.id === job.id);
      if (local && local.status !== job.status) {
        saveJobSummary(job);
      }
    }
  }

  const result = Array.from(merged.values());
  result.sort((a, b) => (b.started_at_ms || b.created_at_ms || 0) - (a.started_at_ms || a.created_at_ms || 0));
  return result;
}

export function subscribeToJobChanges(
  onUpdate: (job: JobSummary) => void
): RealtimeChannel {
  const channel = supabase
    .channel('job_history_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'job_history' },
      (payload) => {
        const row = payload.new as JobHistoryRecord | undefined;
        if (!row) return;
        onUpdate({
          id: row.id,
          kind: row.kind as JobSummary['kind'],
          environment: row.environment,
          status: row.status as JobSummary['status'],
          command: row.command || undefined,
          exit_code: row.exit_code ?? undefined,
          created_at_ms: row.created_at_ms ?? undefined,
          started_at_ms: row.started_at_ms ?? undefined,
          finished_at_ms: row.finished_at_ms ?? undefined,
        });
      }
    )
    .subscribe();

  return channel;
}
