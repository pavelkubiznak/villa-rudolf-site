-- Villa Rudolf — Systém A: předregistrace hostů po osobách
-- =========================================================
-- Základ pro hlášení cizinecké policii (Ubyport) a městský poplatek.
-- Bezpečnostní model: RLS deny-all na tabulce, veškerý zápis/čtení jen přes
-- SECURITY DEFINER RPC scopnuté tokenem pobytu (?t=) nebo aktivním pobytem
-- podle data (statický QR na lednici). Stejný vzor jako vr_request / vr_album_*.
-- Čísla dokladů se NIKDY nevrací ven (ani v rámci skupiny) — jen doc_filled bool.

-- ---------- 1) TABULKA ----------
create table if not exists public.vr_persons (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.vr_bookings(id) on delete cascade,
  first_name         text not null,
  last_name          text not null,
  birth_date         date,
  citizenship        text not null default 'CZ',   -- ISO alpha-2
  doc_number         text,                          -- u cizinců povinné; nikdy se nevrací
  residence_city     text,
  residence_country  text default 'CZ',             -- ISO alpha-2
  stay_from          date not null,
  stay_to            date not null,
  created_at         timestamptz default now(),
  source             text default 'link',           -- 'link' | 'fridge'
  constraint vr_persons_source_chk check (source in ('link','fridge')),
  constraint vr_persons_stay_chk   check (stay_from <= stay_to)
);

create index if not exists vr_persons_booking_idx on public.vr_persons(booking_id);
create index if not exists vr_persons_created_idx on public.vr_persons(created_at);

-- RLS ON, žádné policy => anon/authenticated nemají přímý přístup (deny-all).
alter table public.vr_persons enable row level security;
revoke all on public.vr_persons from anon, authenticated;


-- ---------- 2) RPC: přidání osoby přes token (odkaz ze zprávy) ----------
create or replace function public.vr_persons_add(
  p_token       text,
  p_first       text,
  p_last        text,
  p_birth       date,
  p_citizenship text,
  p_doc         text,
  p_res_city    text,
  p_res_country text,
  p_from        date,
  p_to          date
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token  text := btrim(coalesce(p_token, ''));
  v_first  text := btrim(coalesce(p_first, ''));
  v_last   text := btrim(coalesce(p_last, ''));
  v_cit    text := upper(btrim(coalesce(p_citizenship, 'CZ')));
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_city   text := btrim(coalesce(p_res_city, ''));
  v_rescnt text := upper(btrim(coalesce(p_res_country, '')));
  v_hash   text;
  v_bk     record;
  v_id     uuid;
begin
  -- token -> booking
  if v_token = '' or char_length(v_token) > 200 then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select b.id, b.arrival, b.departure into v_bk
  from public.vr_bookings b
  where b.token_hash = v_hash
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
  if v_bk.id is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;

  -- rate-limit (bez IP — scope na booking + globální strop, jako vr_request)
  if (select count(*) from public.vr_persons
        where booking_id = v_bk.id and created_at > now() - interval '1 hour') >= 30 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from public.vr_persons where booking_id = v_bk.id) >= 40 then
    return json_build_object('ok', false, 'error', 'booking_full');
  end if;
  if (select count(*) from public.vr_persons
        where created_at > now() - interval '1 hour') >= 300 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  return public._vr_persons_insert(
    v_bk.id, v_bk.arrival, v_bk.departure,
    v_first, v_last, p_birth, v_cit, v_doc, v_city, v_rescnt, p_from, p_to, 'link');
end
$function$;


-- ---------- 2b) RPC: přidání osoby podle data (statický QR na lednici) ----------
create or replace function public.vr_persons_add_by_date(
  p_first       text,
  p_last        text,
  p_birth       date,
  p_citizenship text,
  p_doc         text,
  p_res_city    text,
  p_res_country text,
  p_from        date,
  p_to          date
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_first  text := btrim(coalesce(p_first, ''));
  v_last   text := btrim(coalesce(p_last, ''));
  v_cit    text := upper(btrim(coalesce(p_citizenship, 'CZ')));
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_city   text := btrim(coalesce(p_res_city, ''));
  v_rescnt text := upper(btrim(coalesce(p_res_country, '')));
  v_bk     record;
begin
  -- najdi AKTIVNÍ pobyt podle dneška (nejnovější příjezd), viz statický QR na lednici
  select b.id, b.arrival, b.departure into v_bk
  from public.vr_bookings b
  where b.arrival <= current_date
    and current_date <= b.departure
    and (b.expires_at is null or b.expires_at > now())
  order by b.arrival desc
  limit 1;
  if v_bk.id is null then
    return json_build_object('ok', false, 'error', 'no_active_stay');
  end if;

  -- rate-limit (scope na aktivní booking + globální strop)
  if (select count(*) from public.vr_persons
        where booking_id = v_bk.id and created_at > now() - interval '1 hour') >= 30 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if (select count(*) from public.vr_persons where booking_id = v_bk.id) >= 40 then
    return json_build_object('ok', false, 'error', 'booking_full');
  end if;
  if (select count(*) from public.vr_persons
        where created_at > now() - interval '1 hour') >= 300 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  return public._vr_persons_insert(
    v_bk.id, v_bk.arrival, v_bk.departure,
    v_first, v_last, p_birth, v_cit, v_doc, v_city, v_rescnt, p_from, p_to, 'fridge');
end
$function$;


-- ---------- Interní: validace + insert (sdílené oběma přidávacími RPC) ----------
-- Není grantováno anon/authenticated => volatelné jen z DEFINER funkcí výše.
create or replace function public._vr_persons_insert(
  p_booking   uuid,
  p_arrival   date,
  p_departure date,
  p_first     text,
  p_last      text,
  p_birth     date,
  p_cit       text,
  p_doc       text,
  p_city      text,
  p_rescnt    text,
  p_from      date,
  p_to        date,
  p_source    text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_rescnt text := p_rescnt;
  v_id     uuid;
begin
  -- jména povinná
  if p_first = '' then return json_build_object('ok', false, 'error', 'first_required'); end if;
  if p_last  = '' then return json_build_object('ok', false, 'error', 'last_required');  end if;

  -- délkové limity
  if char_length(p_first) > 100 or char_length(p_last) > 100
     or char_length(p_city) > 120 or char_length(v_doc) > 40 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;

  -- občanství: ISO alpha-2
  if p_cit !~ '^[A-Z]{2}$' then
    return json_build_object('ok', false, 'error', 'citizenship_invalid');
  end if;

  -- doklad: u cizinců povinný (zákonná evidence pro cizineckou policii)
  if p_cit <> 'CZ' and v_doc = '' then
    return json_build_object('ok', false, 'error', 'doc_required');
  end if;
  -- tvrdá kontrola dokladu: bez mezer a diakritiky (měkkou kontrolu formátu dělá klient)
  if v_doc <> '' and v_doc !~ '^[A-Za-z0-9-]+$' then
    return json_build_object('ok', false, 'error', 'doc_invalid');
  end if;

  -- datum narození (nepovinné): rozumný rozsah
  if p_birth is not null and (p_birth > current_date or p_birth < date '1900-01-01') then
    return json_build_object('ok', false, 'error', 'birth_invalid');
  end if;

  -- pobyt: from <= to
  if p_from is null or p_to is null or p_from > p_to then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  -- pobyt v okně bookingu (arrival-1 .. departure+1), lidé přijíždějí/odjíždějí různě
  if p_from < p_arrival - 1 or p_to > p_departure + 1 then
    return json_build_object('ok', false, 'error', 'out_of_window');
  end if;

  -- země bydliště: ISO alpha-2, jinak fallback na občanství
  if v_rescnt !~ '^[A-Z]{2}$' then v_rescnt := p_cit; end if;

  insert into public.vr_persons(
    booking_id, first_name, last_name, birth_date, citizenship, doc_number,
    residence_city, residence_country, stay_from, stay_to, source)
  values (
    p_booking, p_first, p_last, p_birth, p_cit, nullif(v_doc, ''),
    nullif(p_city, ''), v_rescnt, p_from, p_to, p_source)
  returning id into v_id;

  return json_build_object(
    'ok', true, 'id', v_id,
    'person', json_build_object(
      'id', v_id, 'first_name', p_first, 'last_name', p_last,
      'citizenship', p_cit, 'stay_from', p_from, 'stay_to', p_to,
      'doc_filled', (nullif(v_doc, '') is not null)));
end
$function$;


-- ---------- 3) RPC: výpis osob ve skupině (BEZ čísel dokladů) ----------
create or replace function public.vr_persons_list(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_hash  text;
  v_bk    uuid;
  v_rows  json;
begin
  if v_token = '' or char_length(v_token) > 200 then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select b.id into v_bk
  from public.vr_bookings b
  where b.token_hash = v_hash
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
  if v_bk is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;

  -- order by created_at (registrace v pořadí přidání); číslo dokladu se NEVRACÍ,
  -- vrací se jen doc_filled bool. created_at slouží jen k řazení, ven nejde.
  select coalesce(json_agg(
    json_build_object(
      'id', id, 'first_name', first_name, 'last_name', last_name,
      'citizenship', citizenship, 'stay_from', stay_from, 'stay_to', stay_to,
      'doc_filled', (doc_number is not null))
    order by created_at
  ), '[]'::json) into v_rows
  from public.vr_persons
  where booking_id = v_bk;

  return json_build_object('ok', true, 'persons', v_rows);
end
$function$;


-- ---------- 4) RPC: smazání osoby (jen v rámci vlastního bookingu) ----------
create or replace function public.vr_persons_delete(p_token text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_hash  text;
  v_bk    uuid;
  v_del   int;
begin
  if v_token = '' or char_length(v_token) > 200 then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  if p_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select b.id into v_bk
  from public.vr_bookings b
  where b.token_hash = v_hash
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
  if v_bk is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;

  with d as (
    delete from public.vr_persons
    where id = p_id and booking_id = v_bk
    returning 1)
  select count(*) into v_del from d;

  return json_build_object('ok', true, 'deleted', (v_del > 0));
end
$function$;


-- ---------- GRANTy (po CREATE OR REPLACE vždy obnovit) ----------
-- Interní _vr_persons_insert ZŮSTÁVÁ bez grantu anon (jen DEFINER-to-DEFINER).
revoke all on function public._vr_persons_insert(uuid,date,date,text,text,date,text,text,text,text,date,date,text) from public, anon, authenticated;
grant execute on function public.vr_persons_add(text,text,text,date,text,text,text,text,date,date) to anon, authenticated;
grant execute on function public.vr_persons_add_by_date(text,text,date,text,text,text,text,date,date) to anon, authenticated;
grant execute on function public.vr_persons_list(text) to anon, authenticated;
grant execute on function public.vr_persons_delete(text, uuid) to anon, authenticated;
