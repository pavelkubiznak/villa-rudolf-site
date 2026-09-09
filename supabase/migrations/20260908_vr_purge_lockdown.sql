-- Villa Rudolf — vr_purge_expired: zavřít díru „spustí to kdokoli"
-- ============================================================================
-- Stav před touto migrací (20260724_vr_retention.sql):
--   * heslo p_secret bylo napsané natvrdo v těle funkce — repo je veřejné,
--   * grant execute … to anon, authenticated — s veřejným anon klíčem a heslem
--     z repa šla mazací funkce zavolat přes PostgREST odkudkoli.
-- Nic, co by nezmizelo samo časem, se tím smazat nedalo, ale destruktivní funkci
-- na produkční DB nemá držet v ruce cizí člověk (STAV.md, „Doporučené pořadí" 1).
--
-- Oprava (jen autorizace, tělo purge se NEMĚNÍ — kroky 1–3, retence 6 let,
-- anonymizace jsou zkopírované z 20260724_vr_retention.sql):
--   1) heslo ven z repa: ověřuje se proti sha256 uloženému v vr_admin_config
--      pod klíčem `purge_secret_sha256` (stejný model jako admin_key_sha256;
--      vr_admin_get_config/set_config pouští jen `ubyport_*`, takže se klíč
--      přes admin RPC nedá ani přečíst, ani přepsat). Dokud klíč v configu
--      není, funkce odmítne úplně.
--   2) revoke execute from public, anon, authenticated — volat smí jen
--      service_role (pg_cron / n8n se service klíčem). I kdyby heslo uniklo
--      znovu, bez service klíče se funkce nespustí.
--   3) staré heslo je veřejné (git historie) → po aplikaci ROTOVAT.
--
-- POSTUP NASAZENÍ (ručně, majitel; migrace sama o sobě nic nemaže):
--   a) vymyslet nový secret (>= 32 náhodných znaků), nikam do repa,
--   b) v SQL editoru Supabase:
--        insert into public.vr_admin_config(k, v)
--        values ('purge_secret_sha256',
--                encode(extensions.digest('<NOVÝ SECRET>', 'sha256'), 'hex'))
--        on conflict (k) do update set v = excluded.v;
--   c) aplikovat tuhle migraci,
--   d) v tom, co purge volá (pg_cron / n8n / ruční volání), přepnout na
--      service_role klíč + nový secret — anon klíč už neprojde,
--   e) v STAV.md přepnout řádek „vr_purge_expired" na ✅.

create or replace function public.vr_purge_expired(p_secret text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stored    text;
  v_anon      int := 0;   -- kolik bookingů anonymizováno (evidence ponechána)
  v_del_empty int := 0;   -- kolik bookingů bez osob smazáno (úklid)
  v_del_old   int := 0;   -- kolik bookingů starších 6 let smazáno (retence vypršela)
begin
  -- Autorizace: hash secretu v configu, nikdy literál v kódu.
  select v into v_stored from public.vr_admin_config where k = 'purge_secret_sha256';
  if v_stored is null
     or p_secret is null
     or char_length(p_secret) < 16
     or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_stored then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- Pořadí je zvolené tak, aby se každý booking zpracoval právě jednou (nejdřív
  -- se odberou ty, které mají odejít úplně, teprve pak se zbytek anonymizuje).

  -- 1) RETENČNÍ LHŮTA VYPRŠELA (6 let po odjezdu) → smazat úplně
  --    (CASCADE zde vr_persons smaže legitimně — evidenční povinnost skončila).
  delete from public.vr_bookings b
  where b.departure < (now() - interval '6 years');
  get diagnostics v_del_old = row_count;

  -- 2) ÚKLID bookingů 30+ dní po odjezdu BEZ evidovaných osob (nevyužité odkazy / testy).
  --    POZOR: tohle tiše maže proběhlé pobyty bez evidence osob — viz STAV.md,
  --    „Retence pobytů". Záměrně nezměněno, dokud se nerozhodne o evidenci.
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

-- Jen service_role. `public` explicitně — funkce mají execute pro PUBLIC
-- implicitně, samotné revoke z anon/authenticated by nestačilo.
revoke execute on function public.vr_purge_expired(text) from public, anon, authenticated;
grant execute on function public.vr_purge_expired(text) to service_role;
