-- 007: avatars + groups + member stats RLS

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists username text;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members add column if not exists role text;
update public.group_members
set role = 'member'
where role is null;
alter table public.group_members alter column role set default 'member';

do $$
begin
  alter table public.group_members add constraint group_members_role_check check (role in ('member', 'admin'));
exception
  when duplicate_object then null;
end
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "profiles_select_self_or_same_group" on public.profiles;
create policy "profiles_select_self_or_same_group"
  on public.profiles
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.group_members me
      join public.group_members other on me.group_id = other.group_id
      where me.user_id = auth.uid() and other.user_id = profiles.user_id
    )
  );

drop policy if exists "groups_select_member" on public.groups;
drop policy if exists "groups_insert_owner" on public.groups;
drop policy if exists "groups_update_owner_or_admin" on public.groups;
drop policy if exists "groups_delete_owner_or_admin" on public.groups;

create policy "groups_select_member"
  on public.groups
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

create policy "groups_insert_owner"
  on public.groups
  for insert
  with check (owner_id = auth.uid());

create policy "groups_update_owner_or_admin"
  on public.groups
  for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  )
  with check (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  );

create policy "groups_delete_owner_or_admin"
  on public.groups
  for delete
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  );

drop policy if exists "group_members_select_same_group" on public.group_members;
drop policy if exists "group_members_insert_self" on public.group_members;
drop policy if exists "group_members_delete_self_or_admin" on public.group_members;
drop policy if exists "group_members_update_admin" on public.group_members;

create policy "group_members_select_same_group"
  on public.group_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.group_members me
      where me.group_id = group_members.group_id and me.user_id = auth.uid()
    )
  );

create policy "group_members_insert_self"
  on public.group_members
  for insert
  with check (user_id = auth.uid());

create policy "group_members_delete_self_or_admin"
  on public.group_members
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
    or exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

create policy "group_members_update_admin"
  on public.group_members
  for update
  using (
    exists (
      select 1
      from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
    or exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.group_members gm
      where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
    or exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

create or replace function public.join_group_by_code(p_join_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  grp public.groups;
begin
  select * into grp
  from public.groups
  where upper(join_code) = upper(trim(p_join_code))
  limit 1;

  if grp.id is null then
    raise exception 'Group not found';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (grp.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return grp;
end;
$$;

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
  select exists (
    select 1
    from public.group_members me
    join public.group_members other on me.group_id = other.group_id
    where me.group_id = p_group_id
      and other.group_id = p_group_id
      and me.user_id = auth.uid()
      and other.user_id = p_user_id
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
  where user_id = p_user_id
    and started_at >= now() - interval '7 days';

  select coalesce(sum(calories), 0)::int
  into calories_logged
  from public.meal_logs
  where user_id = p_user_id
    and log_date >= current_date - 7;

  return json_build_object(
    'meals_completed', coalesce(meals_completed, 0),
    'focus_minutes', coalesce(focus_minutes, 0),
    'calories_logged', coalesce(calories_logged, 0),
    'avg_distraction', coalesce(avg_distraction, 0)
  );
end;
$$;

grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.get_group_member_stats(uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_owner_upload" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "group_avatars_public_read" on storage.objects;
drop policy if exists "group_avatars_admin_write" on storage.objects;

create policy "avatars_public_read"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_upload"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "group_avatars_public_read"
  on storage.objects
  for select
  using (bucket_id = 'group-avatars');

create policy "group_avatars_admin_write"
  on storage.objects
  for insert
  with check (
    bucket_id = 'group-avatars'
    and auth.role() = 'authenticated'
  );
