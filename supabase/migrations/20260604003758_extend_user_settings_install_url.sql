/*
  # Add sync_api_install_url to user_settings

  1. Schema changes
    - Add `sync_api_install_url` (text) to `user_settings`. Stores the HTTPS URL of the bootstrap shell script
      that runs on a freshly provisioned VPS during first boot.
  2. Notes
    - Defaults to empty string. The edge function falls back to a platform default when blank.
    - The legacy `sync_api_image` column is preserved untouched to avoid data loss; it is no longer read.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'sync_api_install_url'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN sync_api_install_url text NOT NULL DEFAULT '';
  END IF;
END $$;
