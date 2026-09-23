-- Villa Rudolf — registrace z lednice přes kód od dveří
-- =====================================================
-- Statický QR na lednici vedl dřív na vr_persons_add_by_date: kdokoli z internetu
-- mohl zapsat osobu k pobytu, který zrovna běží, a host neviděl svou skupinu ani
-- termín (STAV.md, audit — „chybí druhý faktor“).
--
-- Nově host na lednici zadá KÓD OD DVEŘÍ. Zná ho jen skupina, která je ve vile.
-- vr_fridge_open() podle něj najde běžící pobyt a vydá krátkodobý klíč relace
-- (platí do dne odjezdu). S ním fungují stejné RPC jako s osobním odkazem
-- (vr_persons_list / _add / _delete): host vidí skupinu, termín je předvyplněný.
--
-- Kód = vr_bookings.door_code, a když není uložený, posledních 5 číslic telefonu —
-- přesně to, co /sprava/ nabízí jako kód pro Yale (doorCodeFor v sprava.js).
-- Proti hádání: max 20 neúspěšných pokusů za hodinu napříč všemi.

-- ---------- 1) TABULKY ----------
create table if not exists public.vr_fridge_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  booking_id  uuid not null references public.vr_bookings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists vr_fridge_sessions_booking_idx on public.vr_fridge_sessions(booking_id);
alter table public.vr_fridge_sessions enable row level security;
revoke all on public.vr_fridge_sessions from anon, authenticated;

create table if not exists public.vr_fridge_attempts (
  id  bigint generated always as identity primary key,
  at  timestamptz not null default now(),
  ok  boolean not null
);
create index if not exists vr_fridge_attempts_at_idx on public.vr_fridge_attempts(at);
alter table public.vr_fridge_attempts enable row level security;
revoke all on public.vr_fridge_attempts from anon, authenticated;


-- ---------- 2) INTERNÍ: kód pobytu a token → pobyt ----------
-- Normalizace: malá písmena, jen [a-z0-9] — host napíše „12 345“ i „12345“.
create or replace function public._vr_norm_code(p text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select nullif(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g'), '');
$function$;

create or replace function public._vr_booking_door_code(p_door_code text, p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(
    public._vr_norm_code(p_door_code),
    case when char_length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 5
         then right(regexp_replace(p_phone, '\D', '', 'g'), 5) end);
$function$;

-- Token z osobního odkazu (vr_bookings.token_hash) NEBO klíč relace z lednice.
-- Vrací pobyt a odkud host přišel ('link' | 'fridge').
create or replace function public._vr_token_booking(p_token text)
returns table (booking_id uuid, via text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_hash  text;
begin
  if v_token = '' or char_length(v_token) > 200 then return; end if;
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  return query
    select b.id, 'link'::text
    from public.vr_bookings b
    where b.token_hash = v_hash
      and (b.expires_at is null or b.expires_at > now())
    limit 1;
  if found then return; end if;

  return query
    select s.booking_id, 'fridge'::text
    from public.vr_fridge_sessions s
    join public.vr_bookings b on b.id = s.booking_id
    where s.token_hash = v_hash
      and s.expires_at > now()
      and b.anonymized_at is null
    limit 1;
end
$function$;


-- ---------- 3) HOST: otevřít registraci kódem od dveří ----------
create or replace function public.vr_fridge_open(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code  text := public._vr_norm_code(p_code);
  v_today date := (now() at time zone 'Europe/Prague')::date;
  v_bk    record;
  v_token text;
begin
  if (select count(*) from public.vr_fridge_attempts
        where not ok and at > now() - interval '1 hour') >= 20 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;
  delete from public.vr_fridge_attempts where at < now() - interval '1 day';

  if v_code is null or char_length(v_code) < 3 or char_length(v_code) > 20 then
    insert into public.vr_fridge_attempts(ok) values (false);
    return json_build_object('ok', false, 'error', 'code_invalid');
  end if;

  -- běžící pobyt: den před příjezdem (brzký příjezd) až den odjezdu včetně
  select b.id, b.arrival, b.departure, b.last_name, b.lang into v_bk
  from public.vr_bookings b
  where b.arrival - 1 <= v_today and v_today <= b.departure
    and b.anonymized_at is null
    and (b.expires_at is null or b.expires_at > now())
    and public._vr_booking_door_code(b.door_code, b.phone) = v_code
  order by b.arrival desc
  limit 1;

  if v_bk.id is null then
    insert into public.vr_fridge_attempts(ok) values (false);
    return json_build_object('ok', false, 'error', 'code_invalid');
  end if;
  insert into public.vr_fridge_attempts(ok) values (true);

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.vr_fridge_sessions(token_hash, booking_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_bk.id,
          ((v_bk.departure + 1)::timestamp at time zone 'Europe/Prague'));
  delete from public.vr_fridge_sessions where expires_at < now() - interval '7 days';

  return json_build_object('ok', true, 'token', v_token,
    'booking', json_build_object('arrival', v_bk.arrival, 'departure', v_bk.departure,
                                 'last_name', v_bk.last_name, 'lang', v_bk.lang));
end
$function$;


-- ---------- 4) HOST: registrace osob — odkaz i lednice ----------
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
  v_first  text := btrim(coalesce(p_first, ''));
  v_last   text := btrim(coalesce(p_last, ''));
  v_cit    text := upper(btrim(coalesce(p_citizenship, 'CZ')));
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_city   text := btrim(coalesce(p_res_city, ''));
  v_rescnt text := upper(btrim(coalesce(p_res_country, '')));
  v_tb     record;
  v_bk     record;
begin
  if btrim(coalesce(p_token, '')) = '' then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  select * into v_tb from public._vr_token_booking(p_token);
  if v_tb.booking_id is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;
  select b.id, b.arrival, b.departure into v_bk from public.vr_bookings b where b.id = v_tb.booking_id;

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
    v_first, v_last, p_birth, v_cit, v_doc, v_city, v_rescnt, p_from, p_to, v_tb.via);
end
$function$;

create or replace function public.vr_persons_list(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bk   uuid;
  v_rows json;
begin
  if btrim(coalesce(p_token, '')) = '' then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  select booking_id into v_bk from public._vr_token_booking(p_token);
  if v_bk is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;

  -- číslo dokladu se NEVRACÍ, jen doc_filled; created_at jen k řazení
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

create or replace function public.vr_persons_delete(p_token text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bk  uuid;
  v_del int;
begin
  if btrim(coalesce(p_token, '')) = '' then
    return json_build_object('ok', false, 'error', 'token_required');
  end if;
  if p_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  select booking_id into v_bk from public._vr_token_booking(p_token);
  if v_bk is null then
    return json_build_object('ok', false, 'error', 'token_invalid');
  end if;

  -- nahlášenou osobu už ne (evidence se uchovává 6 let)
  if exists (select 1 from public.vr_persons
              where id = p_id and booking_id = v_bk and ubyport_report_id is not null) then
    return json_build_object('ok', false, 'error', 'already_reported');
  end if;

  with d as (
    delete from public.vr_persons
    where id = p_id and booking_id = v_bk
    returning 1)
  select count(*) into v_del from d;

  return json_build_object('ok', true, 'deleted', (v_del > 0));
end
$function$;

-- Stará lednicová cesta bez kódu: zavřená. Funkce zůstává, aby stará stránka
-- v mezipaměti dostala srozumitelnou chybu místo 404.
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
language sql
security definer
set search_path to 'public'
as $function$
  select json_build_object('ok', false, 'error', 'code_required');
$function$;


-- ---------- GRANTy ----------
revoke all on function public._vr_token_booking(text) from public, anon, authenticated;
revoke all on function public._vr_booking_door_code(text, text) from public, anon, authenticated;
revoke all on function public._vr_norm_code(text) from public, anon, authenticated;
grant execute on function public.vr_fridge_open(text) to anon, authenticated;
grant execute on function public.vr_persons_add(text,text,text,date,text,text,text,text,date,date) to anon, authenticated;
grant execute on function public.vr_persons_list(text) to anon, authenticated;
grant execute on function public.vr_persons_delete(text, uuid) to anon, authenticated;
grant execute on function public.vr_persons_add_by_date(text,text,date,text,text,text,text,date,date) to anon, authenticated;

notify pgrst, 'reload schema';
