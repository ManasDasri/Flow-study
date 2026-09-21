-- Adds task ownership (assign a shared task to a room participant).
-- Additive only — safe to run against a live database, does not touch
-- existing tables or data. Run once in the Supabase SQL Editor.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- No RLS changes needed: the existing tasks_select/insert/update/delete
-- policies already scope access to room participants, and assigned_to is
-- just a column on a row those policies already govern.
