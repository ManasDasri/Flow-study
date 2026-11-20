-- What a room link leads to, checked before joining, so an old link can say its room has ended.
-- Returns 'open', 'ended', or 'missing'; joining stays with join_room. It tells no more than join_room
-- without a PIN would: a code that matches no room, or a PIN room the caller isn't in, is 'missing' and
-- counts as a wrong attempt, under the same per-account lock and limit. Safe to run twice.
CREATE OR REPLACE FUNCTION public.room_link_status(p_room_code TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  room public.rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('join_room:' || auth.uid()::text));
  DELETE FROM public.join_failures WHERE at < now() - interval '10 minutes';
  IF (SELECT count(*) FROM public.join_failures WHERE user_id = auth.uid()) >= 10 THEN
    RAISE EXCEPTION 'Too many attempts';
  END IF;
  SELECT * INTO room FROM public.rooms WHERE room_code = upper(trim(p_room_code));
  IF NOT FOUND OR (room.is_locked AND NOT EXISTS (SELECT 1 FROM public.room_participants WHERE room_id = room.id AND user_id = auth.uid())) THEN
    INSERT INTO public.join_failures (user_id) VALUES (auth.uid());
    RETURN 'missing';
  END IF;
  RETURN CASE WHEN room.ended_at IS NULL THEN 'open' ELSE 'ended' END;
END $$;
REVOKE ALL ON FUNCTION public.room_link_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_link_status(TEXT) TO authenticated;
