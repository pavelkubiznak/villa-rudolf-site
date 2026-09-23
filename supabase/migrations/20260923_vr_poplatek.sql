-- Villa Rudolf — místní poplatek z pobytu a evidenční kniha
-- =========================================================
-- Svoboda nad Úpou, OZV č. 2/2023 (účinná od 1. 1. 2024), ověřeno 23. 9. 2026:
--   * sazba 25 Kč za každý započatý den pobytu, s výjimkou dne počátku (= za noc),
--   * předmětem je úplatný pobyt nejvýše 60 po sobě jdoucích dnů,
--   * poplatník = osoba, která v obci není přihlášená,
--   * osvobození JEN podle zákona (§ 3b zák. 565/1990 Sb.) — senioři osvobození NEMAJÍ,
--   * odvod za uplynulé kalendářní pololetí do 20. dne následujícího pololetí
--     (tj. do 20. 7. a do 20. 1.).
-- Evidenční kniha (§ 3g): den počátku a konce, jméno, adresa, datum narození,
-- číslo A DRUH průkazu totožnosti, výše vybraného poplatku nebo důvod osvobození.
-- Uchovává se 6 let.
--
-- Dřív /sprava/ počítala „dospělí k datu příjezdu × noci × 25 Kč“, sazba byla
-- natvrdo na třech místech a registrace nesbírala adresu, druh dokladu ani důvod
-- osvobození. Tahle migrace počítá poplatek po osobách a po dnech (host, který
-- během pobytu dovrší 18 let, platí jen dny po narozeninách).

-- ---------- 1) OSOBY: chybějící údaje evidenční knihy ----------
alter table public.vr_persons add column if not exists residence_street text;
alter table public.vr_persons add column if not exists doc_type text;          -- ID | P | O
alter table public.vr_persons add column if not exists fee_exempt text;        -- viz check
alter table public.vr_persons add column if not exists fee_exempt_note text;

do $$ begin
  alter table public.vr_persons add constraint vr_persons_doc_type_chk
    check (doc_type is null or doc_type in ('ID', 'P', 'O'));
exception when duplicate_object then null; end $$;
-- ztp      § 3b odst. 1 a) nevidomý, závislý na pomoci, držitel ZTP/P a jeho průvodce (host sám)
-- resident osoba přihlášená v obci — není poplatník (§ 3)            (jen majitel)
-- other    jiný zákonný důvod § 3b, popis v fee_exempt_note          (jen majitel)
do $$ begin
  alter table public.vr_persons add constraint vr_persons_fee_exempt_chk
    check (fee_exempt is null or fee_exempt in ('ztp', 'resident', 'other'));
exception when duplicate_object then null; end $$;


-- ---------- 2) SAZBA s platností od data ----------
-- Obec může sazbu změnit vyhláškou; stará pololetí se musí počítat starou sazbou.
create table if not exists public.vr_fee_rates (
  valid_from date primary key,
  rate_czk   int not null check (rate_czk between 0 and 50),   -- zákonné maximum 50 Kč
  source     text
);
alter table public.vr_fee_rates enable row level security;
revoke all on public.vr_fee_rates from anon, authenticated;
insert into public.vr_fee_rates(valid_from, rate_czk, source)
values ('2024-01-01', 25, 'OZV Svoboda nad Úpou č. 2/2023, čl. 5')
on conflict (valid_from) do nothing;

create or replace function public.vr_fee_rate(p_day date)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select rate_czk from public.vr_fee_rates where valid_from <= p_day
  order by valid_from desc limit 1;
$function$;


-- ---------- 3) VÝPOČET za osobu ----------
-- Dny poplatku = každý den pobytu kromě dne příjezdu (stay_from+1 … stay_to).
-- Volitelné okno (p_win_from..p_win_to) ořízne dny na pololetí pro odvod.
-- Chybí-li datum narození, počítá se jako dospělý (radši vybrat než nevybrat)
-- a vrací se missing_birth, ať se to doplní.
create or replace function public._vr_person_fee(
  p_from date, p_to date, p_birth date, p_exempt text,
  p_win_from date default null, p_win_to date default null
) returns json
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_day   date;
  v_days  int := 0;   -- dny poplatku v okně
  v_paid  int := 0;   -- z toho placené
  v_minor int := 0;   -- z toho osvobozené věkem
  v_czk   int := 0;
  v_rate  int;
  v_reason text;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return json_build_object('days', 0, 'paid_days', 0, 'czk', 0, 'reason', null, 'missing_birth', p_birth is null);
  end if;
  -- pobyt nad 60 po sobě jdoucích dnů není předmětem poplatku (čl. 2 odst. 1)
  if p_to - p_from > 60 then
    return json_build_object('days', 0, 'paid_days', 0, 'czk', 0, 'reason', 'over60', 'missing_birth', p_birth is null);
  end if;

  v_day := p_from + 1;
  while v_day <= p_to loop
    if (p_win_from is null or v_day >= p_win_from) and (p_win_to is null or v_day <= p_win_to) then
      v_days := v_days + 1;
      if p_exempt is not null then
        null;
      elsif p_birth is not null and v_day < (p_birth + interval '18 years')::date then
        v_minor := v_minor + 1;
      else
        v_rate := coalesce(public.vr_fee_rate(v_day), 0);
        v_paid := v_paid + 1;
        v_czk := v_czk + v_rate;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  v_reason := case
    when p_exempt is not null then p_exempt
    when v_minor > 0 and v_paid = 0 then 'under18'
    when v_minor > 0 then 'under18_part'
  end;
  return json_build_object('days', v_days, 'paid_days', v_paid, 'czk', v_czk,
                           'reason', v_reason, 'missing_birth', p_birth is null);
end
$function$;


-- ---------- 4) SOUHRN POBYTU (+ poplatek) ----------
create or replace function public._vr_booking_person_stats(p_booking uuid, p_arrival date)
returns json
language sql
security definer
set search_path to 'public'
as $function$
  with p as (
    select *, public._vr_person_fee(stay_from, stay_to, birth_date, fee_exempt) as fee
    from public.vr_persons where booking_id = p_booking
  )
  select json_build_object(
    'registered',   count(*),
    'adults',       count(*) filter (
                      where birth_date is null
                         or birth_date <= (p_arrival - interval '18 years')),
    'children',     count(*) filter (
                      where birth_date is not null
                        and birth_date >  (p_arrival - interval '18 years')),
    'foreigners',   count(*) filter (where citizenship <> 'CZ'),
    'missing_doc',  count(*) filter (where doc_number is null),
    'foreign_unreported', count(*) filter (where citizenship <> 'CZ' and ubyport_report_id is null),
    'uby_deadline', min(public.vr_ubyport_deadline(stay_from))
                      filter (where citizenship <> 'CZ' and ubyport_report_id is null),
    'arrival_deadline', public.vr_ubyport_deadline(p_arrival),
    'fee_czk',      coalesce(sum((fee->>'czk')::int), 0),
    'fee_paid_days', coalesce(sum((fee->>'paid_days')::int), 0),
    'fee_exempt',   count(*) filter (where fee->>'reason' in ('ztp', 'resident', 'other', 'under18', 'over60')),
    'missing_birth', count(*) filter (where birth_date is null)
  )
  from p;
$function$;


-- ---------- 5) ADMIN: osoby (+ adresa, druh dokladu, poplatek) ----------
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
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'birth_date', p.birth_date,
    'citizenship', p.citizenship,
    'doc_number', p.doc_number,           -- majitel je správce údajů (Ubyport, evidenční kniha)
    'doc_type', p.doc_type,
    'residence_street', p.residence_street,
    'residence_city', p.residence_city,
    'residence_country', p.residence_country,
    'stay_from', p.stay_from,
    'stay_to', p.stay_to,
    'source', p.source,
    'created_at', p.created_at,
    'ubyport_report_id', p.ubyport_report_id,
    'ubyport_sent_at', r.sent_at,
    'ubyport_deadline', case when p.citizenship <> 'CZ'
                             then public.vr_ubyport_deadline(p.stay_from) end,
    'fee_exempt', p.fee_exempt,
    'fee_exempt_note', p.fee_exempt_note,
    'fee', public._vr_person_fee(p.stay_from, p.stay_to, p.birth_date, p.fee_exempt)
  ) order by p.created_at), '[]'::json) into v_rows
  from public.vr_persons p
  left join public.vr_ubyport_reports r on r.id = p.ubyport_report_id
  where p.booking_id = p_booking_id;

  return json_build_object('ok', true, 'persons', v_rows);
end
$function$;


-- ---------- 6) ADMIN: osvobození osoby ----------
create or replace function public.vr_admin_person_exempt(
  p_admin_key text, p_person_id uuid, p_reason text, p_note text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reason text := nullif(lower(btrim(coalesce(p_reason, ''))), '');
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_upd    int;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_person_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  if v_reason is not null and v_reason not in ('ztp', 'resident', 'other') then
    return json_build_object('ok', false, 'error', 'reason_invalid');
  end if;
  if v_reason = 'other' and v_note is null then
    return json_build_object('ok', false, 'error', 'note_required');
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  update public.vr_persons set fee_exempt = v_reason, fee_exempt_note = case when v_reason is null then null else v_note end
  where id = p_person_id;
  get diagnostics v_upd = row_count;
  return json_build_object('ok', v_upd > 0);
end
$function$;


-- ---------- 7) ADMIN: evidenční kniha + odvod za období ----------
-- Osoby, jejichž dny poplatku padají do období (typicky pololetí). U každé
-- všechny údaje § 3g; czk = poplatek za dny v období, tedy i pobyt přes
-- 30. 6. / 1. 7. se rozdělí správně.
create or replace function public.vr_admin_fee_report(p_admin_key text, p_from date, p_to date)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 370 then
    return json_build_object('ok', false, 'error', 'period_invalid');
  end if;

  with x as (
    select p.*, b.first_name as b_first, b.last_name as b_last,
           public._vr_person_fee(p.stay_from, p.stay_to, p.birth_date, p.fee_exempt, p_from, p_to) as fee
    from public.vr_persons p
    join public.vr_bookings b on b.id = p.booking_id
    where p.stay_to > p_from and p.stay_from < p_to    -- aspoň jeden den poplatku v okně
  )
  select coalesce(json_agg(json_build_object(
    'id', id, 'booking_id', booking_id,
    'booking_guest', nullif(btrim(concat_ws(' ', b_first, b_last)), ''),
    'stay_from', stay_from, 'stay_to', stay_to,
    'first_name', first_name, 'last_name', last_name,
    'birth_date', birth_date,
    'residence_street', residence_street, 'residence_city', residence_city,
    'residence_country', residence_country, 'citizenship', citizenship,
    'doc_type', doc_type, 'doc_number', doc_number,
    'fee_exempt', fee_exempt, 'fee_exempt_note', fee_exempt_note,
    'days', (fee->>'days')::int, 'paid_days', (fee->>'paid_days')::int,
    'czk', (fee->>'czk')::int, 'reason', fee->>'reason'
  ) order by stay_from, booking_id, created_at), '[]'::json) into v_rows
  from x
  where (fee->>'days')::int > 0 or fee->>'reason' = 'over60';

  return json_build_object('ok', true, 'from', p_from, 'to', p_to, 'rows', v_rows,
    'total_czk', (select coalesce(sum((r->>'czk')::int), 0) from json_array_elements(v_rows) r),
    'rate_czk', public.vr_fee_rate(p_to));
end
$function$;


-- ---------- 7b) NASTAVENÍ: klíče fee_* (záznam o odvodu za pololetí) ----------
-- fee_odvod_RRRR_1 / _2 = datum, kdy majitel poplatek za pololetí odvedl městu.
create or replace function public.vr_admin_get_config(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v json;
begin
  perform public._vr_admin_auth(p_admin_key);
  select coalesce(json_object_agg(k, v), '{}'::json) into v
  from public.vr_admin_config
  where k ~ '^(ubyport|wifi|fee)_';   -- whitelist: jen konfigurace ubytovatele
  return json_build_object('ok', true, 'config', v);
end
$function$;

create or replace function public.vr_admin_set_config(p_admin_key text, p_key text, p_value text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text := btrim(coalesce(p_key, ''));
  v_val text := btrim(coalesce(p_value, ''));
begin
  perform public._vr_admin_auth(p_admin_key);
  if v_key !~ '^(ubyport|wifi|fee)_[a-z0-9_]+$' then
    return json_build_object('ok', false, 'error', 'key_not_allowed');
  end if;
  if char_length(v_key) > 40 or char_length(v_val) > 200 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  if v_val = '' then
    delete from public.vr_admin_config where k = v_key;
  else
    insert into public.vr_admin_config(k, v) values (v_key, v_val)
    on conflict (k) do update set v = excluded.v;
  end if;
  return json_build_object('ok', true);
end
$function$;


-- ---------- 8) HOST: registrace s adresou, druhem dokladu a osvobozením ----------
-- Nové parametry mají DEFAULT, takže stará stránka v mezipaměti (bez nich) volá
-- dál tutéž funkci. Staré přetížení se musí zahodit, jinak má PostgREST dvě
-- kandidátní funkce a vrací chybu.
drop function if exists public.vr_persons_add(text,text,text,date,text,text,text,text,date,date);
drop function if exists public._vr_persons_insert(uuid,date,date,text,text,date,text,text,text,text,date,date,text);

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
  p_source    text,
  p_street    text default null,
  p_doc_type  text default null,
  p_exempt    text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_street text := nullif(btrim(coalesce(p_street, '')), '');
  v_dtype  text := nullif(upper(btrim(coalesce(p_doc_type, ''))), '');
  v_exempt text := nullif(lower(btrim(coalesce(p_exempt, ''))), '');
  v_rescnt text := p_rescnt;
  v_adult  boolean;
  v_id     uuid;
begin
  if p_first = '' then return json_build_object('ok', false, 'error', 'first_required'); end if;
  if p_last  = '' then return json_build_object('ok', false, 'error', 'last_required');  end if;

  if char_length(p_first) > 100 or char_length(p_last) > 100
     or char_length(p_city) > 120 or char_length(v_doc) > 40
     or char_length(coalesce(v_street, '')) > 150 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;

  if p_cit !~ '^[A-Z]{2}$' then
    return json_build_object('ok', false, 'error', 'citizenship_invalid');
  end if;

  -- datum narození: povinné (§ 3g odst. 2 c) a rozumný rozsah
  if p_birth is null then
    return json_build_object('ok', false, 'error', 'birth_required');
  end if;
  if p_birth > current_date or p_birth < date '1900-01-01' then
    return json_build_object('ok', false, 'error', 'birth_invalid');
  end if;

  -- pobyt: from <= to, v okně bookingu (arrival-1 .. departure+1)
  if p_from is null or p_to is null or p_from > p_to then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if p_from < p_arrival - 1 or p_to > p_departure + 1 then
    return json_build_object('ok', false, 'error', 'out_of_window');
  end if;

  -- doklad: povinný u cizinců (UbyPort) a u dospělých (evidenční kniha § 3g)
  v_adult := p_birth <= (p_from - interval '18 years')::date;
  if (p_cit <> 'CZ' or v_adult) and v_doc = '' then
    return json_build_object('ok', false, 'error', 'doc_required');
  end if;
  if v_doc <> '' and v_doc !~ '^[A-Za-z0-9-]+$' then
    return json_build_object('ok', false, 'error', 'doc_invalid');
  end if;
  if v_dtype is not null and v_dtype not in ('ID', 'P', 'O') then
    return json_build_object('ok', false, 'error', 'doc_type_invalid');
  end if;

  -- host smí sám uvést jen ZTP/P (nevidomý, závislý na pomoci, průvodce);
  -- ostatní důvody zapisuje majitel ve /sprava/
  if v_exempt is not null and v_exempt <> 'ztp' then
    return json_build_object('ok', false, 'error', 'exempt_invalid');
  end if;

  if v_rescnt !~ '^[A-Z]{2}$' then v_rescnt := p_cit; end if;

  insert into public.vr_persons(
    booking_id, first_name, last_name, birth_date, citizenship, doc_number, doc_type,
    residence_street, residence_city, residence_country, stay_from, stay_to, source, fee_exempt)
  values (
    p_booking, p_first, p_last, p_birth, p_cit, nullif(v_doc, ''), case when v_doc = '' then null else v_dtype end,
    v_street, nullif(p_city, ''), v_rescnt, p_from, p_to, p_source, v_exempt)
  returning id into v_id;

  return json_build_object(
    'ok', true, 'id', v_id,
    'person', json_build_object(
      'id', v_id, 'first_name', p_first, 'last_name', p_last,
      'citizenship', p_cit, 'stay_from', p_from, 'stay_to', p_to,
      'doc_filled', (nullif(v_doc, '') is not null)));
end
$function$;

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
  p_to          date,
  p_res_street  text default null,
  p_doc_type    text default null,
  p_fee_exempt  text default null
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
    v_first, v_last, p_birth, v_cit, v_doc, v_city, v_rescnt, p_from, p_to, v_tb.via,
    p_res_street, p_doc_type, p_fee_exempt);
end
$function$;


-- ---------- GRANTy ----------
revoke all on function public._vr_persons_insert(uuid,date,date,text,text,date,text,text,text,text,date,date,text,text,text,text) from public, anon, authenticated;
revoke all on function public._vr_person_fee(date,date,date,text,date,date) from public, anon, authenticated;
revoke all on function public._vr_booking_person_stats(uuid, date) from public, anon, authenticated;
revoke all on function public.vr_fee_rate(date) from public, anon, authenticated;
grant execute on function public.vr_persons_add(text,text,text,date,text,text,text,text,date,date,text,text,text) to anon, authenticated;
grant execute on function public.vr_admin_persons(text, uuid) to anon, authenticated;
grant execute on function public.vr_admin_person_exempt(text, uuid, text, text) to anon, authenticated;
grant execute on function public.vr_admin_fee_report(text, date, date) to anon, authenticated;
grant execute on function public.vr_admin_get_config(text) to anon, authenticated;
grant execute on function public.vr_admin_set_config(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
