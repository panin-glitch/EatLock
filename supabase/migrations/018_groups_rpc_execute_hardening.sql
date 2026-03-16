-- 018: explicitly restrict group RPCs to authenticated callers

revoke all on function public.join_group_by_code(text) from public;
revoke all on function public.join_group_by_code(text) from anon;
revoke all on function public.join_group_by_code(text) from authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;

revoke all on function public.get_group_member_stats(uuid, uuid) from public;
revoke all on function public.get_group_member_stats(uuid, uuid) from anon;
revoke all on function public.get_group_member_stats(uuid, uuid) from authenticated;
grant execute on function public.get_group_member_stats(uuid, uuid) to authenticated;
