/*
  # Extend user_settings with server provider configuration

  Adds the columns the platform admin uses to configure VPS provisioning. The
  provider is intentionally generic in the UI; under the hood we currently
  call Hostinger's API. Storing in user_settings means the values stay scoped
  to the operator's user row and inherit existing RLS.

  1. New Columns on `user_settings`
    - `vps_api_token` (text) - bearer token for the VPS provider API
    - `vps_default_plan_id` (text) - default catalog item / plan id used for new servers
    - `vps_default_template_id` (text) - default OS template id (Ubuntu 24.04 LTS recommended)
    - `vps_datacenter_id` (text, optional) - default data center id
    - `vps_public_key_id` (text, optional) - SSH public key id to attach to new servers
    - `sync_api_image` (text) - docker image reference to install for sync-api on new VPS
    - `netlify_api_token` (text, optional) - Netlify token for optional automatic DNS / site

  2. Security
    - RLS policies on user_settings already restrict to auth.uid() = user_id.
    - All new columns inherit those policies automatically.

  3. Notes
    1. Default values are empty strings so the columns are non-null friendly
       and existing rows get a usable default.
    2. The Edge Function reads these via the service role key on behalf of the
       authenticated calling user.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'vps_api_token'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN vps_api_token text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'vps_default_plan_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN vps_default_plan_id text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'vps_default_template_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN vps_default_template_id text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'vps_datacenter_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN vps_datacenter_id text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'vps_public_key_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN vps_public_key_id text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'sync_api_image'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN sync_api_image text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'netlify_api_token'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN netlify_api_token text NOT NULL DEFAULT '';
  END IF;
END $$;
