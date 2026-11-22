-- Look setting (mood skins, v0.8.8d): stored per user so it follows them across devices and to Android.
-- Shape: {"mode": "auto"|"fixed", "fixed": "<skin id>", "off": ["<skin id>", ...]}. NULL = never set.
alter table public.user_profiles add column if not exists look jsonb;

create or replace function public.get_my_look()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select look from public.user_profiles where id = auth.uid();
$$;

create or replace function public.save_my_look(p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_item jsonb;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_signed_in');
    end if;
    if p_look is null or jsonb_typeof(p_look) <> 'object' or length(p_look::text) > 1000
       or coalesce(p_look->>'mode', '') not in ('auto', 'fixed')
       or jsonb_typeof(p_look->'fixed') is distinct from 'string' or length(p_look->>'fixed') > 32
       or jsonb_typeof(p_look->'off') is distinct from 'array' or jsonb_array_length(p_look->'off') > 20 then
        return jsonb_build_object('success', false, 'error', 'invalid_request');
    end if;
    for v_item in select jsonb_array_elements(p_look->'off') loop
        if jsonb_typeof(v_item) <> 'string' or length(v_item #>> '{}') > 32 then
            return jsonb_build_object('success', false, 'error', 'invalid_request');
        end if;
    end loop;

    update public.user_profiles
    set look = jsonb_build_object('mode', p_look->'mode', 'fixed', p_look->'fixed', 'off', p_look->'off'),
        updated_at = now()
    where id = v_uid;
    return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.get_my_look() from public, anon;
revoke execute on function public.save_my_look(jsonb) from public, anon;
grant execute on function public.get_my_look() to authenticated;
grant execute on function public.save_my_look(jsonb) to authenticated;
