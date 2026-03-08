-- ============================================================
-- 014: Harden group membership + group avatar write policies
-- ============================================================

-- Prevent arbitrary self-joins by group_id when bypass function is not used.
-- Users can insert membership rows directly only if they already administer
-- the target group (owner/admin). Join-by-code stays available via the
-- existing security definer function.
drop policy if exists "group_members_insert_self" on public.group_members;

create policy "group_members_insert_self"
  on public.group_members
  for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1
        from public.groups g
        where g.id = group_members.group_id
          and g.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.group_members gm
        where gm.group_id = group_members.group_id
          and gm.user_id = auth.uid()
          and gm.role = 'admin'
      )
    )
  );

-- Restrict group avatar uploads to group owners/admins only.
drop policy if exists "group_avatars_admin_write" on storage.objects;

create policy "group_avatars_admin_write"
  on storage.objects
  for insert
  with check (
    bucket_id = 'group-avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] is not null
    and exists (
      select 1
      from public.groups g
      where g.id::text = (storage.foldername(name))[1]
        and (
          g.owner_id = auth.uid()
          or exists (
            select 1
            from public.group_members gm
            where gm.group_id = g.id
              and gm.user_id = auth.uid()
              and gm.role = 'admin'
          )
        )
    )
  );
