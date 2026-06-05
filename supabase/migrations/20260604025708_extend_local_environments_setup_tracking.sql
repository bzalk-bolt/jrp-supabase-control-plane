/*
  # Extend local_environments with setup tracking columns

  1. Modified Tables
    - `local_environments`
      - `post_install_script_url` (text, nullable) - URL of the post-install script to run
      - `post_install_status` (text, default 'pending') - Status of post-install: pending, running, completed, failed
      - `dns_a_record_verified_at` (timestamptz, nullable) - When the A record was confirmed pointing to VPS IP
      - `last_health_check_at` (timestamptz, nullable) - Last time health probes ran
      - `health_check_results` (jsonb, nullable) - Latest health probe results

  2. Notes
    - These columns track the multi-step server setup progress
    - post_install_status tracks whether the install script has been executed on the VPS
    - health_check_results stores structured probe data (tcp, http, sync_api, supabase_api, studio)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'post_install_script_url'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN post_install_script_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'post_install_status'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN post_install_status text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'dns_a_record_verified_at'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN dns_a_record_verified_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'last_health_check_at'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN last_health_check_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'health_check_results'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN health_check_results jsonb;
  END IF;
END $$;