-- Add distraction_rating to meal_sessions
alter table public.meal_sessions
  add column if not exists distraction_rating int;

comment on column public.meal_sessions.distraction_rating
  is '1-5 star self-reported distraction rating (1=focused, 5=very distracted)';
