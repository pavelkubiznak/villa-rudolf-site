-- Předpoklady, které v ostré Supabase existují, ale v repu nejsou (základní tabulky
-- a role zakládá Supabase sama). Tohle je JEN kulisa pro test migrace.
-- Role jsou v Postgresu společné pro celý cluster, ne pro databázi. Když se kulisa
-- pouští podruhé (jiná testovací DB na témž serveru), `create role` by spadl.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I', r);
    end if;
  end loop;
end $$;
create schema extensions;
create extension pgcrypto with schema extensions;

create table public.vr_bookings(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  first_name text, last_name text, lang text,
  arrival date, departure date, adults int, children int[],
  notes text, expires_at timestamptz, created_at timestamptz default now()
);
create table public.vr_admin_config(k text primary key, v text not null);
create table public.vr_admin_rl(id bigint generated always as identity primary key, at timestamptz not null default now());

-- _vr_admin_auth 1:1 z 20260724_vr_admin.sql
create or replace function public._vr_admin_auth(p_admin_key text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_key text := coalesce(p_admin_key,''); v_hash text; v_stored text; v_cnt int;
begin
  select count(*) into v_cnt from public.vr_admin_rl where at > now() - interval '1 hour';
  if v_cnt >= 120 then raise exception 'rate_limited' using errcode='53400'; end if;
  insert into public.vr_admin_rl(at) values (now());
  delete from public.vr_admin_rl where at < now() - interval '2 hours';
  if char_length(v_key) < 16 or char_length(v_key) > 200 then
    raise exception 'unauthorized' using errcode='28000'; end if;
  v_hash := encode(extensions.digest(v_key,'sha256'),'hex');
  select v into v_stored from public.vr_admin_config where k='admin_key_sha256';
  if v_stored is null or v_hash <> v_stored then
    raise exception 'unauthorized' using errcode='28000'; end if;
end $f$;

-- testovací admin klíč (jen v téhle dočasné DB)
insert into public.vr_admin_config(k,v)
values ('admin_key_sha256', encode(extensions.digest('test-admin-key-1234567890','sha256'),'hex'));
