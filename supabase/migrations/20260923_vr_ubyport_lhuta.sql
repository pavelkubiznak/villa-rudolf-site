-- Villa Rudolf — hlášení cizinců: záznam o odeslání a lhůta 3 pracovních dnů
-- =========================================================================
-- Ubytování cizince se hlásí policii do 3 pracovních dnů ode dne ubytování
-- (§ 102 zák. 326/1999 Sb.). Do 9/2026 systém uměl UNL soubor vyrobit, ale
-- nevěděl, jestli a kdy odešel — hlídal to jen Pavel v hlavě.
--
-- Tahle migrace přidává:
--   1) kalendář pracovních dnů ČR (víkendy + státní svátky vč. Velikonoc),
--   2) vr_ubyport_reports — jedno hlášení = jedno odeslání do UbyPortu
--      (UNL soubor, ruční formulář, později webová služba WS_UBY),
--   3) vr_persons.ubyport_report_id — kterým hlášením osoba odešla,
--   4) lhůtu a stav do souhrnu pobytu a do admin výpisu osob,
--   5) admin RPC pro „Označit jako nahlášené“ a jeho vrácení,
--   6) vr_ubyport_due() pro denní e-mail (n8n, jen service_role).
--
-- Lhůta se počítá od `stay_from` KAŽDÉ osoby, ne od příjezdu rezervace:
-- kdo z party přijede o den později, má lhůtu o den delší.
-- Den ubytování se nepočítá; příjezd v pátek → po, út, st → lhůta ve středu.

-- ---------- 1) PRACOVNÍ DNY ----------
-- Velikonoční neděle (gregoriánský výpočet, Meeus/Jones/Butcher).
create or replace function public.vr_easter_sunday(p_year int)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end
$function$;

-- Státní svátky a ostatní svátky, kdy se nepracuje (zák. 245/2000 Sb.).
-- Velký pátek je svátkem od roku 2016.
create or replace function public.vr_cz_is_workday(p_day date)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_md     text := to_char(p_day, 'MM-DD');
  v_easter date;
begin
  if extract(isodow from p_day) >= 6 then return false; end if;
  if v_md in ('01-01', '05-01', '05-08', '07-05', '07-06', '09-28',
              '10-28', '11-17', '12-24', '12-25', '12-26') then
    return false;
  end if;
  v_easter := public.vr_easter_sunday(extract(year from p_day)::int);
  if p_day = v_easter + 1 then return false; end if;                              -- Velikonoční pondělí
  if p_day = v_easter - 2 and extract(year from p_day) >= 2016 then return false; end if; -- Velký pátek
  return true;
end
$function$;

-- n-tý pracovní den PO daném dni (den samotný se nepočítá).
create or replace function public.vr_cz_add_workdays(p_day date, p_n int)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_day  date := p_day;
  v_left int  := greatest(coalesce(p_n, 0), 0);
begin
  if p_day is null then return null; end if;
  while v_left > 0 loop
    v_day := v_day + 1;
    if public.vr_cz_is_workday(v_day) then v_left := v_left - 1; end if;
  end loop;
  return v_day;
end
$function$;

-- Poslední den, kdy je hlášení ještě včas.
create or replace function public.vr_ubyport_deadline(p_stay_from date)
returns date
language sql
immutable
set search_path to 'public'
as $function$
  select public.vr_cz_add_workdays(p_stay_from, 3);
$function$;


-- ---------- 2) HLÁŠENÍ ----------
create table if not exists public.vr_ubyport_reports (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.vr_bookings(id) on delete cascade,
  sent_at     timestamptz not null default now(),   -- kdy odešlo do UbyPortu (zadává majitel)
  method      text not null,                         -- unl | form | ws
  receipt     text,                                  -- pseudorazítko / číslo potvrzení z UbyPortu
  note        text,
  persons     int not null,
  created_at  timestamptz not null default now(),
  constraint vr_ubyport_reports_method_chk check (method in ('unl', 'form', 'ws'))
);
create index if not exists vr_ubyport_reports_booking_idx on public.vr_ubyport_reports(booking_id);
alter table public.vr_ubyport_reports enable row level security;
revoke all on public.vr_ubyport_reports from anon, authenticated;

-- Retence: hlášení žije s pobytem. vr_purge_expired maže pobyty s osobami až po
-- 6 letech (povinnost uchovávat evidenci), do té doby je jen anonymizuje —
-- takže doklad o odeslání vydrží stejně dlouho jako evidence sama.
alter table public.vr_persons
  add column if not exists ubyport_report_id uuid
  references public.vr_ubyport_reports(id) on delete set null;
create index if not exists vr_persons_ubyport_idx on public.vr_persons(ubyport_report_id);


-- ---------- 3) SOUHRN POBYTU (seznam ve /sprava/) ----------
-- Původní pole beze změny, navíc stav hlášení. `arrival_deadline` je lhůta
-- podle příjezdu rezervace — platí i dřív, než se kdokoli zaregistruje.
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
    'missing_doc',  count(*) filter (where doc_number is null),
    'foreign_unreported', count(*) filter (where citizenship <> 'CZ' and ubyport_report_id is null),
    'uby_deadline', min(public.vr_ubyport_deadline(stay_from))
                      filter (where citizenship <> 'CZ' and ubyport_report_id is null),
    'arrival_deadline', public.vr_ubyport_deadline(p_arrival)
  )
  from public.vr_persons where booking_id = p_booking;
$function$;


-- ---------- 4) ADMIN: osoby k pobytu (+ stav hlášení) ----------
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
    'doc_number', p.doc_number,           -- majitel je správce údajů (Ubyport)
    'residence_city', p.residence_city,
    'residence_country', p.residence_country,
    'stay_from', p.stay_from,
    'stay_to', p.stay_to,
    'source', p.source,
    'created_at', p.created_at,
    'ubyport_report_id', p.ubyport_report_id,
    'ubyport_sent_at', r.sent_at,
    'ubyport_deadline', case when p.citizenship <> 'CZ'
                             then public.vr_ubyport_deadline(p.stay_from) end
  ) order by p.created_at), '[]'::json) into v_rows
  from public.vr_persons p
  left join public.vr_ubyport_reports r on r.id = p.ubyport_report_id
  where p.booking_id = p_booking_id;

  return json_build_object('ok', true, 'persons', v_rows);
end
$function$;


-- ---------- 5) ADMIN: označit jako nahlášené / výpis / vrátit ----------
-- p_person_ids NULL => všichni dosud nenahlášení cizinci pobytu.
-- Češi se nehlásí, proto je funkce odmítne i při výslovném výběru.
create or replace function public.vr_admin_ubyport_mark(
  p_admin_key  text,
  p_booking_id uuid,
  p_person_ids uuid[],
  p_method     text,
  p_sent_at    timestamptz,
  p_receipt    text,
  p_note       text
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_method  text := lower(btrim(coalesce(p_method, '')));
  v_receipt text := nullif(btrim(coalesce(p_receipt, '')), '');
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_sent    timestamptz := coalesce(p_sent_at, now());
  v_ids     uuid[];
  v_id      uuid;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_booking_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  if v_method not in ('unl', 'form', 'ws') then
    return json_build_object('ok', false, 'error', 'method_invalid');
  end if;
  if char_length(coalesce(v_receipt, '')) > 120 or char_length(coalesce(v_note, '')) > 500 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  -- odeslání v budoucnosti je překlep; o týden zpětně se zapisuje běžně
  if v_sent > now() + interval '10 minutes' then
    return json_build_object('ok', false, 'error', 'sent_in_future');
  end if;

  select array_agg(id) into v_ids
  from public.vr_persons
  where booking_id = p_booking_id
    and citizenship <> 'CZ'
    and ubyport_report_id is null
    and (p_person_ids is null or id = any(p_person_ids));

  if v_ids is null then
    return json_build_object('ok', false, 'error', 'nothing_to_report');
  end if;

  insert into public.vr_ubyport_reports(booking_id, sent_at, method, receipt, note, persons)
  values (p_booking_id, v_sent, v_method, v_receipt, v_note, array_length(v_ids, 1))
  returning id into v_id;

  update public.vr_persons set ubyport_report_id = v_id where id = any(v_ids);

  return json_build_object('ok', true, 'report_id', v_id, 'persons', array_length(v_ids, 1));
end
$function$;

create or replace function public.vr_admin_ubyport_reports(p_admin_key text, p_booking_id uuid)
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
    'id', id, 'sent_at', sent_at, 'method', method, 'receipt', receipt,
    'note', note, 'persons', persons, 'created_at', created_at
  ) order by sent_at), '[]'::json) into v_rows
  from public.vr_ubyport_reports where booking_id = p_booking_id;
  return json_build_object('ok', true, 'reports', v_rows);
end
$function$;

-- Oprava omylu („označil jsem špatný pobyt“). Osoby se vrátí mezi nenahlášené.
-- Skutečně odeslané hlášení UbyPort zrušit neumí — tohle mění jen náš záznam.
create or replace function public.vr_admin_ubyport_undo(p_admin_key text, p_report_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_del int;
begin
  perform public._vr_admin_auth(p_admin_key);
  if p_report_id is null then
    return json_build_object('ok', false, 'error', 'id_required');
  end if;
  -- vr_persons.ubyport_report_id má ON DELETE SET NULL
  with d as (delete from public.vr_ubyport_reports where id = p_report_id returning 1)
  select count(*) into v_del from d;
  return json_build_object('ok', true, 'deleted', (v_del > 0));
end
$function$;


-- ---------- 6) HOST: smazání osoby — nahlášenou už ne ----------
-- Host si může v registraci smazat překlep. Jakmile ale osoba odešla policii,
-- musí záznam zůstat (evidence ubytovaných se uchovává 6 let).
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


-- ---------- 7) DENNÍ E-MAIL (n8n, service_role) ----------
-- Co je potřeba nahlásit nebo dohnat. Dvě situace:
--   * cizinci zaregistrovaní, ale nenahlášení — s nejbližší lhůtou,
--   * pobyt běží a zaregistrovaných je méně, než kolik má rezervace osob
--     (nevíme, kdo z chybějících je cizinec — lhůta běží od příjezdu).
-- Vrací OBJEKT {due: [...]}, ne pole: n8n by pole rozsekal na položky a každý
-- další uzel v řetězu (Načíst pobyty) by se spustil tolikrát, kolik je řádků.
create or replace function public.vr_ubyport_due()
returns json
language sql
security definer
set search_path to 'public'
as $function$
  with s as (
    select b.id, b.first_name, b.last_name, b.arrival, b.departure,
           coalesce(b.adults, 0) + coalesce(cardinality(b.children), 0) as expected,
           count(p.id) as registered,
           count(p.id) filter (where p.citizenship <> 'CZ' and p.ubyport_report_id is null) as foreign_unreported,
           count(p.id) filter (where p.citizenship <> 'CZ' and p.ubyport_report_id is null
                                 and (p.doc_number is null or p.birth_date is null)) as missing_data,
           min(public.vr_ubyport_deadline(p.stay_from))
             filter (where p.citizenship <> 'CZ' and p.ubyport_report_id is null) as deadline
    from public.vr_bookings b
    left join public.vr_persons p on p.booking_id = b.id
    where b.anonymized_at is null
      and b.arrival <= current_date
    group by b.id
  )
  select json_build_object('due', coalesce(json_agg(json_build_object(
    'booking_id', id,
    'guest', nullif(btrim(concat_ws(' ', first_name, last_name)), ''),
    'arrival', arrival, 'departure', departure,
    'expected', expected, 'registered', registered,
    'foreign_unreported', foreign_unreported, 'missing_data', missing_data,
    'deadline', deadline,
    'arrival_deadline', public.vr_ubyport_deadline(arrival)
  ) order by coalesce(deadline, public.vr_ubyport_deadline(arrival))), '[]'::json))
  from s
  where foreign_unreported > 0
     or (current_date <= departure and registered < expected);
$function$;


-- ---------- GRANTy ----------
revoke all on function public._vr_booking_person_stats(uuid, date) from public, anon, authenticated;
grant execute on function public.vr_admin_persons(text, uuid) to anon, authenticated;
grant execute on function public.vr_admin_ubyport_mark(text, uuid, uuid[], text, timestamptz, text, text) to anon, authenticated;
grant execute on function public.vr_admin_ubyport_reports(text, uuid) to anon, authenticated;
grant execute on function public.vr_admin_ubyport_undo(text, uuid) to anon, authenticated;
grant execute on function public.vr_persons_delete(text, uuid) to anon, authenticated;
revoke all on function public.vr_ubyport_due() from public, anon, authenticated;
grant execute on function public.vr_ubyport_due() to service_role;

notify pgrst, 'reload schema';
