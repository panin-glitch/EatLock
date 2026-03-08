-- 015: durable shared rate-limiting primitives for worker-side security controls

create table if not exists public.request_limit_windows (
  bucket_key         text        not null,
  window_started_at  timestamptz not null,
  used_count         int         not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (bucket_key, window_started_at)
);

create table if not exists public.request_active_slots (
  bucket_key   text        not null,
  slot_id      text        not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (bucket_key, slot_id)
);

create index if not exists request_active_slots_expires_idx
  on public.request_active_slots(expires_at);

create table if not exists public.request_cooldowns (
  bucket_key      text primary key,
  cooldown_until  timestamptz not null,
  updated_at      timestamptz not null default now()
);

create index if not exists request_cooldowns_until_idx
  on public.request_cooldowns(cooldown_until);

alter table public.request_limit_windows enable row level security;
alter table public.request_active_slots enable row level security;
alter table public.request_cooldowns enable row level security;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_started timestamptz;
  v_used int;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'bucket_key is required';
  end if;
  if p_limit <= 0 then
    raise exception 'limit must be positive';
  end if;
  if p_window_seconds <= 0 then
    raise exception 'window_seconds must be positive';
  end if;

  v_window_started := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.request_limit_windows (bucket_key, window_started_at, used_count, updated_at)
  values (trim(p_bucket_key), v_window_started, 1, now())
  on conflict (bucket_key, window_started_at)
  do update set used_count = request_limit_windows.used_count + 1,
               updated_at = now()
  returning used_count into v_used;

  if v_used > p_limit then
    update public.request_limit_windows
       set used_count = used_count - 1,
           updated_at = now()
     where bucket_key = trim(p_bucket_key)
       and window_started_at = v_window_started;

    return jsonb_build_object('allowed', false, 'used', v_used - 1, 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_limit);
end;
$$;

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

create or replace function public.release_rate_limit_slot(
  p_bucket_key text,
  p_slot_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.request_active_slots
   where bucket_key = trim(p_bucket_key)
     and slot_id = trim(p_slot_id);

  return jsonb_build_object('released', true);
end;
$$;

create or replace function public.get_rate_limit_cooldown(
  p_bucket_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_remaining int;
begin
  select cooldown_until
    into v_until
    from public.request_cooldowns
   where bucket_key = trim(p_bucket_key);

  if v_until is null or v_until <= now() then
    delete from public.request_cooldowns
     where bucket_key = trim(p_bucket_key)
       and cooldown_until <= now();

    return jsonb_build_object('active', false, 'remaining_seconds', 0);
  end if;

  v_remaining := greatest(1, floor(extract(epoch from (v_until - now())))::int);
  return jsonb_build_object('active', true, 'remaining_seconds', v_remaining);
end;
$$;

create or replace function public.set_rate_limit_cooldown(
  p_bucket_key text,
  p_cooldown_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz := now() + make_interval(secs => p_cooldown_seconds);
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 then
    raise exception 'bucket_key is required';
  end if;
  if p_cooldown_seconds <= 0 then
    raise exception 'cooldown_seconds must be positive';
  end if;

  insert into public.request_cooldowns (bucket_key, cooldown_until, updated_at)
  values (trim(p_bucket_key), v_until, now())
  on conflict (bucket_key)
  do update set cooldown_until = excluded.cooldown_until,
               updated_at = now();

  return jsonb_build_object('active', true, 'remaining_seconds', p_cooldown_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, int, int) from public;
revoke all on function public.consume_rate_limit(text, int, int) from anon;
revoke all on function public.consume_rate_limit(text, int, int) from authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

revoke all on function public.acquire_rate_limit_slot(text, int, int, text) from public;
revoke all on function public.acquire_rate_limit_slot(text, int, int, text) from anon;
revoke all on function public.acquire_rate_limit_slot(text, int, int, text) from authenticated;
grant execute on function public.acquire_rate_limit_slot(text, int, int, text) to service_role;

revoke all on function public.release_rate_limit_slot(text, text) from public;
revoke all on function public.release_rate_limit_slot(text, text) from anon;
revoke all on function public.release_rate_limit_slot(text, text) from authenticated;
grant execute on function public.release_rate_limit_slot(text, text) to service_role;

revoke all on function public.get_rate_limit_cooldown(text) from public;
revoke all on function public.get_rate_limit_cooldown(text) from anon;
revoke all on function public.get_rate_limit_cooldown(text) from authenticated;
grant execute on function public.get_rate_limit_cooldown(text) to service_role;

revoke all on function public.set_rate_limit_cooldown(text, int) from public;
revoke all on function public.set_rate_limit_cooldown(text, int) from anon;
revoke all on function public.set_rate_limit_cooldown(text, int) from authenticated;
grant execute on function public.set_rate_limit_cooldown(text, int) to service_role;