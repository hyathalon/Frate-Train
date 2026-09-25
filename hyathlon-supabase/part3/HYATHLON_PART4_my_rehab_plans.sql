-- =====================================================================
-- HYATHLON · PART 4 · My rehab plans (athlete-only, no third parties)
-- Athletes start a plan from a rehab framework (or blank), add their own
-- exercises from their physio, and log sessions. Only the athlete can see
-- their plans and logs. Nothing is shared or sent anywhere.
-- Run AFTER Parts 3, 3b, 3c and 3d. One transaction.
-- Note: plans and logs are personal health information. See the privacy
-- checklist before launching this to athletes.
-- =====================================================================
begin;
set local search_path = public, extensions;

create table public.rehab_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_program_id text references public.rehab_programs(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 120),
  status text not null default 'active' check (status in ('active','paused','completed')),
  current_phase int not null default 1 check (current_phase between 1 and 10),
  start_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rehab_plans_athlete on public.rehab_plans(athlete_id);

create table public.rehab_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.rehab_plans(id) on delete cascade,
  athlete_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  phase_no int not null default 1,
  sort_order int not null default 1,
  exercise_id text references public.exercises(id),                       -- from the library
  custom_exercise_id uuid references public.custom_exercises(id) on delete set null,  -- athlete's own saved exercise
  custom_name text,                                                         -- or just type it in, e.g. from their physio
  source text not null default 'framework' check (source in ('framework','my physio','my own')),
  dose text,
  tempo text,
  frequency text,
  notes text,
  created_at timestamptz not null default now(),
  constraint plan_item_has_exercise check (exercise_id is not null or custom_exercise_id is not null or custom_name is not null)
);
create index rehab_plan_items_plan on public.rehab_plan_items(plan_id, phase_no, sort_order);

create table public.rehab_logs (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.rehab_plans(id) on delete cascade,
  item_id uuid references public.rehab_plan_items(id) on delete set null,
  athlete_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  sets int check (sets >= 0), reps int check (reps >= 0), load_kg numeric check (load_kg >= 0),
  duration_min numeric check (duration_min >= 0),
  pain_during int check (pain_during between 0 and 10),          -- optional
  pain_next_morning int check (pain_next_morning between 0 and 10), -- optional
  notes text,
  created_at timestamptz not null default now()
);
create index rehab_logs_athlete_date on public.rehab_logs(athlete_id, logged_on);

-- Start a plan from a framework: copies its phases and exercises so the athlete can then edit freely.
create or replace function public.start_rehab_plan(p_program_id text default null, p_title text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_program_id is null then
    insert into public.rehab_plans (title) values (coalesce(p_title, 'My rehab plan')) returning id into v_plan;
    return v_plan;
  end if;
  insert into public.rehab_plans (template_program_id, title)
  select p.id, coalesce(p_title, p.name) from public.rehab_programs p where p.id = p_program_id
  returning id into v_plan;
  if v_plan is null then raise exception 'Rehab framework % not found', p_program_id; end if;
  insert into public.rehab_plan_items (plan_id, phase_no, sort_order, exercise_id, dose, tempo, notes, source)
  select v_plan, e.phase_no, e.sort_order, e.exercise_id, e.dose, e.tempo, e.notes, 'framework'
  from public.rehab_phase_exercises e where e.program_id = p_program_id;
  return v_plan;
end $$;

-- A summary of the athlete's own rehab for the chosen period (shown in the app; the athlete can export it themselves).
create or replace function public.my_rehab_summary(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'plans', coalesce(jsonb_agg(jsonb_build_object(
       'title', p.title, 'status', p.status, 'current_phase', p.current_phase, 'start_date', p.start_date,
       'sessions', (select count(distinct l.logged_on) from public.rehab_logs l where l.plan_id = p.id and l.logged_on between p_from and p_to),
       'avg_pain_during', (select round(avg(l.pain_during)::numeric,1) from public.rehab_logs l where l.plan_id = p.id and l.logged_on between p_from and p_to),
       'avg_pain_next_morning', (select round(avg(l.pain_next_morning)::numeric,1) from public.rehab_logs l where l.plan_id = p.id and l.logged_on between p_from and p_to),
       'weekly', (select coalesce(jsonb_agg(w order by w->>'week'), '[]'::jsonb) from (
           select jsonb_build_object('week', to_char(date_trunc('week', l.logged_on),'YYYY-MM-DD'), 'sessions', count(distinct l.logged_on),
                                     'avg_pain_during', round(avg(l.pain_during)::numeric,1), 'avg_pain_next_morning', round(avg(l.pain_next_morning)::numeric,1)) w
           from public.rehab_logs l where l.plan_id = p.id and l.logged_on between p_from and p_to group by date_trunc('week', l.logged_on)) x),
       'exercises', (select coalesce(jsonb_agg(jsonb_build_object('exercise', x.name, 'source', x.source, 'times', x.n, 'max_load_kg', x.max_load) order by x.n desc), '[]'::jsonb)
           from (select coalesce(e.name, ce.name, i.custom_name, 'Exercise') name, i.source, count(*) n, max(l.load_kg) max_load
                 from public.rehab_logs l left join public.rehab_plan_items i on i.id = l.item_id
                 left join public.exercises e on e.id = i.exercise_id left join public.custom_exercises ce on ce.id = i.custom_exercise_id
                 where l.plan_id = p.id and l.logged_on between p_from and p_to group by 1, 2) x)
     ) order by p.start_date desc), '[]'::jsonb))
  from public.rehab_plans p where p.athlete_id = auth.uid()
$$;

create or replace function public.touch_rehab_plan() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger rehab_plans_touch before update on public.rehab_plans for each row execute function public.touch_rehab_plan();

-- Items and logs must belong to the athlete's own plan.
create or replace function public.guard_rehab_row() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.rehab_plans p where p.id = new.plan_id and p.athlete_id = new.athlete_id) then
    raise exception 'That plan does not belong to you';
  end if;
  return new;
end $$;
create trigger rehab_items_guard before insert or update on public.rehab_plan_items for each row execute function public.guard_rehab_row();
create trigger rehab_logs_guard before insert or update on public.rehab_logs for each row execute function public.guard_rehab_row();

-- Row-level security: athletes see and change only their own rows. No one else has access.
alter table public.rehab_plans enable row level security;
alter table public.rehab_plan_items enable row level security;
alter table public.rehab_logs enable row level security;
create policy "own plans" on public.rehab_plans for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "own plan items" on public.rehab_plan_items for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "own rehab logs" on public.rehab_logs for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

grant execute on function public.start_rehab_plan(text, text) to authenticated;
grant execute on function public.my_rehab_summary(date, date) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20260925040000','my_rehab_plans')
on conflict (version) do nothing;

-- Check: should show 0 | 0 | 0
select (select count(*) from public.rehab_plans) as plans,
       (select count(*) from public.rehab_plan_items) as items,
       (select count(*) from public.rehab_logs) as logs;

commit;
