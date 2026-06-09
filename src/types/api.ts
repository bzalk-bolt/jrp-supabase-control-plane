export interface Environment {
  name: string;
  source_container?: string;
  source_db_url?: string;
  source_env: string;
  sync_storage_buckets?: boolean;
  target_container?: string;
  target_db_url?: string;
  target_env: string;
  protected?: boolean;
  [key: string]: unknown;
}

export interface EnvironmentCreateRequest {
  name: string;
  source_container?: string;
  source_db_name?: string;
  source_db_url?: string;
  source_env?: string;
  source_user?: string;
  source_project_name?: string;
  source_project_ref?: string;
  source_organization_name?: string;
  sync_storage_buckets?: boolean;
  target_container?: string;
  target_db_name?: string;
  target_db_url?: string;
  target_env?: string;
  target_user?: string;
  target_project_name?: string;
  target_project_ref?: string;
  target_organization_name?: string;
  batch_label?: string;
}

export interface EnvironmentProject {
  role: 'source' | 'target';
  name: string;
  organization_name: string;
  project_ref: string | null;
}

export interface EnvironmentIdentity {
  projects: EnvironmentProject[];
}

export interface JobSummary {
  id: string;
  kind: 'validate' | 'plan' | 'up' | 'branch_create' | 'branch_save' | 'branch_switch' | 'branch_reset' | 'branch_merge' | 'import_platform_to_local';
  environment: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  command?: string[];
  created_at_ms?: number;
  exit_code?: number | null;
  finished_at_ms?: number | null;
  started_at_ms?: number | null;
}

export type ImportPhase =
  | 'queued'
  | 'running'
  | 'planning'
  | 'planned'
  | 'dry_run'
  | 'database_import'
  | 'database_imported'
  | 'database_skipped'
  | 'edge_functions'
  | 'edge_functions_imported'
  | 'edge_functions_skipped'
  | 'finalizing'
  | 'succeeded'
  | 'failed';

export interface ImportProgressDatabaseSnapshot {
  available?: boolean;
  endpoint?: string;
  table_count?: number;
  estimated_total_table_bytes?: number;
  storage_bucket_count?: number;
  largest_tables?: Array<Record<string, unknown>>;
}

export interface ImportProgressDetails {
  database_mode?: 'schema-only' | 'schema-and-data';
  include_table_data?: boolean;
  include_edge_functions?: boolean;
  include_storage_objects?: boolean;
  source_database?: ImportProgressDatabaseSnapshot;
  target_database?: ImportProgressDatabaseSnapshot;
  progress_granularity?: string;
  table_progress_note?: string;
  [key: string]: unknown;
}

export interface ImportJobProgress {
  phase: ImportPhase | string;
  percent: number;
  message: string;
  updated_at_ms?: number;
  details?: ImportProgressDetails;
}

export interface Job extends JobSummary {
  output: string;
  progress?: ImportJobProgress;
}

export interface PlatformToLocalImportRequest {
  confirm?: string;
  dry_run?: boolean;
  database_mode: 'schema-only' | 'schema-and-data';
  include_storage_bucket_metadata?: boolean;
  include_storage_objects?: boolean;
  include_edge_functions?: boolean;
  include_auth_data?: boolean;
  source: ImportSide;
  target: ImportSide;
}

export interface PlatformToLocalImportResponse {
  job: Job;
}

export interface JobOptions {
  batch_label?: string;
  limit?: number;
  sync_storage_buckets?: boolean;
}

export interface ErrorResponse {
  error: string;
}

export interface ResetOptions {
  confirm: string;
  dry_run?: boolean;
  reset_database?: boolean;
  reset_edge_functions?: boolean;
  prune_edge_functions?: boolean;
}

export interface TableStats {
  name: string;
  schema: string;
  row_count: number;
  row_count_exact: boolean;
  total_bytes: number;
  column_count?: number;
}

export interface StorageBucketStats {
  id: string;
  name: string;
  public?: boolean | null;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DatabaseStats {
  role: 'source' | 'target';
  environment: string;
  database_name: string;
  table_count: number;
  tables: TableStats[];
  storage_bucket_count: number;
  storage_buckets: StorageBucketStats[];
}

export interface TableIdentity {
  schema: string;
  name: string;
}

export interface BucketIdentity {
  id: string;
  name: string;
}

export interface TableRowCountDifference {
  schema: string;
  name: string;
  source_row_count: number | null;
  target_row_count: number | null;
  delta: number | null;
}

export interface StatsComparison {
  table_count_delta: number;
  storage_bucket_count_delta: number;
  tables_missing_in_target: TableIdentity[];
  tables_missing_in_source: TableIdentity[];
  table_row_count_differences: TableRowCountDifference[];
  storage_buckets_missing_in_target: BucketIdentity[];
  storage_buckets_missing_in_source: BucketIdentity[];
}

export interface DatabaseStatsResponse {
  environment: string;
  generated_at_ms: number;
  exact_rows: boolean;
  databases: DatabaseStats[];
  comparison: StatsComparison;
}

export interface ColumnStats {
  ordinal_position: number;
  name: string;
  data_type: string;
  type_schema: string;
  type_name: string;
  is_nullable: boolean;
  default: string | null;
  is_identity: boolean;
  identity_generation: string | null;
  generated: string | null;
}

export interface IndexStats {
  name: string;
  definition: string;
  is_unique: boolean;
  is_primary: boolean;
  size_bytes: number;
}

export interface TableSideStats {
  role: 'source' | 'target';
  environment: string;
  database_name: string;
  schema: string;
  name: string;
  exists: boolean;
  kind: string | null;
  row_count: number | null;
  row_count_exact: boolean;
  column_count: number;
  total_bytes: number | null;
  table_bytes: number | null;
  index_bytes: number | null;
  toast_bytes: number | null;
  primary_key: string[];
  columns: ColumnStats[];
  indexes: IndexStats[];
}

export interface TableStatsResponse {
  environment: string;
  generated_at_ms: number;
  schema: string;
  table: string;
  exact_rows: boolean;
  tables: TableSideStats[];
}

// --- Edge Functions ---

export interface EdgeFunctionSourceFile {
  path: string;
  size_bytes: number;
  sha256: string;
  content?: string;
  content_base64?: string;
  encoding?: 'utf-8' | 'base64';
  modified_at_ms?: number;
  truncated?: boolean;
}

export interface EdgeFunction {
  id: string;
  slug: string;
  name: string;
  status?: string | null;
  version?: number | null;
  verify_jwt?: boolean | null;
  entrypoint_path?: string | null;
  import_map_path?: string | null;
  sha256?: string | null;
  ezbr_sha256?: string | null;
  total_bytes?: number | null;
  file_count?: number | null;
  files?: EdgeFunctionSourceFile[];
  created_at?: number | null;
  updated_at?: number | null;
  metadata?: Record<string, unknown>;
}

export interface EdgeFunctionIdentity {
  slug: string;
}

export interface EdgeFunctionSourceDifference {
  slug: string;
  source_sha256: string;
  target_sha256: string;
}

export interface EdgeFunctionsSide {
  role: 'source' | 'target';
  environment: string;
  available: boolean;
  function_count: number;
  functions: EdgeFunction[];
  source_kind?: string | null;
  error?: string;
}

export interface EdgeFunctionsComparison {
  function_count_delta: number | null;
  functions_missing_in_target: EdgeFunctionIdentity[];
  functions_missing_in_source: EdgeFunctionIdentity[];
  function_source_differences: EdgeFunctionSourceDifference[];
}

export interface EdgeFunctionsResponse {
  environment: string;
  generated_at_ms: number;
  edge_functions: EdgeFunctionsSide[];
  comparison: EdgeFunctionsComparison;
}

export interface EdgeFunctionDetailSide {
  role: 'source' | 'target';
  environment: string;
  available: boolean;
  function: EdgeFunction | null;
  source_kind?: string | null;
  error?: string;
}

export interface EdgeFunctionDetailComparison {
  source_sha256: string;
  target_sha256: string;
  source_matches_target: boolean;
}

export interface EdgeFunctionDetailResponse {
  environment: string;
  generated_at_ms: number;
  edge_function: string;
  include_source: boolean;
  sources: EdgeFunctionDetailSide[];
  comparison?: EdgeFunctionDetailComparison;
}

// --- Database Functions ---

export interface DatabaseFunction {
  schema: string;
  name: string;
  identity_arguments: string;
  arguments: string;
  returns: string;
  language: string;
  kind: string;
  volatility: string;
  security_definer: boolean;
  strict: boolean;
  leakproof: boolean;
  parallel_safety: string;
  cost: number;
  rows: number;
  owner: string;
  comment: string | null;
  definition: string;
  definition_sha256: string;
}

export interface DatabaseFunctionIdentity {
  schema: string;
  name: string;
  identity_arguments: string;
}

export interface DatabaseFunctionsSide {
  role: 'source' | 'target';
  environment: string;
  database_name: string;
  function_count: number;
  functions: DatabaseFunction[];
}

export interface DatabaseFunctionsComparison {
  function_count_delta: number;
  functions_missing_in_target: DatabaseFunctionIdentity[];
  functions_missing_in_source: DatabaseFunctionIdentity[];
  function_definition_differences: DatabaseFunctionIdentity[];
}

export interface DatabaseFunctionsResponse {
  environment: string;
  generated_at_ms: number;
  databases: DatabaseFunctionsSide[];
  comparison: DatabaseFunctionsComparison;
}

// --- Database Triggers ---

export interface TableTrigger {
  schema: string;
  table: string;
  name: string;
  is_internal: boolean;
  enabled_mode: string;
  timing: string;
  events: string[];
  orientation: string;
  function_schema: string;
  function_name: string;
  function_identity_arguments: string;
  when_condition: string | null;
  comment: string | null;
  definition: string;
  definition_sha256: string;
}

export interface TableTriggerIdentity {
  schema: string;
  table: string;
  name: string;
}

export interface EventTrigger {
  name: string;
  event: string;
  enabled_mode: string;
  tags: string[] | null;
  function_schema: string;
  function_name: string;
  function_identity_arguments: string;
  comment: string | null;
  definition: string;
  definition_sha256: string;
}

export interface EventTriggerIdentity {
  name: string;
}

export interface DatabaseTriggersSide {
  role: 'source' | 'target';
  environment: string;
  database_name: string;
  table_trigger_count: number;
  table_triggers: TableTrigger[];
  event_trigger_count: number;
  event_triggers: EventTrigger[];
}

export interface DatabaseTriggersComparison {
  table_trigger_count_delta: number;
  event_trigger_count_delta: number;
  table_triggers_missing_in_target: TableTriggerIdentity[];
  table_triggers_missing_in_source: TableTriggerIdentity[];
  table_trigger_definition_differences: TableTriggerIdentity[];
  event_triggers_missing_in_target: EventTriggerIdentity[];
  event_triggers_missing_in_source: EventTriggerIdentity[];
  event_trigger_definition_differences: EventTriggerIdentity[];
}

export interface DatabaseTriggersResponse {
  environment: string;
  generated_at_ms: number;
  include_internal: boolean;
  databases: DatabaseTriggersSide[];
  comparison: DatabaseTriggersComparison;
}

// --- Branching ---

export interface Branch {
  name: string;
  mode: 'full' | 'app-only';
  created_at: string;
  updated_at: string;
  active: boolean;
  includes_database: boolean;
  includes_storage_files: boolean;
  schemas: string[];
  excluded_schemas?: string[];
  source_branch?: string;
  notes: string;
  dump_file: string;
  dump_size_bytes: number | null;
  storage_size_bytes: number | null;
}

export interface BranchesResponse {
  active_branch: string;
  branches: Branch[];
}

export interface ActiveBranchResponse {
  active_branch: string;
  branch: Branch | null;
}

export interface BranchCreateRequest {
  name: string;
  mode: 'full' | 'app-only';
  include_storage_files?: boolean;
  schemas?: string[];
  notes?: string;
  overwrite?: boolean;
  no_owner?: boolean;
  no_privileges?: boolean;
}

export interface BranchSaveRequest {
  include_storage_files?: boolean;
  schemas?: string[];
  notes?: string;
  no_owner?: boolean;
  no_privileges?: boolean;
}

export interface BranchSwitchRequest {
  autosave?: boolean;
}

export interface BranchResetRequest {
  from: string;
}

export interface BranchMergeRequest {
  target_branch?: string;
  autosave?: boolean;
  activate?: boolean;
}

export interface BranchSchema {
  name: string;
  owner: string;
  table_count: number;
  total_bytes: number;
  selectable_for_app_only: boolean;
  excluded_from_app_only: boolean;
}

export interface BranchSchemasResponse {
  generated_at_ms: number;
  database: {
    role: string;
    environment: string;
    database_name: string;
    default_app_schemas: string[];
    app_only_excluded_schemas: string[];
    schemas: BranchSchema[];
  };
}

// --- Migrations ---

export interface MigrationSummary {
  version: string;
  name: string | null;
  statement_count: number;
  status: 'pending' | 'promoted' | 'failed' | 'running';
  source_environment: string;
  target_environment: string;
  batch_id: string | null;
  batch_label: string | null;
  started_at: string | null;
  promoted_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface MigrationDetail extends MigrationSummary {
  statements: string[];
  sql: string;
}

export interface MigrationsListResponse {
  environment: string;
  source_environment: string;
  target_environment: string;
  generated_at_ms: number;
  migrations: MigrationSummary[];
}

export interface MigrationDetailResponse {
  environment: string;
  migration: MigrationDetail;
}

// --- Supabase Import / Clone ---

export interface SupabaseOrganization {
  id: string;
  name: string;
  slug?: string;
  [key: string]: unknown;
}

export interface SupabaseOrganizationsResponse {
  generated_at_ms: number;
  organizations: SupabaseOrganization[];
}

export interface SupabaseProject {
  id: string;
  ref: string;
  name: string;
  region?: string;
  organization_id?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface SupabaseProjectsResponse {
  generated_at_ms: number;
  projects: SupabaseProject[];
}

export interface SupabaseProjectDetailResponse {
  generated_at_ms: number;
  project: SupabaseProject;
}

export interface SupabaseBackup {
  id: string;
  status: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface SupabaseBackupsResponse {
  generated_at_ms: number;
  project_ref: string;
  backups: SupabaseBackup[];
}

export interface ImportSide {
  type: 'platform' | 'local';
  env?: string;
  project_ref?: string;
  project_id?: string;
  db_url?: string;
  container?: string;
  user?: string;
  reset_user?: string;
  db_name?: string;
  access_token?: string;
  api_base?: string;
  functions_api_base?: string;
}

export interface ImportPlanRequest {
  database_mode: 'schema-only' | 'schema-and-data';
  include_storage_bucket_metadata?: boolean;
  include_storage_objects?: boolean;
  include_edge_functions?: boolean;
  include_auth_data?: boolean;
  exact_rows?: boolean;
  include_columns?: boolean;
  largest_table_limit?: number;
  access_token?: string;
  source: ImportSide;
  target?: ImportSide;
}

export interface ImportPlanWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  [key: string]: unknown;
}

export interface ImportPlanFeasibility {
  can_plan_import: boolean;
  can_run_platform_to_local_now: boolean;
  schema_only_supported: boolean;
  schema_and_data_supported: boolean;
  requires_storage_object_copy: boolean;
  requires_supabase_cli_dump: boolean;
  requires_tool_database: boolean;
  [key: string]: unknown;
}

export interface ImportPlanDatabaseOverview {
  available?: boolean;
  endpoint?: string;
  overview?: {
    database_name?: string;
    server_version?: string;
    server_version_num?: number;
    database_size_bytes?: number;
    extensions?: string[];
    has_storage_buckets?: boolean;
    has_supabase_migrations?: boolean;
  };
  table_count?: number;
  estimated_total_table_bytes?: number;
  largest_tables?: Array<Record<string, unknown>>;
  storage_bucket_count?: number;
  storage_buckets?: Array<Record<string, unknown>>;
  error?: string;
}

export interface ImportPlanSideResult {
  side: Record<string, unknown>;
  project: Record<string, unknown>;
  database: ImportPlanDatabaseOverview;
}

export interface ImportPlanResponse {
  generated_at_ms: number;
  kind: string;
  control_plane: Record<string, unknown>;
  options: Record<string, unknown>;
  source: ImportPlanSideResult;
  target: ImportPlanSideResult;
  warnings: ImportPlanWarning[];
  feasibility: ImportPlanFeasibility;
  next_recommended_endpoint?: string;
}

export interface ImportPlanRecord {
  id: string;
  user_id: string;
  source_project_ref: string | null;
  source_project_name: string | null;
  source_organization_id: string | null;
  source_organization_name: string | null;
  target_type: string;
  database_mode: 'schema-only' | 'schema-and-data' | null;
  has_db_url: boolean;
  options: Record<string, unknown>;
  plan_request: ImportPlanRequest | null;
  plan_response: ImportPlanResponse | null;
  status: 'draft' | 'planned' | 'executing' | 'succeeded' | 'failed';
  notes: string | null;
  created_at: string;
  updated_at: string;
  job_id: string | null;
  last_status: string | null;
  last_progress: ImportJobProgress | null;
}

// --- Local Environments (VPS-backed) ---

export type VpsStatus =
  | 'pending'
  | 'awaiting_dns'
  | 'provisioning'
  | 'installing'
  | 'initial'
  | 'configuring_dns'
  | 'configuring_netlify'
  | 'ready'
  | 'failed'
  | 'destroyed';

export type ConnectionMode = 'clone' | 'local_first' | null;

export interface LocalEnvironment {
  id: string;
  user_id: string;
  name: string;
  apex_domain: string;
  subdomain: string;
  full_hostname: string;
  dns_verification_token: string;
  dns_verified_at: string | null;
  vps_provider: string;
  vps_id: string;
  vps_ip: string;
  vps_status: VpsStatus;
  sync_api_url: string;
  sync_api_token: string;
  netlify_site_id: string;
  netlify_url: string;
  notes: string;
  post_install_script_url: string | null;
  post_install_status: string | null;
  dns_a_record_verified_at: string | null;
  last_health_check_at: string | null;
  health_check_results: Record<string, unknown> | null;
  connection_mode: ConnectionMode;
  created_at: string;
  updated_at: string;
}

export type DomainVerificationStatus = 'pending' | 'verified' | 'expired' | 'failed';

export interface DomainVerification {
  id: string;
  user_id: string;
  apex_domain: string;
  token: string;
  status: DomainVerificationStatus;
  last_checked_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface LocalEnvironmentBinding {
  id: string;
  user_id: string;
  local_environment_id: string;
  remote_project_ref: string;
  remote_organization_id: string;
  remote_organization_name: string;
  database_mode: string;
  bound_at: string;
}

export interface ProvisioningJob {
  id: string;
  user_id: string;
  local_environment_id: string;
  phase: string;
  percent: number;
  message: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  details: Record<string, unknown>;
  recorded_at_ms: number | null;
  created_at: string;
}
