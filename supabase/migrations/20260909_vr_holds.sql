-- Villa Rudolf — PŘEDREZERVACE (hold) z vystavené zálohové faktury
-- ============================================================================
-- PROČ TAHLE TABULKA VŮBEC JE
-- Systém dosud poznal rezervaci jen tehdy, když ji uviděl v iCal feedu některé
-- platformy. Přímý prodej — telefon, e-mail, poptávka z e-chalup → zálohová
-- faktura — do systému nevstoupil NIKDY. Přesně tak zmizel termín 14.–21. 8. 2027:
-- faktura vystavená, uhrazená, v bance viděná — a v kalendáři po ní nezůstalo nic
-- než mrtvý jednorázový blok z Airbnb (uidh 3f05fcf7c453a6b3, ve feedu jediný běh
-- 29. 8. 2026). Web ten týden dodnes nabízí jako volný.
--
-- Spouštěčem tedy NENÍ platba, ale VYSTAVENÍ ZÁLOHOVÉ FAKTURY. Tím vzniká
-- předrezervace, která termín drží. Platba pak jen rozhoduje, jestli přežije.
--
--   PŘEDREZERVACE ── uhrazeno do splatnosti ──▶ REZERVACE (confirmed)
--                 ── neuhrazeno do hold_until ─▶ propadlá (termín se uvolní)
--
-- PROČ VLASTNÍ TABULKA A NE SLOUPEC VE vr_bookings
--   1. `vr_purge_expired` maže bookingy 30+ dní po odjezdu, které nemají zapsané
--      osoby (viz 20260724_vr_retention.sql). Přímý prodej s fakturou by se tím
--      tiše smazal i s doklady o něm. vr_holds se ho netýká.
--   2. Hold je OBCHODNÍ záznam (termín, faktura, platba), ne evidence hosta.
--      Host se doplní až po potvrzení — vazbou `booking_id` na vr_bookings.
--   3. Nemusí se sáhnout na `vr_admin_upsert_booking`. Kdyby se měnila jeho
--      signatura, rozbilo by to živé /sprava/ v okamžiku, kdy se nasadí front-end
--      dřív než migrace. Takhle je nasazení v libovolném pořadí bezpečné.
--
-- ZÁNIK HOLDU JE LÍNÝ — ŽÁDNÝ CRON
-- Propadnutí se nepočítá úlohou na pozadí, ale ČTENÍM: `vr_public_holds()` prostě
-- nevrátí hold, kterému `hold_until` uplynulo, takže se termín uvolní sám i kdyby
-- n8n týden neběžel. Řádek zůstane (status se přepíše až na kliknutí v /sprava/),
-- protože zaplatit o dva dny později je běžné a tiché smazání blokace je přesně ta
-- chyba, kterou tenhle modul řeší, jen obráceně.
--
-- BEZPEČNOST
--   * vr_holds: RLS ON, žádná policy → anon/authenticated nevidí přímo NIC.
--   * admin RPC: SECURITY DEFINER + _vr_admin_auth (hash klíče, rate-limit) — stejný
--     model jako vr_admin_list_bookings.
--   * vr_public_holds(): jediná anon funkce. Vrací POUZE {uidh,start,end,kind,
--     holdUntil} — žádné jméno, kontakt, částku ani číslo faktury. Výstup jde do
--     VEŘEJNÉHO data/history.json, takže se sem nesmí přidat nic dalšího.

-- ---------- 1) TABULKA ----------
create table if not exists public.vr_holds (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- termín, který se drží (konvence [arrival, departure) jako všude jinde:
  -- departure = den odjezdu, poslední obsazená noc je z departure−1 na departure)
  arrival          date not null,
  departure        date not null,

  status           text not null default 'hold'
                     check (status in ('hold','confirmed','expired','cancelled')),
  -- do kdy hold drží termín = splatnost + grace (víkend, převod mezi bankami).
  -- NULL u confirmed (drží napořád), povinné u status='hold' (viz check níž).
  hold_until       date,

  channel          text,          -- odkud poptávka přišla: Přímá / E-chalupy / Telefon…
  guest_note       text,          -- interní poznámka k hostovi (PII — NIKDY ven)

  -- zálohová faktura
  invoice_no       text,
  invoice_amount   numeric(12,2),
  invoice_currency text check (invoice_currency in ('CZK','EUR')),
  invoice_issued   date,
  invoice_due      date,
  -- na který účet faktura ZNÍ. Kontrola měna ⇒ účet je v vr_hold_account_mismatch().
  invoice_account  text check (invoice_account in ('VR_CZK','VR_EUR','SINTERA','JINY')),

  -- platba
  paid_at          timestamptz,
  paid_amount      numeric(12,2),
  paid_account     text check (paid_account in ('VR_CZK','VR_EUR','SINTERA','JINY')),

  note             text,
  booking_id       uuid,          -- volitelná vazba na vr_bookings (host, token, zprávy)
  request_id       uuid,          -- volitelná vazba na vr_requests (poptávka z webu)

  constraint vr_holds_dates_chk  check (departure > arrival),
  -- hold bez data, do kdy drží, by držel termín věčně — přesně to, co nechceme.
  constraint vr_holds_until_chk  check (status <> 'hold' or hold_until is not null)
);

comment on table public.vr_holds is
  'Předrezervace z vystavené zálohové faktury + potvrzené přímé rezervace. '
  'Publikuje se anonymizovaně přes vr_public_holds() do villa-booking-calendar.';

-- Publikační dotaz se ptá na „co drží termín od dneška dál".
create index if not exists vr_holds_live_idx
  on public.vr_holds (departure)
  where status in ('hold','confirmed');
create index if not exists vr_holds_status_idx on public.vr_holds (status);

alter table public.vr_holds enable row level security;
revoke all on public.vr_holds from anon, authenticated;
-- (žádná policy → anon/authenticated nevidí nic; service_role obchází RLS)


-- ---------- 2) uidh předrezervace ----------
-- Kalendář, /sprava/ i ceny v owner.html se všude spojují přes `uidh`. Hold ve feedu
-- není a nikdy nebude, takže si svůj klíč musí odvodit sám — deterministicky z id,
-- ať přežije hold → rezervace i každý další běh Actionu.
--
-- Prefix 'vr-hold:' odděluje jmenný prostor od iCal UID: sha256 nad jiným vstupem
-- nemůže dát stejných 16 znaků jako hash rezervace z platformy. Formát (16 hex
-- znaků, lowercase) je shodný s uid_hash() v update_history.py i uidHash() v JS,
-- takže se to všude merguje beze změny kódu.
create or replace function public.vr_hold_uidh(p_id uuid)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select substr(encode(extensions.digest('vr-hold:' || p_id::text, 'sha256'), 'hex'), 1, 16);
$function$;


-- ---------- 3) kontrola měna ⇒ účet ----------
-- Pojistka proti tomu, co se hlídá ručně: zálohová faktura vystavená na hlavní účet
-- Sintery místo účtu Villa Rudolf. Vrací NULL, když je vše v pořádku, jinak důvod.
-- Používá to /sprava/ (červené hlášení ještě NEŽ fakturu odešleš) a později i n8n,
-- které si fakturu přečte z iDokladu a porovná s realitou.
create or replace function public.vr_hold_account_mismatch(p_currency text, p_account text)
returns text
language sql
immutable
as $function$
  select case
    when p_currency is null or p_account is null then null
    when p_account = 'SINTERA' then 'faktura zní na hlavní účet Sintery, ne na účet Villa Rudolf'
    when p_account = 'JINY'    then 'faktura zní na jiný než villový účet'
    when p_currency = 'CZK' and p_account <> 'VR_CZK' then 'faktura je v CZK, ale nezní na korunový účet Villa Rudolf'
    when p_currency = 'EUR' and p_account <> 'VR_EUR' then 'faktura je v EUR, ale nezní na eurový účet Villa Rudolf'
    else null
  end;
$function$;


-- ---------- 4) VEŘEJNÉ: co drží termín ----------
-- ⚠️ Výstup končí ve VEŘEJNÉM souboru data/history.json na GitHub Pages.
-- Vrací se proto jen anonymizovaný termín — žádné jméno, kontakt, částka ani číslo
-- faktury. Kdo sem bude přidávat pole, ať si napřed přečte tenhle odstavec.
--
--   kind='hold'   → drží se, ale zaplaceno není (kalendář kreslí „předběžně")
--   kind='direct' → potvrzená přímá rezervace (kreslí se jako běžný pobyt)
--
-- Propadlý hold (hold_until < dnes) se nevrací → termín se uvolní sám, bez cronu.
-- Dozadu se pouští 30 dní: proběhlé pobyty ještě chvíli drží archiv a statistiky.
create or replace function public.vr_public_holds()
returns json
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(json_agg(json_build_object(
           'uidh',      public.vr_hold_uidh(h.id),
           'start',     to_char(h.arrival,   'YYYY-MM-DD'),
           'end',       to_char(h.departure, 'YYYY-MM-DD'),
           'kind',      case when h.status = 'hold' then 'hold' else 'direct' end,
           'holdUntil', to_char(h.hold_until, 'YYYY-MM-DD')
         ) order by h.arrival), '[]'::json)
  from public.vr_holds h
  where h.status in ('hold','confirmed')
    and h.departure >= current_date - 30
    and (h.status <> 'hold' or h.hold_until >= current_date);
$function$;


-- ---------- 5) ADMIN: výpis předrezervací ----------
-- Vrací všechno včetně faktury a platby (majitel je správce údajů). `expired`
-- je dopočítané, ne uložené — viz „líné propadnutí" v hlavičce.
create or replace function public.vr_admin_list_holds(p_admin_key text)
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
      'id',               h.id,
      'uidh',             public.vr_hold_uidh(h.id),
      'created_at',       h.created_at,
      'arrival',          h.arrival,
      'departure',        h.departure,
      'status',           h.status,
      'hold_until',       h.hold_until,
      -- dopočítané: hold, kterému uplynulo hold_until, už termín nedrží
      'expired',          (h.status = 'hold' and h.hold_until < current_date),
      'channel',          h.channel,
      'guest_note',       h.guest_note,
      'invoice_no',       h.invoice_no,
      'invoice_amount',   h.invoice_amount,
      'invoice_currency', h.invoice_currency,
      'invoice_issued',   h.invoice_issued,
      'invoice_due',      h.invoice_due,
      'invoice_account',  h.invoice_account,
      'account_mismatch', public.vr_hold_account_mismatch(h.invoice_currency, h.invoice_account),
      'paid_at',          h.paid_at,
      'paid_amount',      h.paid_amount,
      'paid_account',     h.paid_account,
      'note',             h.note,
      'booking_id',       h.booking_id,
      'request_id',       h.request_id
    ) as row, h.arrival
    from public.vr_holds h
    where h.departure >= current_date - interval '18 months'
  ) s;

  return json_build_object('ok', true, 'holds', v_rows);
end
$function$;


-- ---------- 6) ADMIN: založení / úprava předrezervace ----------
-- p_id NULL => nová. Vrací i uidh, ať /sprava/ hned ví, pod jakým klíčem se pobyt
-- objeví v kalendáři.
create or replace function public.vr_admin_upsert_hold(
  p_admin_key       text,
  p_id              uuid,
  p_arrival         date,
  p_departure       date,
  p_status          text default 'hold',
  p_hold_until      date default null,
  p_channel         text default null,
  p_guest_note      text default null,
  p_invoice_no      text default null,
  p_invoice_amount  numeric default null,
  p_invoice_currency text default null,
  p_invoice_issued  date default null,
  p_invoice_due     date default null,
  p_invoice_account text default null,
  p_note            text default null,
  p_booking_id      uuid default null,
  p_request_id      uuid default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id     uuid := p_id;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'hold');
  v_until  date := p_hold_until;
  v_cur    text := nullif(btrim(coalesce(p_invoice_currency, '')), '');
  v_acc    text := nullif(btrim(coalesce(p_invoice_account,  '')), '');
begin
  perform public._vr_admin_auth(p_admin_key);

  if p_arrival is null or p_departure is null or p_departure <= p_arrival then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if v_status not in ('hold','confirmed','expired','cancelled') then
    return json_build_object('ok', false, 'error', 'status_invalid');
  end if;
  if v_cur is not null and v_cur not in ('CZK','EUR') then
    return json_build_object('ok', false, 'error', 'currency_invalid');
  end if;
  if v_acc is not null and v_acc not in ('VR_CZK','VR_EUR','SINTERA','JINY') then
    return json_build_object('ok', false, 'error', 'account_invalid');
  end if;

  -- Hold musí mít, do kdy drží. Když se datum nepošle, odvodí se ze splatnosti
  -- + 3 dny grace (převod přes víkend dorazí až v pondělí); bez splatnosti 14 dní.
  if v_status = 'hold' and v_until is null then
    v_until := coalesce(p_invoice_due + 3, current_date + 14);
  end if;
  if v_status <> 'hold' then
    v_until := null;
  end if;

  if v_id is null then
    insert into public.vr_holds(
      arrival, departure, status, hold_until, channel, guest_note,
      invoice_no, invoice_amount, invoice_currency, invoice_issued, invoice_due,
      invoice_account, note, booking_id, request_id)
    values (
      p_arrival, p_departure, v_status, v_until, nullif(btrim(coalesce(p_channel,'')),''),
      nullif(btrim(coalesce(p_guest_note,'')),''),
      nullif(btrim(coalesce(p_invoice_no,'')),''), p_invoice_amount, v_cur,
      p_invoice_issued, p_invoice_due, v_acc,
      nullif(btrim(coalesce(p_note,'')),''), p_booking_id, p_request_id)
    returning id into v_id;
  else
    update public.vr_holds set
      arrival          = p_arrival,
      departure        = p_departure,
      status           = v_status,
      hold_until       = v_until,
      channel          = nullif(btrim(coalesce(p_channel,'')),''),
      guest_note       = nullif(btrim(coalesce(p_guest_note,'')),''),
      invoice_no       = nullif(btrim(coalesce(p_invoice_no,'')),''),
      invoice_amount   = p_invoice_amount,
      invoice_currency = v_cur,
      invoice_issued   = p_invoice_issued,
      invoice_due      = p_invoice_due,
      invoice_account  = v_acc,
      note             = nullif(btrim(coalesce(p_note,'')),''),
      booking_id       = p_booking_id,
      request_id       = p_request_id,
      updated_at       = now()
    where id = v_id;
    if not found then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'uidh', public.vr_hold_uidh(v_id),
    'hold_until', v_until,
    'account_mismatch', public.vr_hold_account_mismatch(v_cur, v_acc));
end
$function$;


-- ---------- 7) ADMIN: přepnutí stavu ----------
-- Jedno místo pro „uhrazeno → potvrdit", „prodloužit", „propadlo", „zrušit".
-- Potvrzení smí nést i skutečnou platbu (částka, účet, datum) — mimo jiné proto,
-- aby se dalo zaznamenat, že peníze dorazily na CIZÍ účet a je potřeba přeúčtovat.
create or replace function public.vr_admin_set_hold_status(
  p_admin_key   text,
  p_id          uuid,
  p_status      text,
  p_hold_until  date    default null,
  p_paid_amount numeric default null,
  p_paid_account text   default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_acc text := nullif(btrim(coalesce(p_paid_account, '')), '');
  v_row public.vr_holds;
begin
  perform public._vr_admin_auth(p_admin_key);

  if p_status not in ('hold','confirmed','expired','cancelled') then
    return json_build_object('ok', false, 'error', 'status_invalid');
  end if;
  if v_acc is not null and v_acc not in ('VR_CZK','VR_EUR','SINTERA','JINY') then
    return json_build_object('ok', false, 'error', 'account_invalid');
  end if;

  select * into v_row from public.vr_holds where id = p_id;
  if v_row.id is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Prodloužení bez data = ještě 14 dní od dneška.
  update public.vr_holds set
    status      = p_status,
    hold_until  = case when p_status = 'hold'
                       then coalesce(p_hold_until, current_date + 14)
                       else null end,
    paid_at     = case when p_status = 'confirmed' then coalesce(paid_at, now()) else paid_at end,
    paid_amount = coalesce(p_paid_amount, paid_amount),
    paid_account= coalesce(v_acc, paid_account),
    updated_at  = now()
  where id = p_id;

  return json_build_object('ok', true, 'id', p_id);
end
$function$;


-- ---------- 8) ADMIN: smazání ----------
-- Pro překlep při zakládání. Propadlá předrezervace se NEMAŽE — `status='expired'`
-- termín uvolní a doklad o vystavené faktuře zůstane.
create or replace function public.vr_admin_delete_hold(p_admin_key text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  delete from public.vr_holds where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  return json_build_object('ok', true);
end
$function$;


-- ---------- 9) GRANTY ----------
-- anon smí admin funkce volat, ale bez správného klíče z nich nic nedostane.
grant execute on function public.vr_hold_uidh(uuid) to anon, authenticated, service_role;
grant execute on function public.vr_hold_account_mismatch(text, text) to anon, authenticated, service_role;
-- vr_public_holds je ZÁMĚRNĚ veřejná: čte ji GitHub Action kalendáře (bez klíče)
-- a vrací jen anonymizované termíny — stejná úroveň citlivosti jako history.json.
grant execute on function public.vr_public_holds() to anon, authenticated, service_role;
grant execute on function public.vr_admin_list_holds(text) to anon, authenticated;
grant execute on function public.vr_admin_upsert_hold(text, uuid, date, date, text, date, text, text, text, numeric, text, date, date, text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.vr_admin_set_hold_status(text, uuid, text, date, numeric, text) to anon, authenticated;
grant execute on function public.vr_admin_delete_hold(text, uuid) to anon, authenticated;
