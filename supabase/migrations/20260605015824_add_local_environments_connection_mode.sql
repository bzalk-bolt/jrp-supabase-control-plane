-- Add connection_mode to local_environments to track the user's chosen path.
-- Values: NULL (not yet configured), 'clone' (connected to remote), 'local_first' (standalone dev).
ALTER TABLE local_environments
  ADD COLUMN IF NOT EXISTS connection_mode text DEFAULT NULL;