/*
  # Create import_plans table

  Stores import plan drafts and results from the Supabase-to-Local import wizard.
  Lets users save partial wizard progress, resume later, and audit historical
  plans tied to their account.

  1. New Tables
    - `import_plans`
      - `id` (uuid, primary key)
      - `user_id` (uuid, fk auth.users)
      - `source_project_ref` (text, nullable)
      - `source_project_name` (text, nullable)
      - `source_organization_id` (text, nullable)
      - `source_organization_name` (text, nullable)
      - `target_type` (text, default 'local')
      - `database_mode` (text, nullable) — 'schema-only' | 'schema-and-data'
      - `has_db_url` (boolean, default false) — whether the user provided a DB URL
      - `options` (jsonb) — captured wizard option toggles
      - `plan_request` (jsonb, nullable) — last request body sent to /v1/imports/plan
      - `plan_response` (jsonb, nullable) — last response from /v1/imports/plan
      - `status` (text, default 'draft') — 'draft' | 'planned' | 'executing' | 'succeeded' | 'failed'
      - `notes` (text, nullable)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled.
    - Users can only access their own import plan rows (auth.uid() = user_id).

  3. Indexes
    - Index on user_id for listing.
    - Index on updated_at for ordering recent plans.
*/

CREATE TABLE IF NOT EXISTS import_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_project_ref text,
  source_project_name text,
  source_organization_id text,
  source_organization_name text,
  target_type text NOT NULL DEFAULT 'local',
  database_mode text,
  has_db_url boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_request jsonb,
  plan_response jsonb,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_plans_user_id_idx ON import_plans(user_id);
CREATE INDEX IF NOT EXISTS import_plans_updated_at_idx ON import_plans(updated_at DESC);

ALTER TABLE import_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own import plans"
  ON import_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own import plans"
  ON import_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own import plans"
  ON import_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own import plans"
  ON import_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
