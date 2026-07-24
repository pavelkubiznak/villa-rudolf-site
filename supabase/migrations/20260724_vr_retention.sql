-- Villa Rudolf — Systém C: RETENCE evidence ubytovaných (zákonná povinnost)
-- ========================================================================
-- Ubytovatel má zákonnou EVIDENČNÍ povinnost a musí údaje o ubytovaných osobách
-- uchovávat 6 let:
--   * cizinci: domovní kniha dle § 101 zák. č. 326/1999 Sb., o pobytu cizinců
--     (uchování 6 let od posledního zápisu),
--   * poplatek z pobytu: evidenční kniha dle § 3g zák. č. 565/1990 Sb.,
--     o místních poplatcích (uchování 6 let).
--
-- NEBEZPEČÍ (před opravou): vr_persons má na vr_bookings FK ON DELETE CASCADE.
-- Původní vr_purge_expired mazala VŠECHNY bookingy s odjezdem starším 30 dní:
--     delete from vr_bookings where departure < now() - interval '30 days';
-- To by přes CASCADE smazalo i vr_persons = ZTRÁTA zákonné evidence dřív než
-- po 6 letech = porušení evidenční povinnosti.
--
-- OPRAVA (tato migrace): purge NEMAŽE bookingy, které mají evidované osoby.
--   1) 30+ dní po odjezdu + MÁ osoby  → ANONYMIZUJE (GDPR minimalizace kontaktu):
--      vynuluje phone/email/door_code a znehodnotí token_hash (host-link už dávno
--      vypršel: expires_at = departure + 14 dní). PONECHÁ jméno + termíny + osoby
--      (vr_persons) jako zákonnou evidenci.
--   2) 30+ dní po odjezdu + BEZ osob (nevyužité odkazy / testy) → smaže (žádná
--      evidence, nic zákonného se neztrácí).
--   3) 6+ let po odjezdu → smaže úplně (retenční lhůta vypršela; CASCADE zde
--      vr_persons smaže legitimně).
--
-- ALBA (vr_album_*) NEJSOU dotčena: vr_album_photos se váže přes textové album_id,
-- NEMÁ FK na vr_bookings, takže žádné mazání bookingu se do alba nepropíše.

-- Idempotence: jednou zanonymizovaný booking se už podruhé nezpracovává.
alter table public.vr_bookings add column if not exists anonymized_at timestamptz;

create or replace function public.vr_purge_expired(p_secret text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anon      int := 0;   -- kolik bookingů anonymizováno (evidence ponechána)
  v_del_empty int := 0;   -- kolik bookingů bez osob smazáno (úklid)
  v_del_old   int := 0;   -- kolik bookingů starších 6 let smazáno (retence vypršela)
begin
  if p_secret is distinct from 'vringest_95a92405efdb5215ce4981fef98eb57b5ae11748' then
    raise exception 'unauthorized';
  end if;

  -- Pořadí je zvolené tak, aby se každý booking zpracoval právě jednou (nejdřív
  -- se odberou ty, které mají odejít úplně, teprve pak se zbytek anonymizuje).

  -- 1) RETENČNÍ LHŮTA VYPRŠELA (6 let po odjezdu) → smazat úplně
  --    (CASCADE zde vr_persons smaže legitimně — evidenční povinnost skončila).
  delete from public.vr_bookings b
  where b.departure < (now() - interval '6 years');
  get diagnostics v_del_old = row_count;

  -- 2) ÚKLID bookingů 30+ dní po odjezdu BEZ evidovaných osob (nevyužité odkazy / testy).
  delete from public.vr_bookings b
  where b.departure < (now() - interval '30 days')
    and not exists (select 1 from public.vr_persons p where p.booking_id = b.id);
  get diagnostics v_del_empty = row_count;

  -- 3) ANONYMIZACE kontaktu u zbývajících bookingů 30+ dní po odjezdu, které mají
  --    evidované osoby (evidenci ZACHOVÁME). token_hash je NOT NULL → nelze null;
  --    nahradíme náhodným neplatným hashem, čímž se starý host-link znehodnotí.
  update public.vr_bookings b set
    phone         = null,
    email         = null,
    door_code     = null,
    token_hash    = encode(extensions.gen_random_bytes(24), 'hex'),
    anonymized_at = now()
  where b.departure < (now() - interval '30 days')
    and b.anonymized_at is null
    and exists (select 1 from public.vr_persons p where p.booking_id = b.id);
  get diagnostics v_anon = row_count;

  return v_del_old + v_del_empty + v_anon;
end
$function$;

-- Granty zachovány dle původního stavu (voláno s p_secret přes PostgREST / service).
grant execute on function public.vr_purge_expired(text) to anon, authenticated, service_role;
