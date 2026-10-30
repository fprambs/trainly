-- =====================================================================
-- Bitácora de Entreno · esquema de base de datos (Supabase / Postgres)
-- Pegar completo en Supabase → SQL Editor → Run. Se puede volver a correr.
-- Modelo:
--   profiles        una fila por cuenta (profesor o alumno)
--   athletes        el historial de una persona que entrena. Puede tener cuenta
--                   (user_id) o no (creado por un profesor, sin cuenta todavía)
--   coach_athletes  vínculo profesor ↔ alumno (un alumno puede tener varios)
--   entries         ejercicios de una sesión (con sus series marcadas)
--   routines        rutinas guardadas (biblioteca del profesor o del alumno)
--   exercises       catálogo de ejercicios con imagen y músculo
--   ai_cache        clasificación de músculos compartida (ahorra consultas IA)
-- =====================================================================
create extension if not exists pgcrypto;

-- código corto legible (sin 0/O/1/I)
create or replace function public.gen_code() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '')
  from generate_series(1,6)
$$;

create table if not exists public.profiles(
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'athlete' check (role in ('coach','athlete')),
  coach_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.athletes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  invite_code text unique default public.gen_code(),
  rest_cfg jsonb not null default '{"def":90,"by":{}}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_athletes(
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create table if not exists public.entries(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date date not null,
  name text not null,
  sets int, reps numeric, weight numeric, mins numeric, dist numeric,
  memo text not null default '',
  ord double precision,
  created_ms bigint,
  done jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists entries_athlete_date on public.entries(athlete_id, date);

create table if not exists public.routines(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete cascade, -- null = biblioteca del profesor
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  name text not null,
  image_url text, image_type text, image_path text,
  category text, category_by text,
  created_at timestamptz not null default now(),
  unique(owner_id, key)
);

create table if not exists public.ai_cache(
  key text primary key,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage(
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key(user_id, day)
);

-- ---------------------------------------------------------------------
-- Funciones de permisos (security definer: leen sin pasar por RLS)
-- ---------------------------------------------------------------------
create or replace function public.can_see_athlete(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from athletes a where a.id = aid and a.user_id = auth.uid())
      or exists(select 1 from coach_athletes c where c.athlete_id = aid and c.coach_id = auth.uid())
$$;

create or replace function public.my_coach_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.coach_id from coach_athletes c join athletes a on a.id = c.athlete_id where a.user_id = auth.uid()
$$;

-- ¿comparto algún alumno con esa persona? (para ver su nombre / catálogo)
create or replace function public.shares_athlete(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from athletes a
    where (a.user_id = auth.uid() or exists(select 1 from coach_athletes c where c.athlete_id=a.id and c.coach_id=auth.uid()))
      and (a.user_id = other or exists(select 1 from coach_athletes c2 where c2.athlete_id=a.id and c2.coach_id=other))
  )
$$;

-- ---------------------------------------------------------------------
-- Alta automática del perfil al registrarse
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.raw_user_meta_data->>'role','athlete');
        n text := coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1));
begin
  if r not in ('coach','athlete') then r := 'athlete'; end if;
  insert into profiles(id,name,role,coach_code) values (new.id, n, r, case when r='coach' then gen_code() end)
  on conflict (id) do nothing;
  -- todo usuario tiene su propio historial (el profesor también puede entrenar)
  insert into athletes(user_id,name,created_by) values (new.id, n, new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Acciones (RPC)
-- ---------------------------------------------------------------------
-- El alumno ingresa un código: de profesor (se vincula) o de invitación (une su historial)
create or replace function public.link_with_code(code text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mine uuid; coach uuid; inv athletes%rowtype; cname text;
begin
  if me is null then raise exception 'Necesitas iniciar sesión'; end if;
  code := upper(trim(code));
  select id into mine from athletes where user_id = me;
  if mine is null then
    insert into athletes(user_id,name,created_by) select me, name, me from profiles where id=me returning id into mine;
  end if;
  -- 1) código de profesor
  select id, name into coach, cname from profiles where coach_code = code and role='coach';
  if coach is not null then
    if coach = me then raise exception 'Ese es tu propio código'; end if;
    insert into coach_athletes(coach_id, athlete_id) values (coach, mine) on conflict do nothing;
    return 'Vinculado con ' || cname;
  end if;
  -- 2) código de invitación de un alumno creado por un profesor (sin cuenta)
  select * into inv from athletes where invite_code = code;
  if inv.id is null then raise exception 'Código no válido'; end if;
  if inv.user_id is not null and inv.user_id <> me then raise exception 'Ese código ya fue usado por otra cuenta'; end if;
  if inv.id <> mine then
    update entries set athlete_id = mine where athlete_id = inv.id;
    update routines set athlete_id = mine where athlete_id = inv.id;
    insert into coach_athletes(coach_id, athlete_id) select coach_id, mine from coach_athletes where athlete_id = inv.id on conflict do nothing;
    delete from athletes where id = inv.id;
  end if;
  return 'Listo: tu historial quedó unido';
end $$;

-- Desvincular (lo puede hacer el profesor o el alumno). Un alumno sin cuenta y sin profesores se borra.
create or replace function public.unlink(p_coach uuid, p_athlete uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (auth.uid() = p_coach or exists(select 1 from athletes where id=p_athlete and user_id=auth.uid())) then
    raise exception 'Sin permiso';
  end if;
  delete from coach_athletes where coach_id = p_coach and athlete_id = p_athlete;
  delete from athletes a where a.id = p_athlete and a.user_id is null
    and not exists(select 1 from coach_athletes c where c.athlete_id = a.id);
end $$;

-- El profesor crea un alumno sin cuenta
create or replace function public.create_athlete(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not exists(select 1 from profiles where id=auth.uid() and role='coach') then raise exception 'Solo profesores'; end if;
  insert into athletes(name, created_by) values (trim(p_name), auth.uid()) returning id into aid;
  insert into coach_athletes(coach_id, athlete_id) values (auth.uid(), aid);
  return aid;
end $$;

create or replace function public.new_invite_code(p_athlete uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not exists(select 1 from coach_athletes where coach_id=auth.uid() and athlete_id=p_athlete) then raise exception 'Sin permiso'; end if;
  loop c := gen_code(); exit when not exists(select 1 from athletes where invite_code=c); end loop;
  update athletes set invite_code = c where id = p_athlete;
  return c;
end $$;

-- Pasar a ser profesor (genera su código)
create or replace function public.become_coach() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop c := gen_code(); exit when not exists(select 1 from profiles where coach_code=c); end loop;
  update profiles set role='coach', coach_code = coalesce(coach_code, c) where id = auth.uid() returning coach_code into c;
  return c;
end $$;

-- Asegura que el usuario tenga su propio historial (por si se registró antes del trigger)
create or replace function public.ensure_my_athlete() returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  select id into aid from athletes where user_id = auth.uid();
  if aid is null then
    insert into profiles(id,name) select auth.uid(), split_part(email,'@',1) from auth.users where id=auth.uid() on conflict (id) do nothing;
    insert into athletes(user_id,name,created_by) select id, name, id from profiles where id=auth.uid() returning id into aid;
  end if;
  return aid;
end $$;

-- IA: límite diario por persona (lo llama la función del servidor con el token del usuario)
create or replace function public.ai_take(max_per_day int) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  if auth.uid() is null then return false; end if;
  insert into ai_usage(user_id, day, n) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set n = ai_usage.n + 1 returning n into cur;
  return cur <= max_per_day;
end $$;

-- IA: guarda clasificaciones de músculo compartidas {"clave":"categoria",...}
create or replace function public.ai_cache_put(items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into ai_cache(key, category)
  select k, v from jsonb_each_text(items) as t(k, v)
  where v in ('piernas','gluteos','espalda','pecho','hombros','brazos','core','cardio','otro') and length(k) < 120
  on conflict (key) do update set category = excluded.category;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.entries enable row level security;
alter table public.routines enable row level security;
alter table public.exercises enable row level security;
alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select using (id = auth.uid() or public.shares_athlete(id));
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- role y coach_code solo cambian vía become_coach()
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

drop policy if exists a_sel on public.athletes;
create policy a_sel on public.athletes for select using (public.can_see_athlete(id));
drop policy if exists a_upd on public.athletes;
create policy a_upd on public.athletes for update using (public.can_see_athlete(id)) with check (public.can_see_athlete(id));
revoke insert, update, delete on public.athletes from authenticated;
grant update (name, rest_cfg) on public.athletes to authenticated;

drop policy if exists ca_sel on public.coach_athletes;
create policy ca_sel on public.coach_athletes for select using (coach_id = auth.uid() or public.can_see_athlete(athlete_id));
revoke insert, update, delete on public.coach_athletes from authenticated;

drop policy if exists e_all on public.entries;
create policy e_all on public.entries for all using (public.can_see_athlete(athlete_id)) with check (public.can_see_athlete(athlete_id));

drop policy if exists r_sel on public.routines;
create policy r_sel on public.routines for select using (
  owner_id = auth.uid()
  or (athlete_id is not null and public.can_see_athlete(athlete_id))
  or (athlete_id is null and owner_id in (select public.my_coach_ids()))
);
drop policy if exists r_ins on public.routines;
create policy r_ins on public.routines for insert with check (owner_id = auth.uid() and (athlete_id is null or public.can_see_athlete(athlete_id)));
drop policy if exists r_upd on public.routines;
create policy r_upd on public.routines for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists r_del on public.routines;
create policy r_del on public.routines for delete using (owner_id = auth.uid());

drop policy if exists x_sel on public.exercises;
create policy x_sel on public.exercises for select using (owner_id = auth.uid() or public.shares_athlete(owner_id));
drop policy if exists x_ins on public.exercises;
create policy x_ins on public.exercises for insert with check (owner_id = auth.uid());
drop policy if exists x_upd on public.exercises;
create policy x_upd on public.exercises for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists x_del on public.exercises;
create policy x_del on public.exercises for delete using (owner_id = auth.uid());

drop policy if exists c_sel on public.ai_cache;
create policy c_sel on public.ai_cache for select to authenticated using (true);
-- ai_cache y ai_usage solo los escribe la función del servidor (service role)

-- ---------------------------------------------------------------------
-- Tiempo real: el profesor ve al instante lo que marca el alumno (y al revés)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.entries; exception when others then null; end;
  begin alter publication supabase_realtime add table public.coach_athletes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.routines; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- Imágenes y videos de ejercicios: bucket público "media"
-- Cada usuario escribe solo en su carpeta  media/<su id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media','media', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

-- bucket público: las imágenes se ven por su URL; sin política de lectura nadie puede listar la carpeta
drop policy if exists media_read on storage.objects;
drop policy if exists media_ins on storage.objects;
create policy media_ins on storage.objects for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_upd on storage.objects;
create policy media_upd on storage.objects for update to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_del on storage.objects;
create policy media_del on storage.objects for delete to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Endurecimiento (avisos del asesor de seguridad de Supabase)
-- ---------------------------------------------------------------------
alter function public.gen_code() set search_path = public;
revoke execute on function public.gen_code() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.ai_cache_put(jsonb)','public.ai_take(integer)','public.become_coach()','public.can_see_athlete(uuid)',
    'public.create_athlete(text)','public.ensure_my_athlete()','public.link_with_code(text)','public.my_coach_ids()',
    'public.new_invite_code(uuid)','public.shares_athlete(uuid)','public.unlink(uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------
-- Banco común de ejercicios (lo ven todos; se administra desde SQL)
-- ---------------------------------------------------------------------
create table if not exists public.bank_exercises(
  key text primary key,
  name text not null,
  image_url text, image_type text,
  category text,
  created_at timestamptz not null default now()
);
alter table public.bank_exercises enable row level security;
drop policy if exists bank_read on public.bank_exercises;
create policy bank_read on public.bank_exercises for select to authenticated using (true);
revoke all on public.bank_exercises from anon;
grant select on public.bank_exercises to authenticated;

-- ---------------------------------------------------------------------
-- Administración del banco común
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from anon;
drop policy if exists bank_admin_ins on public.bank_exercises;
drop policy if exists bank_admin_upd on public.bank_exercises;
drop policy if exists bank_admin_del on public.bank_exercises;
create policy bank_admin_ins on public.bank_exercises for insert to authenticated with check (public.is_admin());
create policy bank_admin_upd on public.bank_exercises for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bank_admin_del on public.bank_exercises for delete to authenticated using (public.is_admin());
grant insert, update, delete on public.bank_exercises to authenticated;
-- nadie puede "tapar" un ejercicio del banco con una copia propia
create or replace function public.skip_bank_shadow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from bank_exercises b where b.key = new.key) then return null; end if;
  return new;
end $$;
drop trigger if exists exercises_skip_bank on public.exercises;
create trigger exercises_skip_bank before insert or update on public.exercises
  for each row execute function public.skip_bank_shadow();

-- orden de las series: false = por ejercicio (default), true = circuito por rondas
alter table public.routines add column if not exists circuit boolean not null default false;
alter table public.entries add column if not exists circuit boolean not null default false;

-- peso por mancuerna: el ejercicio se anota con el peso de UNA mancuerna (el volumen cuenta las dos).
-- Default en el banco; cada atleta puede cambiarlo en athletes.rest_cfg.side {key: true/false}
alter table public.bank_exercises add column if not exists per_side boolean not null default false;

-- IA: cuota por persona y total de la app, con costo por tarea (límites fijos aquí, no los decide la app)
create table if not exists public.ai_usage_global(day date primary key, n int not null default 0);
alter table public.ai_usage_global enable row level security;
create or replace function public.ai_take_cost(cost int) returns text
language plpgsql security definer set search_path = public as $$
declare cur int; g int; c int := greatest(1, least(cost, 10));
  per_user constant int := 40; total constant int := 800;
begin
  if auth.uid() is null then return 'auth'; end if;
  select n into cur from ai_usage where user_id = auth.uid() and day = current_date;
  if coalesce(cur,0) + c > per_user then return 'user'; end if;
  select n into g from ai_usage_global where day = current_date;
  if coalesce(g,0) + c > total then return 'global'; end if;
  insert into ai_usage(user_id, day, n) values (auth.uid(), current_date, c)
  on conflict (user_id, day) do update set n = ai_usage.n + c;
  insert into ai_usage_global(day, n) values (current_date, c)
  on conflict (day) do update set n = ai_usage_global.n + c;
  return 'ok';
end $$;
revoke all on function public.ai_take_cost(int) from public, anon;
grant execute on function public.ai_take_cost(int) to authenticated;
