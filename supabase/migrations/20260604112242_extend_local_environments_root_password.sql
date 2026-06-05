/*
  # Add root password storage to local_environments

  1. Modified Tables
    - `local_environments`
      - `vps_root_password` (text, nullable) - stores the root password generated during VPS provisioning for SSH access

  2. Important Notes
    - This enables the edge function to SSH into servers for maintenance operations (e.g., SSL certificate repair)
    - Password is stored encrypted at rest via Supabase's storage encryption
    - Only accessible to the owning user via existing RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'local_environments' AND column_name = 'vps_root_password'
  ) THEN
    ALTER TABLE local_environments ADD COLUMN vps_root_password text;
  END IF;
END $$;
