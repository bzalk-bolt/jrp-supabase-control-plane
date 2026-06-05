/*
  # Extend user_settings with Supabase Management API access token

  Adds optional fields to the existing `user_settings` table to support
  the Supabase-to-Local import workflow. The Supabase PAT can either be
  persisted (stored in this RLS-protected table) or kept session-only
  (held only in browser memory and never sent to this row).

  1. Modified Tables
    - `user_settings`
      - `supabase_access_token` (text, nullable)
        - Stores the user's Supabase Management API personal access token.
        - Only populated when the user opts to persist the token.
      - `supabase_token_session_only` (boolean, default false)
        - User's preference: when true, do not persist the token to the row.
        - The UI uses this to remember the user's choice across visits.
      - `supabase_token_updated_at` (timestamptz, nullable)
        - Tracks when the token was last saved/cleared, for UI display.

  2. Security
    - RLS already enabled on `user_settings`; existing policies cover the new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'supabase_access_token'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN supabase_access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'supabase_token_session_only'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN supabase_token_session_only boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'supabase_token_updated_at'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN supabase_token_updated_at timestamptz;
  END IF;
END $$;
