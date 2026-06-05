import { supabase } from '../lib/supabase';
import type { ImportJobProgress, ImportPlanRecord, ImportPlanRequest, ImportPlanResponse } from '../types/api';

export interface ImportPlanDraft {
  source_project_ref?: string | null;
  source_project_name?: string | null;
  source_organization_id?: string | null;
  source_organization_name?: string | null;
  target_type?: string;
  database_mode?: 'schema-only' | 'schema-and-data' | null;
  has_db_url?: boolean;
  options?: Record<string, unknown>;
  plan_request?: ImportPlanRequest | null;
  plan_response?: ImportPlanResponse | null;
  status?: ImportPlanRecord['status'];
  notes?: string | null;
  job_id?: string | null;
  last_status?: string | null;
  last_progress?: ImportJobProgress | null;
}

export async function listImportPlans(): Promise<ImportPlanRecord[]> {
  const { data, error } = await supabase
    .from('import_plans')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ImportPlanRecord[];
}

export async function getImportPlan(id: string): Promise<ImportPlanRecord | null> {
  const { data, error } = await supabase
    .from('import_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as ImportPlanRecord | null;
}

export async function createImportPlan(draft: ImportPlanDraft): Promise<ImportPlanRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const insertRow = {
    user_id: user.id,
    source_project_ref: draft.source_project_ref ?? null,
    source_project_name: draft.source_project_name ?? null,
    source_organization_id: draft.source_organization_id ?? null,
    source_organization_name: draft.source_organization_name ?? null,
    target_type: draft.target_type ?? 'local',
    database_mode: draft.database_mode ?? null,
    has_db_url: draft.has_db_url ?? false,
    options: draft.options ?? {},
    plan_request: draft.plan_request ?? null,
    plan_response: draft.plan_response ?? null,
    status: draft.status ?? 'draft',
    notes: draft.notes ?? null,
  };

  const { data, error } = await supabase
    .from('import_plans')
    .insert(insertRow)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create import plan');
  return data as ImportPlanRecord;
}

export async function updateImportPlan(id: string, draft: ImportPlanDraft): Promise<ImportPlanRecord> {
  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (draft.source_project_ref !== undefined) updateRow.source_project_ref = draft.source_project_ref;
  if (draft.source_project_name !== undefined) updateRow.source_project_name = draft.source_project_name;
  if (draft.source_organization_id !== undefined) updateRow.source_organization_id = draft.source_organization_id;
  if (draft.source_organization_name !== undefined) updateRow.source_organization_name = draft.source_organization_name;
  if (draft.target_type !== undefined) updateRow.target_type = draft.target_type;
  if (draft.database_mode !== undefined) updateRow.database_mode = draft.database_mode;
  if (draft.has_db_url !== undefined) updateRow.has_db_url = draft.has_db_url;
  if (draft.options !== undefined) updateRow.options = draft.options;
  if (draft.plan_request !== undefined) updateRow.plan_request = draft.plan_request;
  if (draft.plan_response !== undefined) updateRow.plan_response = draft.plan_response;
  if (draft.status !== undefined) updateRow.status = draft.status;
  if (draft.notes !== undefined) updateRow.notes = draft.notes;
  if (draft.job_id !== undefined) updateRow.job_id = draft.job_id;
  if (draft.last_status !== undefined) updateRow.last_status = draft.last_status;
  if (draft.last_progress !== undefined) updateRow.last_progress = draft.last_progress;

  const { data, error } = await supabase
    .from('import_plans')
    .update(updateRow)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Import plan not found');
  return data as ImportPlanRecord;
}

export async function deleteImportPlan(id: string): Promise<void> {
  const { error } = await supabase
    .from('import_plans')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
