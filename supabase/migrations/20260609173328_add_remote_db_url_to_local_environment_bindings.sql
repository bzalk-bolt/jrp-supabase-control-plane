ALTER TABLE local_environment_bindings
  ADD COLUMN IF NOT EXISTS remote_db_url text NOT NULL DEFAULT '';