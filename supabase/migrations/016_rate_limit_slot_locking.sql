-- 016: serialize active-slot acquisition to prevent concurrency-limit bypass

create or replace function public.acquire_rate_limit_slot(
  p_bucket_key text,
  p_limit int,
  p_ttl_seconds int,
  p_slot_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket_key text := trim(p_bucket_key);
  v_slot_id text := coalesce(nullif(trim(p_slot_id), ''), gen_random_uuid()::text);
  v_active int;
begin
  if v_bucket_key is null or length(v_bucket_key) = 0 then
    raise exception 'bucket_key is required';
  end if;
  if p_limit <= 0 then
    raise exception 'limit must be positive';
  end if;
  if p_ttl_seconds <= 0 then
    raise exception 'ttl_seconds must be positive';
  end if;

  -- Serialize acquisition per bucket so concurrent callers cannot all pass the
  -- active-count check before any of them inserts its slot row.
  perform pg_advisory_xact_lock(91501, hashtext(v_bucket_key));

  delete from public.request_active_slots
   where expires_at <= now();

  select count(*)::int
    into v_active
    from public.request_active_slots
   where bucket_key = v_bucket_key
     and expires_at > now();

  if v_active >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'active', v_active,
      'limit', p_limit,
      'slot_id', null
    );
  end if;

  insert into public.request_active_slots (bucket_key, slot_id, expires_at)
  values (v_bucket_key, v_slot_id, now() + make_interval(secs => p_ttl_seconds))
  on conflict (bucket_key, slot_id)
  do update set expires_at = excluded.expires_at;

  return jsonb_build_object(
    'allowed', true,
    'active', v_active + 1,
    'limit', p_limit,
    'slot_id', v_slot_id
  );
end;
$$;
