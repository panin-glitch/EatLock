-- ============================================================
-- 006: Persistent daily usage quotas for vision + nutrition
-- ============================================================

-- ── Vision daily usage table ────────────────────────────────

create table if not exists public.vision_daily_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null,
  usage_date    date        not null default current_date,
  kind          text        not null,          -- 'verify', 'compare'
  used_count    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, usage_date, kind)
);

alter table public.vision_daily_usage enable row level security;

-- Users can SELECT their own rows (via anon/authenticated)
create policy "Users can view own vision usage"
  on public.vision_daily_usage
  for select
  using (auth.uid() = user_id);

-- ── Nutrition daily usage table ─────────────────────────────

create table if not exists public.nutrition_daily_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null,
  usage_date    date        not null default current_date,
  used_count    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, usage_date)
);

alter table public.nutrition_daily_usage enable row level security;

create policy "Users can view own nutrition usage"
  on public.nutrition_daily_usage
  for select
  using (auth.uid() = user_id);

-- ── RPC: consume_vision_quota ───────────────────────────────
-- Atomically increments and checks daily usage. Returns JSON { allowed: bool, used: int, limit: int }.
-- SECURITY DEFINER so it can write even though users have only SELECT RLS.

create or replace function public.consume_vision_quota(
  p_user_id uuid,
  p_kind    text,
  p_limit   int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_used int;
begin
  -- Upsert and increment atomically
  insert into public.vision_daily_usage (user_id, usage_date, kind, used_count, updated_at)
  values (p_user_id, current_date, p_kind, 1, now())
  on conflict (user_id, usage_date, kind)
  do update set used_count = vision_daily_usage.used_count + 1,
               updated_at  = now()
  returning used_count into v_used;

  if v_used > p_limit then
    -- Roll back the increment — we exceeded the limit
    update public.vision_daily_usage
       set used_count = used_count - 1,
           updated_at = now()
     where user_id    = p_user_id
       and usage_date = current_date
       and kind       = p_kind;

    return jsonb_build_object('allowed', false, 'used', v_used - 1, 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_limit);
end;
$$;

-- Lock search_path for security
alter function public.consume_vision_quota(uuid, text, int) set search_path = public;

-- Only service_role can call this
revoke all on function public.consume_vision_quota(uuid, text, int) from public;
revoke all on function public.consume_vision_quota(uuid, text, int) from anon;
revoke all on function public.consume_vision_quota(uuid, text, int) from authenticated;
grant execute on function public.consume_vision_quota(uuid, text, int) to service_role;

-- ── RPC: consume_nutrition_quota ────────────────────────────

create or replace function public.consume_nutrition_quota(
  p_user_id uuid,
  p_limit   int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_used int;
begin
  insert into public.nutrition_daily_usage (user_id, usage_date, used_count, updated_at)
  values (p_user_id, current_date, 1, now())
  on conflict (user_id, usage_date)
  do update set used_count = nutrition_daily_usage.used_count + 1,
               updated_at  = now()
  returning used_count into v_used;

  if v_used > p_limit then
    update public.nutrition_daily_usage
       set used_count = used_count - 1,
           updated_at = now()
     where user_id    = p_user_id
       and usage_date = current_date;

    return jsonb_build_object('allowed', false, 'used', v_used - 1, 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_limit);
end;
$$;

alter function public.consume_nutrition_quota(uuid, int) set search_path = public;

revoke all on function public.consume_nutrition_quota(uuid, int) from public;
revoke all on function public.consume_nutrition_quota(uuid, int) from anon;
revoke all on function public.consume_nutrition_quota(uuid, int) from authenticated;
grant execute on function public.consume_nutrition_quota(uuid, int) to service_role;
