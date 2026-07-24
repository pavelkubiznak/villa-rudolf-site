-- Villa Rudolf — Systém B: ovládací stránka majitele (/sprava/)
-- =============================================================
-- Majitelský panel: pobyty z kalendáře, zakládání hostů, sekvence zpráv,
-- dnešní úkoly. Vše přes admin RPC chráněné hashem admin klíče (stejný token
-- jako brána /sprava/). Anon RPC dávky A (vr_persons_*) ZŮSTÁVAJÍ beze změny.
--
-- Bezpečnostní model (shodný s dávkou A):
--   * admin RPC = SECURITY DEFINER, grant anon, ale hned ověří admin_key proti
--     sha256 hashi v vr_admin_config (deny-all bez hashe).
--   * doc čísla se ZDE vracet SMÍ — majitel je správce údajů (Ubyport, poplatek).
--   * rate-limit 120/h napříč admin voláními (throttluje i případný brute-force).

-- ---------- 1) ROZŠÍŘENÍ vr_bookings ----------
-- Vazba na anonymizovaný kalendář úklidu (history.json) + kontakt + kanál + kód.
alter table public.vr_bookings add column if not exists uidh      text;
alter table public.vr_bookings add column if not exists phone     text;
alter table public.vr_bookings add column if not exists email     text;
alter table public.vr_bookings add column if not exists platform  text;
alter table public.vr_bookings add column if not exists door_code text;

-- uidh unikátní tam, kde není NULL (jeden pobyt kalendáře = max jeden host).
create unique index if not exists vr_bookings_uidh_uidx
  on public.vr_bookings(uidh) where uidh is not null;


-- ---------- 2) ADMIN CONFIG (hash admin klíče) ----------
create table if not exists public.vr_admin_config(
  k text primary key,
  v text not null
);
alter table public.vr_admin_config enable row level security;
revoke all on public.vr_admin_config from anon, authenticated;

-- Hash STEJNÉHO tokenu jako brána stránky /sprava/ (viz sprava/index.html).
-- Token samotný se NIKDY neukládá — jen jeho sha256.
insert into public.vr_admin_config(k, v)
values ('admin_key_sha256', 'b887a4a499dc6306d51fd15138f4235e680ae721edec15712c7030a589367430')
on conflict (k) do update set v = excluded.v;


-- ---------- 3) RATE-LIMIT stopa ----------
create table if not exists public.vr_admin_rl(
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
create index if not exists vr_admin_rl_at_idx on public.vr_admin_rl(at);
alter table public.vr_admin_rl enable row level security;
revoke all on public.vr_admin_rl from anon, authenticated;


-- ---------- 4) LOG ODESLANÝCH ZPRÁV ----------
-- Pro „dnešní úkoly" (co je hotové) a dávku C (kauce/poplatek připomínky).
create table if not exists public.vr_msglog(
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.vr_bookings(id) on delete cascade,
  msg_key    text not null,
  sent_at    timestamptz not null default now(),
  unique (booking_id, msg_key)
);
create index if not exists vr_msglog_booking_idx on public.vr_msglog(booking_id);
alter table public.vr_msglog enable row level security;
revoke all on public.vr_msglog from anon, authenticated;


-- ---------- 5) INTERNÍ: ověření admin klíče + rate-limit ----------
-- Není grantováno anon => volatelné jen z DEFINER funkcí níže.
create or replace function public._vr_admin_auth(p_admin_key text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text := coalesce(p_admin_key, '');
  v_hash   text;
  v_stored text;
  v_cnt    int;
begin
  -- rate-limit: počítej VŠECHNY pokusy (throttluje i brute-force), pak vlož stopu
  select count(*) into v_cnt from public.vr_admin_rl where at > now() - interval '1 hour';
  if v_cnt >= 120 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  insert into public.vr_admin_rl(at) values (now());
  -- příležitostný úklid staré stopy
  delete from public.vr_admin_rl where at < now() - interval '2 hours';

  if char_length(v_key) < 16 or char_length(v_key) > 200 then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  v_hash := encode(extensions.digest(v_key, 'sha256'), 'hex');
  select v into v_stored from public.vr_admin_config where k = 'admin_key_sha256';
  if v_stored is null or v_hash <> v_stored then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end
$function$;


-- ---------- 6) INTERNÍ: souhrn osob k pobytu (počty pro seznam) ----------
-- Dospělý = bez data narození, nebo 18+ k datu příjezdu.
create or replace function public._vr_booking_person_stats(p_booking uuid, p_arrival date)
returns json
language sql
security definer
set search_path to 'public'
as $function$
  select json_build_object(
    'registered',   count(*),
    'adults',       count(*) filter (
                      where birth_date is null
                         or birth_date <= (p_arrival - interval '18 years')),
    'children',     count(*) filter (
                      where birth_date is not null
                        and birth_date >  (p_arrival - interval '18 years')),
    'foreigners',   count(*) filter (where citizenship <> 'CZ'),
    'missing_doc',  count(*) filter (where doc_number is null)
  )
  from public.vr_persons where booking_id = p_booking;
$function$;


-- ---------- 7) ADMIN: založení / úprava pobytu ----------
-- p_id NULL => nový pobyt (vygeneruje token hosta, vrátí ho JEDNOU).
-- p_id dán  => úprava (token se regeneruje jen když p_regen_token = true).
create or replace function public.vr_admin_upsert_booking(
  p_admin_key   text,
  p_id          uuid,
  p_uidh        text,
  p_first       text,
  p_last        text,
  p_phone       text,
  p_email       text,
  p_lang        text,
  p_arrival     date,
  p_departure   date,
  p_adults      int,
  p_children    int[],
  p_platform    text,
  p_notes       text,
  p_door_code   text,
  p_regen_token boolean default false
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_first   text := btrim(coalesce(p_first, ''));
  v_last    text := btrim(coalesce(p_last, ''));
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_email   text := btrim(coalesce(p_email, ''));
  v_lang    text := lower(btrim(coalesce(p_lang, 'cs')));
  v_uidh    text := nullif(btrim(coalesce(p_uidh, '')), '');
  v_plat    text := nullif(btrim(coalesce(p_platform, '')), '');
  v_notes   text := nullif(btrim(coalesce(p_notes, '')), '');
  v_door    text := nullif(btrim(coalesce(p_door_code, '')), '');
  v_adults  int  := coalesce(p_adults, 2);
  v_kids    int[]:= coalesce(p_children, '{}'::int[]);
  v_expires timestamptz;
  v_token   text := null;
  v_hash    text;
  v_id      uuid := p_id;
  v_existing record;
begin
  perform public._vr_admin_auth(p_admin_key);

  if v_lang not in ('cs','en','de','pl') then v_lang := 'cs'; end if;
  if p_arrival is null or p_departure is null or p_arrival > p_departure then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100
     or char_length(v_phone) > 40 or char_length(v_email) > 160 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  v_expires := (p_departure + interval '14 days');

  -- uidh nesmí patřit jinému pobytu
  if v_uidh is not null then
    if exists (select 1 from public.vr_bookings
                where uidh = v_uidh and (v_id is null or id <> v_id)) then
      return json_build_object('ok', false, 'error', 'uidh_taken');
    end if;
  end if;

  if v_id is null then
    -- NOVÝ pobyt: vygeneruj token hosta (48 hex znaků, vysoká entropie)
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
    insert into public.vr_bookings(
      token_hash, first_name, last_name, lang, arrival, departure,
      adults, children, notes, expires_at, uidh, phone, email, platform, door_code)
    values (
      v_hash, nullif(v_first,''), nullif(v_last,''), v_lang, p_arrival, p_departure,
      v_adults, v_kids, v_notes, v_expires, v_uidh,
      nullif(v_phone,''), nullif(v_email,''), v_plat, v_door)
    returning id into v_id;
  else
    -- ÚPRAVA
    select * into v_existing from public.vr_bookings where id = v_id;
    if v_existing.id is null then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
    if p_regen_token then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
    end if;
    update public.vr_bookings set
      first_name = nullif(v_first,''),
      last_name  = nullif(v_last,''),
      lang       = v_lang,
      arrival    = p_arrival,
      departure  = p_departure,
      adults     = v_adults,
      children   = v_kids,
      notes      = v_notes,
      expires_at = v_expires,
      uidh       = v_uidh,
      phone      = nullif(v_phone,''),
      email      = nullif(v_email,''),
      platform   = v_plat,
      door_code  = v_door,
      token_hash = coalesce(v_hash, token_hash)
    where id = v_id;
  end if;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,   -- NULL při úpravě bez regenerace; jinak plaintext JEDNOU
    'expires_at', v_expires);
end
$function$;


-- ---------- 8) ADMIN: výpis všech pobytů (vč. telefonů, počtů, logu zpráv) ----------
create or replace function public.vr_admin_list_bookings(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by arrival), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id', b.id,
      'uidh', b.uidh,
      'first_name', b.first_name,
      'last_name', b.last_name,
      'phone', b.phone,
      'email', b.email,
      'lang', b.lang,
      'arrival', b.arrival,
      'departure', b.departure,
      'adults', b.adults,
      'children', b.children,
      'platform', b.platform,
      'notes', b.notes,
      'door_code', b.door_code,
      'expires_at', b.expires_at,
      'created_at', b.created_at,
      'persons', public._vr_booking_person_stats(b.id, b.arrival),
      'msglog', (
        select coalesce(json_agg(json_build_object('msg_key', m.msg_key, 'sent_at', m.sent_at)), '[]'::json)
        from public.vr_msglog m where m.booking_id = b.id)
    ) as row, b.arrival
    from public.vr_bookings b
  ) s;

  return json_build_object('ok', true, 'bookings', v_rows);
end
$function$;


-- ---------- 9) ADMIN: osoby k pobytu (VČETNĚ čísel dokladů) ----------
create or replace function public.vr_admin_persons(p_admin_key text, p_booking_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_booking_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;

  select coalesce(json_agg(json_build_object(
    'id', id,
    'first_name', first_name,
    'last_name', last_name,
    'birth_date', birth_date,
    'citizenship', citizenship,
    'doc_number', doc_number,           -- majitel je správce údajů (Ubyport)
    'residence_city', residence_city,
    'residence_country', residence_country,
    'stay_from', stay_from,
    'stay_to', stay_to,
    'source', source,
    'created_at', created_at
  ) order by created_at), '[]'::json) into v_rows
  from public.vr_persons where booking_id = p_booking_id;

  return json_build_object('ok', true, 'persons', v_rows);
end
$function$;


-- ---------- 10) ADMIN: zápis odeslání zprávy (checkbox „odesláno") ----------
create or replace function public.vr_admin_msg_log(
  p_admin_key  text,
  p_booking_id uuid,
  p_msg_key    text,
  p_sent       boolean
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_key text := btrim(coalesce(p_msg_key, ''));
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_booking_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  if v_key = '' or char_length(v_key) > 40 then
    return json_build_object('ok', false, 'error', 'key_invalid');
  end if;
  if not exists (select 1 from public.vr_bookings where id = p_booking_id) then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  if coalesce(p_sent, false) then
    insert into public.vr_msglog(booking_id, msg_key, sent_at)
    values (p_booking_id, v_key, now())
    on conflict (booking_id, msg_key) do update set sent_at = now();
  else
    delete from public.vr_msglog where booking_id = p_booking_id and msg_key = v_key;
  end if;

  return json_build_object('ok', true, 'sent', coalesce(p_sent, false));
end
$function$;


-- ---------- 11) ADMIN: smazání pobytu (ruční pobyt / úklid testu) ----------
create or replace function public.vr_admin_delete_booking(p_admin_key text, p_booking_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_del int;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_booking_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  -- vr_persons i vr_msglog mají ON DELETE CASCADE
  with d as (delete from public.vr_bookings where id = p_booking_id returning 1)
  select count(*) into v_del from d;
  return json_build_object('ok', true, 'deleted', (v_del > 0));
end
$function$;


-- ---------- GRANTy (po CREATE OR REPLACE vždy obnovit) ----------
-- Interní funkce ZŮSTÁVAJÍ bez grantu anon (jen DEFINER-to-DEFINER).
revoke all on function public._vr_admin_auth(text) from public, anon, authenticated;
revoke all on function public._vr_booking_person_stats(uuid, date) from public, anon, authenticated;
grant execute on function public.vr_admin_upsert_booking(text,uuid,text,text,text,text,text,text,date,date,int,int[],text,text,text,boolean) to anon, authenticated;
grant execute on function public.vr_admin_list_bookings(text) to anon, authenticated;
grant execute on function public.vr_admin_persons(text, uuid) to anon, authenticated;
grant execute on function public.vr_admin_msg_log(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.vr_admin_delete_booking(text, uuid) to anon, authenticated;
