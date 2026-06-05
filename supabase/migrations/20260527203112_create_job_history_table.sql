/*
  # Create job_history table

  1. New Tables
    - `job_history`
      - `id` (text, primary key) - the job ID from the external sync API
      - `user_id` (uuid, references auth.users) - the user who triggered the job
      - `kind` (text) - validate, plan, or up
      - `environment` (text) - environment name
      - `status` (text) - queued, running, succeeded, failed
      - `command` (text[]) - command array
      - `exit_code` (integer, nullable) - process exit code
      - `output` (text) - job output text
      - `created_at_ms` (bigint, nullable) - epoch ms when created
      - `started_at_ms` (bigint, nullable) - epoch ms when started
      - `finished_at_ms` (bigint, nullable) - epoch ms when finished
      - `saved_at` (timestamptz) - when the record was saved locally

  2. Security
    - Enable RLS on `job_history` table
    - Add policies for authenticated users to manage their own job history
*/

CREATE TABLE IF NOT EXISTS job_history (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL,
  environment text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  command text[],
  exit_code integer,
  output text DEFAULT '',
  created_at_ms bigint,
  started_at_ms bigint,
  finished_at_ms bigint,
  saved_at timestamptz DEFAULT now()
);

ALTER TABLE job_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own job history"
  ON job_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job history"
  ON job_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job history"
  ON job_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own job history"
  ON job_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_job_history_user_id ON job_history(user_id);
CREATE INDEX IF NOT EXISTS idx_job_history_environment ON job_history(environment);
CREATE INDEX IF NOT EXISTS idx_job_history_saved_at ON job_history(saved_at DESC);
