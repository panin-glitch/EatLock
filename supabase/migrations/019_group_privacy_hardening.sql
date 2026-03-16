-- 019: prevent cross-user reads through dormant group-sharing surfaces

-- Group memberships should not reveal other users' rows. Keep visibility
-- scoped to the caller's own membership records only.
drop policy if exists "group_members_select_same_group" on public.group_members;
drop policy if exists "group_members_select_self" on public.group_members;

create policy "group_members_select_self"
  on public.group_members
  for select
  using (user_id = auth.uid());

-- Group stats RPC should no longer allow one member to fetch another member's
-- meal history aggregates. Callers may only request their own stats.
create or replace function public.get_group_member_stats(p_group_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  meals_completed int;
  focus_minutes numeric;
  avg_distraction numeric;
  calories_logged int;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1
    from public.group_members me
    where me.group_id = p_group_id
      and me.user_id = auth.uid()
  ) into allowed;

  if not allowed then
    raise exception 'Not authorized';
  end if;

  select
    count(*) filter (where status in ('VERIFIED', 'PARTIAL'))::int,
    coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60) filter (where status in ('VERIFIED', 'PARTIAL')), 0),
    coalesce(avg(distraction_rating), 0)
  into meals_completed, focus_minutes, avg_distraction
  from public.meal_sessions
  where user_id = auth.uid()
    and started_at >= now() - interval '7 days';

  select coalesce(sum(calories), 0)::int
  into calories_logged
  from public.meal_logs
  where user_id = auth.uid()
    and log_date >= current_date - 7;

  return json_build_object(
    'meals_completed', coalesce(meals_completed, 0),
    'focus_minutes', coalesce(focus_minutes, 0),
    'calories_logged', coalesce(calories_logged, 0),
    'avg_distraction', coalesce(avg_distraction, 0)
  );
end;
$$;
