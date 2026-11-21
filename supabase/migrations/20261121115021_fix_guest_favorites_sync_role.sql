-- Guest favorites never synced: the fallback profile insert used role 'guest', which violates
-- user_profiles_role_check (admin|user). CHECK constraints run before ON CONFLICT, so the whole RPC failed.
CREATE OR REPLACE FUNCTION public.sync_user_favorites(p_user_id uuid, p_favorites jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    fav RECORD;
    v_inserted INT := 0;
BEGIN
    -- Ensure a profile exists to satisfy the foreign key (guest status lives in is_guest / user_class)
    INSERT INTO public.user_profiles (id, is_guest, role, user_class, discovery_level, created_at, updated_at)
    VALUES (p_user_id, TRUE, 'user', 'guest', 0.50, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    FOR fav IN SELECT * FROM jsonb_to_recordset(p_favorites) AS x(
        id TEXT,
        video_id TEXT,
        title TEXT,
        artist TEXT,
        genre TEXT,
        thumbnail TEXT
    ) LOOP
        INSERT INTO public.user_favorites (user_id, video_id, title, artist, genre, thumbnail, created_at)
        VALUES (p_user_id, COALESCE(fav.video_id, fav.id), fav.title, fav.artist, fav.genre, fav.thumbnail, NOW())
        ON CONFLICT (user_id, video_id) DO UPDATE
        SET title = EXCLUDED.title, artist = EXCLUDED.artist, genre = EXCLUDED.genre, thumbnail = EXCLUDED.thumbnail;

        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object('success', TRUE, 'count', v_inserted);
END;
$function$;
