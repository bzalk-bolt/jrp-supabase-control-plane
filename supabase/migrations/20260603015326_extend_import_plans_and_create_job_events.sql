/*
  # Extend import plans and add durable job event log

  1. Modified Tables
    - `import_plans`
      - `job_id` (text, nullable) — sync-api job id for the most recent execute
      - `last_status` (text, nullable) — most recent observed job status
      - `last_progress` (jsonb, nullable) — most recent progress snapshot

  2. New Tables
    - `import_job_events`
      - `id` (uuid, primary key)
      - `user_id` (uuid, fk -> auth.users)
      - `plan_id` (uuid, fk -> import_plans)
      - `job_id` (text)
      - `phase` (text, nullable)
      - `percent` (numeric, nullable)
      - `message` (text, nullable)
      - `status` (text, nullable)
      - `details` (jsonb, nullable)
      - `output_tail` (text, nullable)
      - `recorded_at_ms` (bigint, nullable)
      - `created_at` (timestamptz, default now())

  3. Security
    - RLS enabled on `import_job_events`
    - Owner-only select/insert/update/delete policies (no FOR ALL)
    - `import_plans` already RLS-protected
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_plans' AND column_name = 'job_id'
  ) THEN
    ALTER TABLE import_plans ADD COLUMN job_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_plans' AND column_name = 'last_status'
  ) THEN
    ALTER TABLE import_plans ADD COLUMN last_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_plans' AND column_name = 'last_progress'
  ) THEN
    ALTER TABLE import_plans ADD COLUMN last_progress jsonb;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS import_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES import_plans(id) ON DELETE CASCADE,
  job_id text NOT NULL,
  phase text,
  percent numeric,
  message text,
  status text,
  details jsonb,
  output_tail text,
  recorded_at_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_job_events_plan_id_idx
  ON import_job_events (plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_job_events_job_id_idx
  ON import_job_events (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_job_events_user_id_idx
  ON import_job_events (user_id, created_at DESC);

ALTER TABLE import_job_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'import_job_events'
      AND policyname = 'Owner can select own import job events'
  ) THEN
    CREATE POLICY "Owner can select own import job events"
      ON import_job_events FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'import_job_events'
      AND policyname = 'Owner can insert own import job events'
  ) THEN
    CREATE POLICY "Owner can insert own import job events"
      ON import_job_events FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'import_job_events'
      AND policyname = 'Owner can update own import job events'
  ) THEN
    CREATE POLICY "Owner can update own import job events"
      ON import_job_events FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'import_job_events'
      AND policyname = 'Owner can delete own import job events'
  ) THEN
    CREATE POLICY "Owner can delete own import job events"
      ON import_job_events FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
