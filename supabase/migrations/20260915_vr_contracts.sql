-- =====================================================================
-- Ubytovací smlouvy (vr_contracts) — generátor smluv /smlouvy/
-- ---------------------------------------------------------------------
-- Do 9/2026 vznikala každá smlouva jako ručně psaný HTML soubor na Disku
-- (podle té předchozí) a PDF z něj dělal headless Chrome. Tohle je „nová
-- generace": smlouva se skládá z dat (host, termín, cena, splátky, faktura)
-- podle jedné šablony (smlouvy/smlouva-sablona.js) a ukládá se sem i s
-- vykresleným HTML — archiv, ze kterého jde PDF kdykoliv znovu vytisknout.
--
-- Vazby:
--   booking_id → vr_bookings (host, token, zprávy)   — volitelná
--   hold_id    → vr_holds    (zálohová faktura, platba, blokace termínu) — volitelná
-- Smlouva sama termín NEBLOKUJE — to dělá hold. /smlouvy/ proto při vystavení
-- smlouvy zakládá i hold (vr_admin_upsert_hold), pokud ještě neexistuje.
--
-- ⚠️ `data` i `html` obsahují PII hosta. Nikdy ven bez admin klíče.
-- =====================================================================

create table if not exists public.vr_contracts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  booking_id   uuid,
  hold_id      uuid,

  contract_no  text not null,                 -- VR-RRRR-MM-XXX
  lang         text not null default 'cs' check (lang in ('cs','de','en')),
  status       text not null default 'draft' check (status in ('draft','issued','cancelled')),

  -- denormalizované pro výpis (bez rozbalování jsonb)
  arrival      date not null,
  departure    date not null,
  guest_name   text,
  price        numeric(12,2),                -- cena za pronájem v CZK
  currency     text not null default 'CZK' check (currency in ('CZK','EUR')),
  plan         text not null default 'single' check (plan in ('single','split')),

  data         jsonb not null default '{}'::jsonb,   -- všechny vstupy šablony
  html         text,                                  -- vykreslená smlouva (snapshot)
  issued_at    timestamptz,

  constraint vr_contracts_dates_chk check (departure > arrival)
);

comment on table public.vr_contracts is
  'Ubytovací smlouvy přímých hostů — data + vykreslené HTML. Generuje /smlouvy/.';

create unique index if not exists vr_contracts_no_idx on public.vr_contracts (contract_no);
create index if not exists vr_contracts_arrival_idx on public.vr_contracts (arrival);

alter table public.vr_contracts enable row level security;
revoke all on public.vr_contracts from anon, authenticated;


-- ---------- výpis (bez html — to se tahá zvlášť) ----------
create or replace function public.vr_admin_list_contracts(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by arrival desc, created_at desc), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id',          c.id,
      'created_at',  c.created_at,
      'updated_at',  c.updated_at,
      'booking_id',  c.booking_id,
      'hold_id',     c.hold_id,
      'contract_no', c.contract_no,
      'lang',        c.lang,
      'status',      c.status,
      'arrival',     c.arrival,
      'departure',   c.departure,
      'guest_name',  c.guest_name,
      'price',       c.price,
      'currency',    c.currency,
      'plan',        c.plan,
      'data',        c.data,
      'issued_at',   c.issued_at,
      'has_html',    (c.html is not null)
    ) as row, c.arrival, c.created_at
    from public.vr_contracts c
    where c.departure >= current_date - interval '24 months'
  ) s;

  return json_build_object('ok', true, 'contracts', v_rows);
end
$function$;


-- ---------- jedna smlouva včetně html ----------
create or replace function public.vr_admin_get_contract(p_admin_key text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.vr_contracts;
begin
  perform public._vr_admin_auth(p_admin_key);
  select * into v_row from public.vr_contracts where id = p_id;
  if v_row.id is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  return json_build_object('ok', true, 'contract', json_build_object(
    'id', v_row.id, 'contract_no', v_row.contract_no, 'lang', v_row.lang,
    'status', v_row.status, 'arrival', v_row.arrival, 'departure', v_row.departure,
    'guest_name', v_row.guest_name, 'price', v_row.price, 'currency', v_row.currency,
    'plan', v_row.plan, 'data', v_row.data, 'html', v_row.html,
    'booking_id', v_row.booking_id, 'hold_id', v_row.hold_id,
    'issued_at', v_row.issued_at, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at));
end
$function$;


-- ---------- založení / úprava ----------
-- p_id NULL => nová. Číslo smlouvy musí být unikátní (index) — kolize vrací
-- 'contract_no_taken', klient si přidá pořadové číslo.
create or replace function public.vr_admin_upsert_contract(
  p_admin_key   text,
  p_id          uuid,
  p_contract_no text,
  p_lang        text,
  p_status      text,
  p_arrival     date,
  p_departure   date,
  p_guest_name  text,
  p_price       numeric,
  p_currency    text,
  p_plan        text,
  p_data        jsonb,
  p_html        text,
  p_booking_id  uuid default null,
  p_hold_id     uuid default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id     uuid := p_id;
  v_no     text := nullif(btrim(coalesce(p_contract_no, '')), '');
  v_lang   text := coalesce(nullif(btrim(p_lang), ''), 'cs');
  v_status text := coalesce(nullif(btrim(p_status), ''), 'draft');
  v_cur    text := coalesce(nullif(btrim(p_currency), ''), 'CZK');
  v_plan   text := coalesce(nullif(btrim(p_plan), ''), 'single');
begin
  perform public._vr_admin_auth(p_admin_key);

  if v_no is null or char_length(v_no) > 40 then
    return json_build_object('ok', false, 'error', 'contract_no_invalid');
  end if;
  if p_arrival is null or p_departure is null or p_departure <= p_arrival then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if v_lang not in ('cs','de','en') then return json_build_object('ok', false, 'error', 'lang_invalid'); end if;
  if v_status not in ('draft','issued','cancelled') then return json_build_object('ok', false, 'error', 'status_invalid'); end if;
  if v_cur not in ('CZK','EUR') then return json_build_object('ok', false, 'error', 'currency_invalid'); end if;
  if v_plan not in ('single','split') then return json_build_object('ok', false, 'error', 'plan_invalid'); end if;
  if p_html is not null and char_length(p_html) > 400000 then
    return json_build_object('ok', false, 'error', 'html_too_long');
  end if;

  if exists (select 1 from public.vr_contracts where contract_no = v_no and (v_id is null or id <> v_id)) then
    return json_build_object('ok', false, 'error', 'contract_no_taken');
  end if;

  if v_id is null then
    insert into public.vr_contracts(
      contract_no, lang, status, arrival, departure, guest_name, price, currency, plan,
      data, html, booking_id, hold_id,
      issued_at)
    values (
      v_no, v_lang, v_status, p_arrival, p_departure, nullif(btrim(coalesce(p_guest_name,'')),''),
      p_price, v_cur, v_plan, coalesce(p_data, '{}'::jsonb), p_html, p_booking_id, p_hold_id,
      case when v_status = 'issued' then now() else null end)
    returning id into v_id;
  else
    update public.vr_contracts set
      contract_no = v_no,
      lang        = v_lang,
      status      = v_status,
      arrival     = p_arrival,
      departure   = p_departure,
      guest_name  = nullif(btrim(coalesce(p_guest_name,'')),''),
      price       = p_price,
      currency    = v_cur,
      plan        = v_plan,
      data        = coalesce(p_data, '{}'::jsonb),
      html        = p_html,
      booking_id  = p_booking_id,
      hold_id     = p_hold_id,
      -- datum vystavení se nastaví jednou; návrat do draftu ho nemaže (historie)
      issued_at   = case when v_status = 'issued' then coalesce(issued_at, now()) else issued_at end,
      updated_at  = now()
    where id = v_id;
    if not found then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  return json_build_object('ok', true, 'id', v_id);
end
$function$;


-- ---------- smazání ----------
create or replace function public.vr_admin_delete_contract(p_admin_key text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  delete from public.vr_contracts where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  return json_build_object('ok', true);
end
$function$;


-- ---------- granty ----------
-- anon smí volat, ale bez správného admin klíče nic nedostane (_vr_admin_auth).
grant execute on function public.vr_admin_list_contracts(text) to anon, authenticated;
grant execute on function public.vr_admin_get_contract(text, uuid) to anon, authenticated;
grant execute on function public.vr_admin_upsert_contract(text, uuid, text, text, text, date, date, text, numeric, text, text, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function public.vr_admin_delete_contract(text, uuid) to anon, authenticated;

-- Po aplikaci: notify pgrst, 'reload schema';  (jinak PostgREST vrací 404)
