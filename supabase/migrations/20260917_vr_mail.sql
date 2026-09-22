-- Villa Rudolf — došlá pošta k rezervacím (vr_mail)
--
-- PROČ: kalendářové feedy nenesou žádné údaje o hostovi (Booking „CLOSED", Airbnb
-- „Reserved"), takže jméno, číslo rezervace a kontakt se do /sprava/ opisovaly ručně —
-- a většinou neopsaly (17. 9. 2026: číslo rezervace má 5 pobytů z 31, e-mail 9).
-- Ty údaje přitom chodí majiteli e-mailem. n8n (`n8n/VrMailIngest`) poštu přečte,
-- naparsuje a pošle sem; tahle migrace rozhoduje, ke kterému pobytu patří, a doplní je.
--
-- ZMAPOVÁNO 17. 9. 2026 na skutečných e-mailech (co která platforma opravdu posílá):
--   Booking „Nová rezervace!"   číslo rezervace + den příjezdu, nic víc
--   Booking zpráva hosta         jméno, příjezd, odjezd, číslo, zástupný e-mail @guest.booking.com
--   FeWo/Vrbo                    jméno, termín, počet osob, číslo HA-…, u žádosti i cena a výplata
--   e-chalupy poptávka           jméno, telefon, e-mail, POPTANÝ termín (sjednaný bývá jiný)
--   Airbnb                       potvrzení do schránky nechodí — nic
--
-- PRAVIDLA, na kterých to stojí:
--   * JEN DOPLŇOVAT PRÁZDNÁ POLE. Co majitel zapsal ručně, se nikdy nepřepíše.
--     Počty osob a jazyk se nedoplňují vůbec — mají v tabulce výchozí hodnotu
--     (2 dospělí, 'de'), takže nejde poznat, jestli je někdo vyplnil.
--   * AMBIGUITA SE NEHÁDÁ. Víc kandidátů = e-mail čeká na kliknutí v /sprava/.
--     Stejná zásada jako u plateb: doplnit kontakt k cizímu pobytu je horší než počkat.
--   * POBYTY SE NEZAKLÁDAJÍ. Pobyt vzniká v /sprava/ z kalendáře (kvůli `uidh`);
--     pobyt založený z e-mailu by uidh neměl a po příchodu feedu by byl v adminu dvakrát.
--     Nespárovaný e-mail se proto zkouší znovu při každém běhu — jakmile pobyt vznikne,
--     údaje se dotáhnou samy. Totéž řeší e-chalupy: poptávka přijde týdny před pobytem.
--   * KAŽDÁ ZMĚNA JE V LOGU: `filled` říká, která pole se kdy a kam doplnila.
--   * p_write = false je ZKUŠEBNÍ REŽIM: spáruje a do `proposed` napíše, co BY doplnil,
--     ale na vr_bookings nesáhne. První ostré běhy mají běžet takhle (stejný postup jako
--     AUTOCONFIRM u plateb) — parsery jsou postavené na jednom vzorku z každé platformy.
--   * Cena se ukládá jen sem (vr_bookings cenu nemá; pravdu o tržbách drží owner.html
--     kalendáře). V /sprava/ se ukáže u pobytu jako informace z e-mailu.
--
-- BEZPEČNOST:
--   * vr_ingest_mail: grant JEN service_role (n8n), žádné sdílené heslo — viz poučení
--     z vr_purge_expired (20260908_vr_purge_lockdown.sql).
--   * Tabulka má RLS bez policy, anon/authenticated nemají nic; ven jde jen přes admin RPC.
--   * Obsah e-mailu je NEDŮVĚRYHODNÝ VSTUP. Sem dorazí jen naparsovaná pole s omezenou
--     délkou; tělo e-mailu se neukládá a nic z něj se neprovádí.
--   * PII: řádky bez pobytu se mažou po 400 dnech; u anonymizovaného pobytu se osobní
--     údaje vymažou i tady (dělá to každý běh vr_ingest_mail).

-- ---------- 1) TABULKA ----------
create table if not exists public.vr_mail (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  gmail_id        text not null unique,            -- ID zprávy v Gmailu = dedup
  received_at     timestamptz,
  platform        text not null check (platform in ('Booking.com','Fewo-direkt','E-chalupy','Airbnb')),
  kind            text not null check (kind in ('new_booking','guest_message','inquiry','booking_request','booking')),

  booking_ref     text,                            -- číslo rezervace na platformě / ID zprávy e-chalup
  first_name      text,
  last_name       text,
  phone           text,
  email           text,
  arrival         date,
  departure       date,
  adults          int,
  children        int,
  price           numeric(12,2),                   -- co platí host (bez poplatku platformy hostovi)
  payout          numeric(12,2),                   -- odhad výplaty majiteli
  currency        text check (currency in ('CZK','EUR')),
  incomplete      text,                            -- co parser nepřečetl (popisky polí, ne obsah)

  matched_booking uuid references public.vr_bookings(id) on delete set null,
  matched_how     text check (matched_how in ('ref','term','term_any','contact','ruka')),
  matched_at      timestamptz,
  proposed        text[] not null default '{}',    -- zkušební režim: co BY se doplnilo
  filled          text[] not null default '{}',    -- co se opravdu doplnilo
  applied_at      timestamptz,
  ignored_at      timestamptz,
  note            text
);

comment on table public.vr_mail is
  'Údaje o hostech vyčtené z e-mailů platforem (n8n VrMailIngest). PII — nikdy se nepublikuje.';

create index if not exists vr_mail_open_idx on public.vr_mail (received_at desc)
  where applied_at is null and ignored_at is null;
create index if not exists vr_mail_booking_idx on public.vr_mail (matched_booking);

alter table public.vr_mail enable row level security;
revoke all on public.vr_mail from anon, authenticated;


-- ---------- 2) PÁROVÁNÍ: ke kterému pobytu e-mail patří ----------
-- Vrací id pobytu a způsob, nebo NULL. Žebříček:
--   ref       číslo rezervace už u pobytu je a sedí
--   term      stejná platforma + příjezd (+ odjezd, když ho e-mail nese), JEDINÝ kandidát
--   term_any  přesný příjezd i odjezd bez ohledu na platformu, JEDINÝ kandidát a příjmení
--             nekoliduje (poptávka z FeWo, která skončila přímým prodejem)
--   contact   e-chalupy: poptaný termín ≠ sjednaný, páruje se příjmením (+ jménem, když
--             ho pobyt má) mezi budoucími pobyty „E-chalupy" a „Přímá", JEDINÝ kandidát
create or replace function public._vr_mail_match(p_mail public.vr_mail, out o_booking uuid, out o_how text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  o_booking := null; o_how := null;

  if p_mail.booking_ref is not null and p_mail.kind <> 'inquiry' then
    select id into o_booking from public.vr_bookings
     where booking_ref = p_mail.booking_ref and anonymized_at is null;
    if o_booking is not null then o_how := 'ref'; return; end if;
  end if;

  if p_mail.kind = 'inquiry' then
    if p_mail.last_name is null then return; end if;
    select count(*), (array_agg(id))[1] into v_n, o_booking
      from public.vr_bookings b
     where b.anonymized_at is null
       and lower(coalesce(b.platform,'')) in ('e-chalupy','přímá')
       and b.departure >= coalesce(p_mail.received_at::date, current_date)
       and lower(btrim(b.last_name)) = lower(btrim(p_mail.last_name))
       and (b.first_name is null or p_mail.first_name is null
            or lower(btrim(b.first_name)) = lower(btrim(p_mail.first_name)));
    if v_n = 1 then o_how := 'contact'; else o_booking := null; end if;
    return;
  end if;

  if p_mail.arrival is null then return; end if;

  select count(*), (array_agg(id))[1] into v_n, o_booking
    from public.vr_bookings b
   where b.anonymized_at is null
     and lower(coalesce(b.platform,'')) = lower(p_mail.platform)
     and b.arrival = p_mail.arrival
     and (p_mail.departure is null or b.departure = p_mail.departure)
     and (b.booking_ref is null or p_mail.booking_ref is null or b.booking_ref = p_mail.booking_ref);
  if v_n = 1 then o_how := 'term'; return; end if;
  o_booking := null;
  if v_n > 1 or p_mail.departure is null then return; end if;

  select count(*), (array_agg(id))[1] into v_n, o_booking
    from public.vr_bookings b
   where b.anonymized_at is null
     and b.arrival = p_mail.arrival and b.departure = p_mail.departure
     and (b.last_name is null or p_mail.last_name is null
          or lower(btrim(b.last_name)) = lower(btrim(p_mail.last_name)));
  if v_n = 1 then o_how := 'term_any'; else o_booking := null; end if;
end
$function$;


-- ---------- 3) DOPLNĚNÍ: jen prázdná pole ----------
-- p_write = false jen spočítá, co by se doplnilo (→ proposed). Vrací seznam polí.
create or replace function public._vr_mail_apply(p_mail_id uuid, p_booking uuid, p_how text, p_write boolean)
returns text[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m  public.vr_mail;
  b  public.vr_bookings;
  f  text[] := '{}';
  v_ref_free boolean;
begin
  select * into m from public.vr_mail where id = p_mail_id;
  select * into b from public.vr_bookings where id = p_booking and anonymized_at is null for update;
  if m.id is null or b.id is null then return f; end if;

  -- číslo rezervace: poptávka e-chalup žádné nemá (ID zprávy není číslo rezervace)
  v_ref_free := m.kind <> 'inquiry' and m.booking_ref is not null
                and not exists (select 1 from public.vr_bookings where booking_ref = m.booking_ref);
  if b.booking_ref is null and v_ref_free then f := f || 'booking_ref'; end if;
  if nullif(btrim(coalesce(b.first_name,'')),'') is null and m.first_name is not null then f := f || 'first_name'; end if;
  if nullif(btrim(coalesce(b.last_name,'')),'')  is null and m.last_name  is not null then f := f || 'last_name';  end if;
  if nullif(btrim(coalesce(b.phone,'')),'')      is null and m.phone      is not null then f := f || 'phone';      end if;
  if nullif(btrim(coalesce(b.email,'')),'')      is null and m.email      is not null then f := f || 'email';      end if;

  if p_write then
    update public.vr_bookings set
      booking_ref = case when 'booking_ref' = any(f) then m.booking_ref else booking_ref end,
      first_name  = case when 'first_name'  = any(f) then m.first_name  else first_name  end,
      last_name   = case when 'last_name'   = any(f) then m.last_name   else last_name   end,
      phone       = case when 'phone'       = any(f) then m.phone       else phone       end,
      email       = case when 'email'       = any(f) then m.email       else email       end
    where id = b.id;
    update public.vr_mail set matched_booking = b.id, matched_how = p_how,
           matched_at = coalesce(matched_at, now()), filled = f, proposed = '{}', applied_at = now()
     where id = m.id;
  else
    update public.vr_mail set matched_booking = b.id, matched_how = p_how,
           matched_at = coalesce(matched_at, now()), proposed = f
     where id = m.id;
  end if;
  return f;
end
$function$;


-- ---------- 4) PŘÍJEM Z n8n (jen service_role) ----------
-- p_rows = pole objektů {gmail_id, received_at, platform, kind, booking_ref, first_name,
--   last_name, phone, email, arrival, departure, adults, children, price, payout,
--   currency, incomplete}. Vrací souhrn BEZ osobních údajů (jde do logu n8n).
create or replace function public.vr_ingest_mail(p_rows jsonb, p_write boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        jsonb;
  m        public.vr_mail;
  v_id     uuid;
  v_b      uuid;
  v_how    text;
  v_f      text[];
  v_new    int := 0;
  v_match  int := 0;
  v_fields int := 0;
  v_wait   int := 0;
  cut      constant int := 160;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'rows_invalid');
  end if;

  -- úklid PII: pobyt anonymizován → osobní údaje pryč i odsud; sirotci po 400 dnech
  update public.vr_mail ml set first_name = null, last_name = null, phone = null, email = null
    from public.vr_bookings b
   where ml.matched_booking = b.id and b.anonymized_at is not null
     and (ml.last_name is not null or ml.phone is not null or ml.email is not null or ml.first_name is not null);
  delete from public.vr_mail
   where matched_booking is null and coalesce(received_at, created_at) < now() - interval '400 days';

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'gmail_id','') = '' then continue; end if;
    begin
      insert into public.vr_mail(gmail_id, received_at, platform, kind, booking_ref,
             first_name, last_name, phone, email, arrival, departure, adults, children,
             price, payout, currency, incomplete)
      values (left(r->>'gmail_id', 64), (r->>'received_at')::timestamptz, r->>'platform', r->>'kind',
             nullif(left(btrim(coalesce(r->>'booking_ref','')), 40), ''),
             nullif(left(btrim(coalesce(r->>'first_name','')), 100), ''),
             nullif(left(btrim(coalesce(r->>'last_name','')), 100), ''),
             nullif(left(btrim(coalesce(r->>'phone','')), 40), ''),
             nullif(left(btrim(coalesce(r->>'email','')), cut), ''),
             (r->>'arrival')::date, (r->>'departure')::date,
             (r->>'adults')::int, (r->>'children')::int,
             (r->>'price')::numeric, (r->>'payout')::numeric,
             nullif(upper(coalesce(r->>'currency','')), ''),
             nullif(left(coalesce(r->>'incomplete',''), 200), ''))
      on conflict (gmail_id) do nothing
      returning id into v_id;
    exception when others then
      -- vadný řádek (nesmyslné datum, neznámá platforma) nesmí shodit celou dávku
      v_id := null;
    end;
    if v_id is not null then v_new := v_new + 1; end if;
  end loop;

  -- Páruje se VŠECHNO otevřené, ne jen dnešní dávka: pobyt mohl vzniknout až po e-mailu.
  for m in select * from public.vr_mail
            where applied_at is null and ignored_at is null and matched_how is distinct from 'ruka'
            order by received_at nulls last loop
    select o_booking, o_how into v_b, v_how from public._vr_mail_match(m);
    if v_b is null then v_wait := v_wait + 1; continue; end if;
    -- FeWo (booking_request): z e-mailu nejde poznat dotaz od potvrzené rezervace a na
    -- tentýž týden se ptá víc lidí → bez shody čísla rezervace se jen NAVRHNE k odklepnutí.
    v_f := public._vr_mail_apply(m.id, v_b, v_how,
             p_write and (m.kind <> 'booking_request' or v_how = 'ref'));
    v_match := v_match + 1;
    v_fields := v_fields + coalesce(array_length(v_f, 1), 0);
  end loop;

  return jsonb_build_object('ok', true, 'write', p_write, 'new', v_new,
    'matched', v_match, 'fields', v_fields, 'waiting', v_wait);
end
$function$;


-- ---------- 5) ADMIN: výpis, ruční přiřazení, zahození ----------
create or replace function public.vr_admin_list_mail(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  return json_build_object('ok', true, 'mail', coalesce((
    select json_agg(row_to_json(t) order by t.received_at desc nulls last)
      from (select id, received_at, platform, kind, booking_ref, first_name, last_name,
                   phone, email, arrival, departure, adults, children, price, payout,
                   currency, incomplete, matched_booking, matched_how, proposed, filled,
                   applied_at, ignored_at, note
              from public.vr_mail
             where coalesce(received_at, created_at) > now() - interval '400 days') t
  ), '[]'::json));
end
$function$;

-- Ruční přiřazení / odklepnutí návrhu. Platí totéž co pro automat: jen prázdná pole.
create or replace function public.vr_admin_apply_mail(p_admin_key text, p_mail_id uuid, p_booking_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_how text;
  v_f   text[];
begin
  perform public._vr_admin_auth(p_admin_key);
  if not exists (select 1 from public.vr_mail where id = p_mail_id) then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from public.vr_bookings where id = p_booking_id and anonymized_at is null) then
    return json_build_object('ok', false, 'error', 'booking_not_found');
  end if;
  select case when matched_booking = p_booking_id and matched_how is not null
              then matched_how else 'ruka' end into v_how
    from public.vr_mail where id = p_mail_id;
  v_f := public._vr_mail_apply(p_mail_id, p_booking_id, v_how, true);
  return json_build_object('ok', true, 'filled', v_f);
end
$function$;

create or replace function public.vr_admin_ignore_mail(p_admin_key text, p_mail_id uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  update public.vr_mail set ignored_at = now(), note = nullif(left(btrim(coalesce(p_note,'')), 300), '')
   where id = p_mail_id;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  return json_build_object('ok', true);
end
$function$;


-- ---------- 6) OPRÁVNĚNÍ ----------
revoke all on function public._vr_mail_match(public.vr_mail) from public, anon, authenticated;
revoke all on function public._vr_mail_apply(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.vr_ingest_mail(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.vr_ingest_mail(jsonb, boolean) to service_role;
grant execute on function public.vr_admin_list_mail(text) to anon, authenticated;
grant execute on function public.vr_admin_apply_mail(text, uuid, uuid) to anon, authenticated;
grant execute on function public.vr_admin_ignore_mail(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
