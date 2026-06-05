/*
  # Local environments, domain verifications, bindings, and provisioning jobs

  Adds the data model that backs the new "Local Environment = one VPS = one
  remote project" architecture. This is the foundation for self-service VPS
  provisioning via Hostinger and Netlify.

  1. New Tables
    - `local_environments`
      Tracks each user-owned VPS host that runs sync-api. One row per host.
      Columns: identity (id, user_id, name), DNS (apex_domain, subdomain,
      full_hostname), VPS (vps_provider, vps_id, vps_ip, vps_status), sync-api
      (sync_api_url, sync_api_token), Netlify (netlify_site_id, netlify_url),
      and timestamps.

    - `domain_verifications`
      One row per (user, apex_domain) pair tracking TXT-record ownership state
      so a verified apex can be reused across many subdomains.
      Columns: id, user_id, apex_domain, token, status, last_checked_at,
      verified_at, created_at.

    - `local_environment_bindings`
      Enforces the strict 1:1 mapping between a local environment and a remote
      Supabase project. Unique on local_environment_id and on
      remote_project_ref so neither side can double-bind.
      Columns: id, user_id, local_environment_id, remote_project_ref,
      remote_organization_id, remote_organization_name, database_mode,
      bound_at.

    - `provisioning_jobs`
      Tracks the multi-step VPS + DNS + sync-api install + Netlify pipeline
      with phase, percent, message, status, and timestamps. Streamed to the UI
      similar to import_job_events.
      Columns: id, user_id, local_environment_id, phase, percent, message,
      status, details, recorded_at_ms, created_at.

  2. Security
    - RLS enabled on every new table.
    - Policies restrict every operation to rows owned by auth.uid().
    - Separate SELECT/INSERT/UPDATE/DELETE policies (no FOR ALL).

  3. Important Notes
    1. `local_environments.full_hostname` is unique per user so a user cannot
       reuse the same hostname for two VPSes.
    2. `local_environment_bindings` has unique constraints on both
       `local_environment_id` and `remote_project_ref` to enforce 1:1.
    3. `domain_verifications` has a unique (user_id, apex_domain) pair so a
       single user only verifies a domain once.
*/

-- local_environments ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  apex_domain text NOT NULL DEFAULT '',
  subdomain text NOT NULL DEFAULT '',
  full_hostname text NOT NULL DEFAULT '',
  dns_verification_token text NOT NULL DEFAULT '',
  dns_verified_at timestamptz,
  vps_provider text NOT NULL DEFAULT 'hostinger',
  vps_id text NOT NULL DEFAULT '',
  vps_ip text NOT NULL DEFAULT '',
  vps_status text NOT NULL DEFAULT 'pending',
  sync_api_url text NOT NULL DEFAULT '',
  sync_api_token text NOT NULL DEFAULT '',
  netlify_site_id text NOT NULL DEFAULT '',
  netlify_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS local_environments_user_hostname_unique
  ON local_environments (user_id, full_hostname)
  WHERE full_hostname <> '';

CREATE INDEX IF NOT EXISTS local_environments_user_idx
  ON local_environments (user_id);

ALTER TABLE local_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own local environments"
  ON local_environments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own local environments"
  ON local_environments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own local environments"
  ON local_environments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own local environments"
  ON local_environments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- domain_verifications -------------------------------------------------------
CREATE TABLE IF NOT EXISTS domain_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  apex_domain text NOT NULL,
  token text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  last_checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_verifications_user_apex_unique
  ON domain_verifications (user_id, apex_domain);

ALTER TABLE domain_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domain verifications"
  ON domain_verifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domain verifications"
  ON domain_verifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domain verifications"
  ON domain_verifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own domain verifications"
  ON domain_verifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- local_environment_bindings -------------------------------------------------
CREATE TABLE IF NOT EXISTS local_environment_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_environment_id uuid NOT NULL REFERENCES local_environments(id) ON DELETE CASCADE,
  remote_project_ref text NOT NULL,
  remote_organization_id text NOT NULL DEFAULT '',
  remote_organization_name text NOT NULL DEFAULT '',
  database_mode text NOT NULL DEFAULT '',
  bound_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS local_environment_bindings_local_env_unique
  ON local_environment_bindings (local_environment_id);

CREATE UNIQUE INDEX IF NOT EXISTS local_environment_bindings_remote_project_unique
  ON local_environment_bindings (remote_project_ref);

ALTER TABLE local_environment_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bindings"
  ON local_environment_bindings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bindings"
  ON local_environment_bindings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bindings"
  ON local_environment_bindings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bindings"
  ON local_environment_bindings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- provisioning_jobs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_environment_id uuid NOT NULL REFERENCES local_environments(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT '',
  percent numeric NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_jobs_local_env_idx
  ON provisioning_jobs (local_environment_id, created_at DESC);

ALTER TABLE provisioning_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provisioning jobs"
  ON provisioning_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own provisioning jobs"
  ON provisioning_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own provisioning jobs"
  ON provisioning_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own provisioning jobs"
  ON provisioning_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
