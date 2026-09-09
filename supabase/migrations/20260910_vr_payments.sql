-- Villa Rudolf — PÁROVÁNÍ PLATEB k předrezervacím (etapa 2)
-- ============================================================================
-- Navazuje na 20260909_vr_holds.sql. Předrezervaci dnes potvrzuje majitel ručně
-- kliknutím na „Uhrazeno". Tahle migrace k tomu přidává druhou cestu: bankovní
-- pohyby natažené z Fia (n8n, workflow VrPaymentWatch) se ukládají sem a samy se
-- zkusí spárovat s vystavenou zálohovou fakturou.
--
-- PROČ SE ČTOU VŠECHNY TŘI ÚČTY (VR korunový, VR eurový, hlavní účet Sintery)
-- Faktura se dá omylem vystavit na hlavní účet Sintery. Kdyby se sledovaly jen
-- villové účty, taková platba by se „ztratila": předrezervace by propadla, přestože
-- host zaplatil. Proto se čte i Sintera a platba se spáruje podle variabilního
-- symbolu bez ohledu na to, kam dorazila — a `paid_mismatch` (viz vr_holds) pak
-- řekne, že je potřeba přeúčtovat. Host svoje udělal; účetnictví se srovná zvlášť.
--
-- ŽEBŘÍČEK JISTOTY — automaticky se potvrzuje JEN nejvyšší stupeň
--   1. číslo faktury sedí (z VS, nebo z textu platby u SEPA, kde VS zaniká)
--      A  měna sedí  A  částka sedí                            → potvrdí se samo *
--   2. VS sedí, částka ne (záloha/doplatek/přeplatek)          → návrh k odklepnutí
--   3. bez VS: přesná částka + měna, v okně od vystavení do
--      konce platnosti +5 dní, a je jen JEDEN kandidát         → návrh k odklepnutí
--   4. cokoli jiného                                           → nepřiřazená platba
--
--   * a i ten jen když `p_autoconfirm` = true. První ostré běhy mají zůstat
--     read-only: pravidla jsou navržená proti dokumentaci Fia, ne proti skutečnému
--     výpisu tohohle účtu, takže první dávku je potřeba přečíst v /sprava/ a teprve
--     pak zapisování povolit. Stejný postup jako u čtyř feedů v kalendáři.
--
-- Nepřiřazená platba NENÍ chyba k zahození — je to přesně ten případ, kterým celý
-- modul začal: peníze v bance viděné, ale nikomu nedošlo, že jimi vznikla rezervace.
-- Proto mají nepřiřazené platby vlastní sekci v /sprava/.
--
-- BEZPEČNOST
--   * vr_payments: RLS ON, žádná policy → anon/authenticated nevidí nic.
--   * vr_ingest_payments: grant JEN service_role (n8n). ŽÁDNÉ heslo v parametru —
--     vr_purge_expired ukázalo, kam to vede (heslo natvrdo ve veřejném repu +
--     grant anon; zavírá to až 20260908_vr_purge_lockdown.sql). Tady se ta chyba
--     nedělá znovu: autorizace je čistě přes grant, žádné sdílené heslo neexistuje.
--   * admin RPC: _vr_admin_auth jako všude jinde.
--   * Bankovní pohyby obsahují jméno a číslo účtu plátce → PII. Ven se
--     nepublikuje nic; vr_public_holds() se téhle tabulky vůbec netýká.

-- ---------- 1) TABULKA ----------
create table if not exists public.vr_payments (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  source         text not null default 'fio',      -- odkud pohyb přišel
  account        text not null check (account in ('VR_CZK','VR_EUR','SINTERA','JINY')),
  tx_id          text not null,                    -- ID pohybu v bance (Fio: column22)
  booked_on      date not null,                    -- datum pohybu
  amount         numeric(12,2) not null,
  currency       text not null check (currency in ('CZK','EUR')),

  vs             text,                             -- variabilní symbol
  ks             text,
  ss             text,
  counterparty   text,                             -- jméno / účet plátce (PII)
  message        text,                             -- zpráva pro příjemce

  matched_hold   uuid references public.vr_holds(id) on delete set null,
  matched_at     timestamptz,
  -- vs_exact / ref_exact = číslo faktury sedí (z variabilního symbolu, resp. z textu
  -- platby u eurových SEPA plateb, kde VS po cestě zanikne) A sedí i částka s měnou
  matched_how    text check (matched_how in ('vs_exact','ref_exact','vs_amount_differs','amount_window','ruka')),
  confirmed      boolean not null default false,   -- potvrdila tahle platba rezervaci?
  ignored_at     timestamptz,                      -- „tohle sem nepatří" (nájem, vratka…)
  note           text,

  -- Tentýž pohyb se při dalším běhu načte znovu (okno je klouzavé) — nesmí se
  -- zpracovat dvakrát.
  unique (source, account, tx_id)
);

comment on table public.vr_payments is
  'Bankovní pohyby z Fia párované na vr_holds. PII (jméno plátce) — nikdy se nepublikuje.';

create index if not exists vr_payments_open_idx on public.vr_payments (booked_on desc)
  where matched_hold is null and ignored_at is null;
create index if not exists vr_payments_hold_idx on public.vr_payments (matched_hold);

alter table public.vr_payments enable row level security;
revoke all on public.vr_payments from anon, authenticated;


-- ---------- 2) POMOCNÉ: číslo faktury → tvar, který snese variabilní symbol ----------
-- Faktura „2026-0142" se do VS pošle jako „20260142". Porovnává se tedy jen na
-- číslicích; navíc se povolí shoda „zprava" (host občas utne vedoucí nuly nebo
-- pošle jen pořadové číslo).
create or replace function public._vr_vs_matches(p_vs text, p_invoice_no text)
returns boolean
language sql
immutable
as $function$
  select case
    when p_vs is null or p_invoice_no is null then false
    else (
      with a as (select regexp_replace(p_vs, '\D', '', 'g') as v),
           b as (select regexp_replace(p_invoice_no, '\D', '', 'g') as v)
      select a.v <> '' and b.v <> ''
         and (a.v = b.v
              or (length(a.v) < length(b.v) and right(b.v, length(a.v)) = a.v and length(a.v) >= 4)
              or (length(b.v) < length(a.v) and right(a.v, length(b.v)) = b.v and length(b.v) >= 4))
      from a, b
    )
  end;
$function$;

-- Číslo faktury se dá poslat i v textu platby (typicky u eurových SEPA plateb,
-- kde variabilní symbol po cestě zanikne).
create or replace function public._vr_ref_mentions(p_text text, p_invoice_no text)
returns boolean
language sql
immutable
as $function$
  select case
    when p_text is null or p_invoice_no is null then false
    else position(regexp_replace(p_invoice_no, '\s', '', 'g')
                  in regexp_replace(coalesce(p_text,''), '\s', '', 'g')) > 0
         and length(regexp_replace(p_invoice_no, '\s', '', 'g')) >= 4
  end;
$function$;


-- ---------- 3) PŘÍJEM POHYBŮ Z BANKY (jen service_role = n8n) ----------
-- p_rows = pole objektů:
--   {account, tx_id, booked_on, amount, currency, vs, ks, ss, counterparty, message}
-- Vrací zprávu o tom, co se stalo — n8n ji pošle majiteli e-mailem, aby první ostré
-- běhy šlo přečíst a případně doladit pravidla, než se povolí zapisování.
create or replace function public.vr_ingest_payments(
  p_rows        jsonb,
  p_autoconfirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r            jsonb;
  v_id         uuid;
  v_amount     numeric(12,2);
  v_currency   text;
  v_vs         text;
  v_msg        text;
  v_hold       public.vr_holds;
  v_how        text;
  v_cand       int;
  v_new        int := 0;
  v_auto       int := 0;
  v_proposed   int := 0;
  v_unmatched  int := 0;
  v_log        jsonb := '[]'::jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'rows_invalid');
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    -- Odchozí platby a nuly nás nezajímají — párují se jen příchozí peníze.
    v_amount := (r->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 then continue; end if;
    v_currency := upper(coalesce(r->>'currency', ''));
    if v_currency not in ('CZK','EUR') then continue; end if;

    insert into public.vr_payments(source, account, tx_id, booked_on, amount, currency,
                                   vs, ks, ss, counterparty, message)
    values (coalesce(r->>'source','fio'), coalesce(r->>'account','JINY'), r->>'tx_id',
            (r->>'booked_on')::date, v_amount, v_currency,
            nullif(btrim(coalesce(r->>'vs','')),''), nullif(btrim(coalesce(r->>'ks','')),''),
            nullif(btrim(coalesce(r->>'ss','')),''), nullif(btrim(coalesce(r->>'counterparty','')),''),
            nullif(btrim(coalesce(r->>'message','')),''))
    on conflict (source, account, tx_id) do nothing
    returning id into v_id;

    -- Už jsme ho jednou zpracovali (klouzavé okno vrací tytéž pohyby znovu).
    if v_id is null then continue; end if;
    v_new := v_new + 1;
    v_vs  := nullif(btrim(coalesce(r->>'vs','')),'');
    v_msg := coalesce(r->>'message','') || ' ' || coalesce(r->>'counterparty','');
    v_hold := null; v_how := null;

    -- ŽEBŘÍČEK 1 + 2: podle variabilního symbolu, nebo podle čísla faktury v textu
    -- platby (eurové SEPA platby VS po cestě obvykle ztratí).
    select h.* into v_hold
    from public.vr_holds h
    where h.status in ('hold','confirmed')
      and h.invoice_no is not null
      and (public._vr_vs_matches(v_vs, h.invoice_no) or public._vr_ref_mentions(v_msg, h.invoice_no))
    order by (h.status = 'hold') desc, h.arrival
    limit 1;

    if v_hold.id is not null then
      v_how := case
        when v_hold.invoice_amount is null
          or v_hold.invoice_currency <> v_currency
          or v_hold.invoice_amount <> v_amount then 'vs_amount_differs'
        -- rozlišuje se, ODKUD se číslo faktury vzalo: v logu má být poznat, jestli
        -- platba dorazila s variabilním symbolem, nebo se dolovalo z textu
        when public._vr_vs_matches(v_vs, v_hold.invoice_no) then 'vs_exact'
        else 'ref_exact' end;
    else
      -- ŽEBŘÍČEK 3: bez VS — přesná částka a měna, v okně, a JEN JEDEN kandidát.
      -- Víc kandidátů = nepárovat: ceny se z ceníku opakují a spárovat platbu
      -- k cizí rezervaci je horší než nechat ji čekat na kliknutí.
      select count(*) into v_cand
      from public.vr_holds h
      where h.status = 'hold'
        and h.invoice_amount = v_amount
        and h.invoice_currency = v_currency
        and (r->>'booked_on')::date >= coalesce(h.invoice_issued, h.arrival - 400)
        and (r->>'booked_on')::date <= coalesce(h.hold_until, h.arrival) + 5;
      if v_cand = 1 then
        select h.* into v_hold
        from public.vr_holds h
        where h.status = 'hold'
          and h.invoice_amount = v_amount
          and h.invoice_currency = v_currency
          and (r->>'booked_on')::date >= coalesce(h.invoice_issued, h.arrival - 400)
          and (r->>'booked_on')::date <= coalesce(h.hold_until, h.arrival) + 5;
        v_how := 'amount_window';
      end if;
    end if;

    if v_hold.id is null then
      v_unmatched := v_unmatched + 1;
      v_log := v_log || jsonb_build_object('tx', r->>'tx_id', 'amount', v_amount,
                 'currency', v_currency, 'vs', v_vs, 'result', 'nepřiřazeno');
      continue;
    end if;

    update public.vr_payments
       set matched_hold = v_hold.id, matched_at = now(), matched_how = v_how
     where id = v_id;

    -- Samo se potvrzuje JEN nejvyšší stupeň jistoty, a jen když je to povolené.
    if v_how in ('vs_exact','ref_exact') and v_hold.status = 'hold' and p_autoconfirm then
      update public.vr_holds
         set status = 'confirmed', hold_until = null,
             paid_at = coalesce(paid_at, now()),
             paid_amount = coalesce(paid_amount, v_amount),
             paid_account = coalesce(paid_account, coalesce(r->>'account','JINY')),
             updated_at = now()
       where id = v_hold.id;
      update public.vr_payments set confirmed = true where id = v_id;
      v_auto := v_auto + 1;
      v_log := v_log || jsonb_build_object('tx', r->>'tx_id', 'amount', v_amount,
                 'currency', v_currency, 'vs', v_vs, 'hold', v_hold.id,
                 'result', 'POTVRZENO — z předrezervace je rezervace');
    else
      v_proposed := v_proposed + 1;
      v_log := v_log || jsonb_build_object('tx', r->>'tx_id', 'amount', v_amount,
                 'currency', v_currency, 'vs', v_vs, 'hold', v_hold.id,
                 'result', 'návrh k odklepnutí (' || v_how || ')');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'new', v_new, 'autoconfirmed', v_auto,
                            'proposed', v_proposed, 'unmatched', v_unmatched,
                            'autoconfirm_enabled', p_autoconfirm, 'detail', v_log);
end
$function$;


-- ---------- 4) ADMIN: platby k vyřízení ----------
-- Vrací nepřiřazené a navržené (tedy vše, co čeká na člověka) plus platby
-- posledních 90 dní, ať je vidět souvislost.
create or replace function public.vr_admin_list_payments(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by booked_on desc), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id', p.id, 'account', p.account, 'booked_on', p.booked_on,
      'amount', p.amount, 'currency', p.currency, 'vs', p.vs,
      'counterparty', p.counterparty, 'message', p.message,
      'matched_hold', p.matched_hold, 'matched_how', p.matched_how,
      'confirmed', p.confirmed, 'ignored_at', p.ignored_at,
      -- termín navržené předrezervace, ať se to dá odklepnout bez proklikávání
      'hold_arrival',  h.arrival, 'hold_departure', h.departure,
      'hold_status',   h.status,  'hold_invoice_no', h.invoice_no
    ) as row, p.booked_on
    from public.vr_payments p
    left join public.vr_holds h on h.id = p.matched_hold
    where p.booked_on >= current_date - 90
       or (p.matched_hold is null and p.ignored_at is null)
  ) s;

  return json_build_object('ok', true, 'payments', v_rows);
end
$function$;


-- ---------- 5) ADMIN: přiřadit platbu ručně / potvrdit návrh ----------
create or replace function public.vr_admin_assign_payment(
  p_admin_key text,
  p_id        uuid,
  p_hold_id   uuid,
  p_confirm   boolean default true
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_pay public.vr_payments; v_hold public.vr_holds;
begin
  perform public._vr_admin_auth(p_admin_key);

  select * into v_pay from public.vr_payments where id = p_id;
  if v_pay.id is null then return json_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_hold from public.vr_holds where id = p_hold_id;
  if v_hold.id is null then return json_build_object('ok', false, 'error', 'hold_not_found'); end if;

  update public.vr_payments
     set matched_hold = p_hold_id, matched_at = now(),
         matched_how = coalesce(matched_how, 'ruka'),
         confirmed = p_confirm, ignored_at = null
   where id = p_id;

  if p_confirm then
    update public.vr_holds
       set status = 'confirmed', hold_until = null,
           paid_at = coalesce(paid_at, now()),
           paid_amount = coalesce(paid_amount, v_pay.amount),
           paid_account = coalesce(paid_account, v_pay.account),
           updated_at = now()
     where id = p_hold_id;
  end if;

  return json_build_object('ok', true);
end
$function$;


-- ---------- 6) ADMIN: platba sem nepatří ----------
-- Nemaže se — doklad, že peníze přišly, má cenu i když s vilou nesouvisí.
create or replace function public.vr_admin_ignore_payment(p_admin_key text, p_id uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  update public.vr_payments
     set ignored_at = now(), note = coalesce(nullif(btrim(coalesce(p_note,'')),''), note)
   where id = p_id;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  return json_build_object('ok', true);
end
$function$;


-- ---------- 7) GRANTY ----------
-- vr_ingest_payments píše do peněz — dostane ji JEN service_role (n8n).
-- Žádné heslo v parametru: viz vr_purge_expired v STAV.md, jak to dopadá.
revoke all on function public.vr_ingest_payments(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.vr_ingest_payments(jsonb, boolean) to service_role;
grant execute on function public._vr_vs_matches(text, text) to service_role;
grant execute on function public._vr_ref_mentions(text, text) to service_role;
grant execute on function public.vr_admin_list_payments(text) to anon, authenticated;
grant execute on function public.vr_admin_assign_payment(text, uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.vr_admin_ignore_payment(text, uuid, text) to anon, authenticated;
