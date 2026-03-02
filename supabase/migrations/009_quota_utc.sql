-- ============================================================
-- 009: Fix daily quota functions to use UTC date
-- ============================================================
-- current_date uses the session timezone which varies by server.
-- Switch to (now() at time zone 'utc')::date so quotas always
-- reset at UTC midnight regardless of host timezone.
-- Also fix the default column values on both usage tables.
-- ============================================================

-- ── Fix column defaults ─────────────────────────────────────

alter table public.vision_daily_usage
  alter column usage_date set default (now() at time zone 'utc')::date;

alter table public.nutrition_daily_usage
  alter column usage_date set default (now() at time zone 'utc')::date;

-- ── Recreate consume_vision_quota with UTC dates ────────────

create or replace function public.consume_vision_quota(
  p_user_id uuid,
  p_kind    text,
  p_limit   int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used  int;
begin
  insert into public.vision_daily_usage (user_id, usage_date, kind, used_count, updated_at)
  values (p_user_id, v_today, p_kind, 1, now())
  on conflict (user_id, usage_date, kind)
  do update set used_count = vision_daily_usage.used_count + 1,
               updated_at  = now()
  returning used_count into v_used;

  if v_used > p_limit then
    update public.vision_daily_usage
       set used_count = used_count - 1,
           updated_at = now()
     where user_id    = p_user_id
       and usage_date = v_today
       and kind       = p_kind;

    return jsonb_build_object('allowed', false, 'used', v_used - 1, 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_limit);
end;
$$;

revoke all on function public.consume_vision_quota(uuid, text, int) from public;
revoke all on function public.consume_vision_quota(uuid, text, int) from anon;
revoke all on function public.consume_vision_quota(uuid, text, int) from authenticated;
grant execute on function public.consume_vision_quota(uuid, text, int) to service_role;

-- ── Recreate consume_nutrition_quota with UTC dates ─────────

create or replace function public.consume_nutrition_quota(
  p_user_id uuid,
  p_limit   int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used  int;
begin
  insert into public.nutrition_daily_usage (user_id, usage_date, used_count, updated_at)
  values (p_user_id, v_today, 1, now())
  on conflict (user_id, usage_date)
  do update set used_count = nutrition_daily_usage.used_count + 1,
               updated_at  = now()
  returning used_count into v_used;

  if v_used > p_limit then
    update public.nutrition_daily_usage
       set used_count = used_count - 1,
           updated_at = now()
     where user_id    = p_user_id
       and usage_date = v_today;

    return jsonb_build_object('allowed', false, 'used', v_used - 1, 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_limit);
end;
$$;

revoke all on function public.consume_nutrition_quota(uuid, int) from public;
revoke all on function public.consume_nutrition_quota(uuid, int) from anon;
revoke all on function public.consume_nutrition_quota(uuid, int) from authenticated;
grant execute on function public.consume_nutrition_quota(uuid, int) to service_role;
