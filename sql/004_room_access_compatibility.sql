-- Compatibility migration for the older TEXT room_id schema and current UUID schema.
-- Run after 002_profiles.sql and 003_task_assignment.sql. Review on staging first.
-- Preserves rooms, tasks, sessions, profiles, and existing Realtime publications.
BEGIN;

CREATE TABLE IF NOT EXISTS public.room_participants (
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, DELETE ON public.room_participants TO authenticated;
DROP POLICY IF EXISTS participants_select ON public.room_participants;
CREATE POLICY participants_select ON public.room_participants FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS participants_delete ON public.room_participants;
CREATE POLICY participants_delete ON public.room_participants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Revoke the table-wide grant before granting a safe column list. A column
-- REVOKE alone does not override an existing table-wide SELECT grant.
REVOKE SELECT ON public.rooms FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, room_code, is_locked, created_at), INSERT ON public.rooms TO authenticated;

-- Legacy rows may store room codes instead of UUID strings. Convert only
-- matching code references; the transaction leaves unknown references intact.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'room_id' AND data_type = 'text') THEN
        UPDATE public.tasks t SET room_id = r.id::text FROM public.rooms r WHERE t.room_id = r.room_code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'room_id' AND data_type = 'text') THEN
        UPDATE public.sessions s SET room_id = r.id::text FROM public.rooms r WHERE s.room_id = r.room_code;
    END IF;
END $$;

-- Existing task creators retain membership for rooms containing their work.
INSERT INTO public.room_participants (room_id, user_id)
SELECT r.id, t.created_by FROM public.tasks t JOIN public.rooms r ON r.id::text = t.room_id::text
WHERE t.created_by IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.room_participants (room_id, user_id)
SELECT r.id, s.user_id FROM public.sessions s JOIN public.rooms r ON r.id::text = s.room_id::text
ON CONFLICT DO NOTHING;

-- Replace permissive legacy task policies; otherwise PostgreSQL ORs those
-- policies with the new membership checks and access remains unrestricted.
DO $$
DECLARE policy RECORD;
BEGIN
    FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' LOOP
        EXECUTE format('DROP POLICY %I ON public.tasks', policy.policyname);
    END LOOP;
END $$;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tasks FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.room_participants p WHERE p.room_id::text = tasks.room_id::text AND p.user_id = auth.uid())
);
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.room_participants p WHERE p.room_id::text = tasks.room_id::text AND p.user_id = auth.uid())
);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.room_participants p WHERE p.room_id::text = tasks.room_id::text AND p.user_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.room_participants p WHERE p.room_id::text = tasks.room_id::text AND p.user_id = auth.uid())
);
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.room_participants p WHERE p.room_id::text = tasks.room_id::text AND p.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.join_room(p_room_code TEXT, p_pin TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE room public.rooms%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT * INTO room FROM public.rooms WHERE room_code = upper(trim(p_room_code));
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF room.is_locked AND room.pin IS DISTINCT FROM p_pin THEN RAISE EXCEPTION 'Incorrect PIN'; END IF;
    INSERT INTO public.room_participants (room_id, user_id) VALUES (room.id, auth.uid()) ON CONFLICT DO NOTHING;
    RETURN room.id;
END $$;
REVOKE ALL ON FUNCTION public.join_room(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room(TEXT, TEXT) TO authenticated;
-- The older boolean verifier is superseded by the authenticated join RPC.
DO $$
BEGIN
    IF to_regprocedure('public.verify_room_pin(text,text)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.verify_room_pin(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
    END IF;
END $$;
COMMIT;
