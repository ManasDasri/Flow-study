-- Flow database schema (run in Supabase SQL Editor)
-- Fixes:
-- * Proper UUID foreign keys
-- * Room participants table for RLS security
-- * Secure PIN checking via RPC
-- * Replica identity FULL for real-time deletes

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.verify_room_pin(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.join_room(text, text) CASCADE;

DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.room_participants CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

CREATE TABLE public.rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    pin TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.room_participants (
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    duration_seconds INT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Users can query rooms basic info
GRANT SELECT (id, room_code, is_locked, created_at) ON TABLE public.rooms TO authenticated;
GRANT INSERT ON TABLE public.rooms TO authenticated;
-- No one can select PIN directly
REVOKE SELECT (pin) ON public.rooms FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.room_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
GRANT SELECT, INSERT ON TABLE public.sessions TO authenticated;

-- Rooms RLS
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);

-- Room Participants RLS
CREATE POLICY "participants_select" ON public.room_participants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "participants_delete" ON public.room_participants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Tasks RLS
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = tasks.room_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = tasks.room_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = tasks.room_id AND user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = tasks.room_id AND user_id = auth.uid())
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = tasks.room_id AND user_id = auth.uid())
);

-- Sessions RLS
CREATE POLICY "sessions_select_own" ON public.sessions FOR SELECT TO authenticated USING (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = sessions.room_id AND user_id = auth.uid())
);
CREATE POLICY "sessions_insert_own" ON public.sessions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = sessions.room_id AND user_id = auth.uid())
);

-- Secure RPC for joining room
CREATE OR REPLACE FUNCTION public.join_room(p_room_code text, p_pin text DEFAULT NULL::text)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
BEGIN
  -- Require authentication.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find room.
  SELECT * INTO v_room FROM public.rooms WHERE room_code = p_room_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Validate PIN when room is locked.
  IF v_room.is_locked THEN
    IF v_room.pin IS DISTINCT FROM p_pin THEN
      RAISE EXCEPTION 'Incorrect PIN';
    END IF;
  END IF;

  -- Register the user as a room participant.
  INSERT INTO public.room_participants (room_id, user_id)
  VALUES (v_room.id, auth.uid())
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN v_room.id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_room(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room(text, text) TO authenticated;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
