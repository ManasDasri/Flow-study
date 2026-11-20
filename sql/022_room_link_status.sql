-- What a room link leads to, checked before joining, so an old link can say its room has ended.
-- Returns 'open', 'ended', or 'missing'; joining stays with join_room. A code that matches no room
-- counts as a wrong attempt, as in join_room, so this can't be used to look for rooms. Safe to run twice.
CREATE OR REPLACE FUNCTION public.room_link_status(p_room_code TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ended TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF (SELECT count(*) FROM public.join_failures WHERE user_id = auth.uid() AND at >= now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many attempts';
  END IF;
  SELECT ended_at INTO v_ended FROM public.rooms WHERE room_code = upper(trim(p_room_code));
  IF NOT FOUND THEN
    INSERT INTO public.join_failures (user_id) VALUES (auth.uid());
    RETURN 'missing';
  END IF;
  RETURN CASE WHEN v_ended IS NULL THEN 'open' ELSE 'ended' END;
END $$;
REVOKE ALL ON FUNCTION public.room_link_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_link_status(TEXT) TO authenticated;
