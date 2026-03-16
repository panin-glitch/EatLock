-- 017: lock search_path for the signup trigger helper

alter function public.handle_new_user() set search_path = public;
