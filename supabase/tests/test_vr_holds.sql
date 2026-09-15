\set K '''test-admin-key-1234567890'''
\pset pager off
\echo '--- 1) bez klíče se nedá nic ---'
do $$ begin
  begin perform public.vr_admin_list_holds('spatny-klic-aaaaaaaaaa');
        raise notice 'FAIL: prošel špatný klíč';
  exception when others then raise notice 'ok: špatný klíč odmítnut (%)', sqlerrm; end;
end $$;

\echo '--- 2) hold_until se dopočítá ze splatnosti +3 ---'
select (public.vr_admin_upsert_hold(:K, null, current_date+200, current_date+207,
        'hold', null, 'E-chalupy', 'Novákovi', '2026-0142', 48000, 'CZK',
        current_date, current_date+7, 'VR_CZK', null, null, null))->>'hold_until' as hold_until,
       to_char(current_date+10,'YYYY-MM-DD') as ocekavano;

\echo '--- 3) bez splatnosti = dnes +14 ---'
select (public.vr_admin_upsert_hold(:K, null, current_date+300, current_date+307,
        'hold', null, null, null, null, null, 'CZK', null, null, 'VR_CZK', null, null, null))->>'hold_until' as hold_until,
       to_char(current_date+14,'YYYY-MM-DD') as ocekavano;

\echo '--- 4) uidh je 16 lowercase hex a je deterministické ---'
select id, public.vr_hold_uidh(id) as uidh,
       public.vr_hold_uidh(id) ~ '^[0-9a-f]{16}$' as tvar_ok
from public.vr_holds order by arrival limit 2;

\echo '--- 5) veřejný výstup: JEN termín, žádná faktura ani jméno ---'
select json_agg(x) from json_array_elements(public.vr_public_holds()) x;

\echo '--- 6) propadlý hold se ven nepublikuje (a uvolní termín) ---'
update public.vr_holds set hold_until = current_date - 1 where arrival = current_date+300;
select count(*) as venku_po_propadnuti from json_array_elements(public.vr_public_holds()) x
where (x->>'start') = to_char(current_date+300,'YYYY-MM-DD');

\echo '--- 7) potvrzení: kind=direct, holdUntil zmizí, paid_* se zapíše ---'
select public.vr_admin_set_hold_status(:K, (select id from public.vr_holds where arrival=current_date+200),
       'confirmed', null, 48000, 'SINTERA');
select x->>'kind' as kind, x->>'holdUntil' as hold_until
from json_array_elements(public.vr_public_holds()) x
where (x->>'start') = to_char(current_date+200,'YYYY-MM-DD');
select status, hold_until, paid_amount, paid_account, paid_at is not null as ma_datum
from public.vr_holds where arrival = current_date+200;

\echo '--- 8) pojistka měna ⇒ účet ---'
select c as mena, a as ucet, coalesce(public.vr_hold_account_mismatch(c,a),'(v pořádku)') as vysledek
from (values ('CZK','VR_CZK'),('CZK','VR_EUR'),('CZK','SINTERA'),
             ('EUR','VR_EUR'),('EUR','VR_CZK'),('EUR','JINY')) v(c,a);

\echo '--- 9) validace vstupů ---'
select 'obracene datum'  as pripad, public.vr_admin_upsert_hold(:K,null,current_date+10,current_date+3,'hold',null,null,null,null,null,'CZK',null,null,'VR_CZK',null,null,null)->>'error' as chyba
union all select 'neznama mena', public.vr_admin_upsert_hold(:K,null,current_date+10,current_date+12,'hold',null,null,null,null,null,'USD',null,null,'VR_CZK',null,null,null)->>'error'
union all select 'neznamy ucet', public.vr_admin_upsert_hold(:K,null,current_date+10,current_date+12,'hold',null,null,null,null,null,'CZK',null,null,'NEEXISTUJE',null,null,null)->>'error'
union all select 'neznamy stav', public.vr_admin_upsert_hold(:K,null,current_date+10,current_date+12,'divny',null,null,null,null,null,'CZK',null,null,'VR_CZK',null,null,null)->>'error';

\echo '--- 10) hold bez hold_until neprojde ani přímým insertem ---'
do $$ begin
  begin insert into public.vr_holds(arrival,departure,status) values (current_date+1,current_date+2,'hold');
        raise notice 'FAIL: prošel hold bez hold_until';
  exception when check_violation then raise notice 'ok: constraint drží'; end;
end $$;

\echo '--- 11) admin výpis: dopočítané expired a account_mismatch ---'
select x->>'arrival' as prijezd, x->>'status' as stav, x->>'expired' as propadla,
       coalesce(x->>'account_mismatch','—') as ucet_hlaska
from json_array_elements((public.vr_admin_list_holds(:K))->'holds') x order by 1;

\echo '--- 12) anon nesmí do tabulky přímo ---'
set role anon;
do $$ begin
  begin perform * from public.vr_holds; raise notice 'FAIL: anon čte tabulku';
  exception when others then raise notice 'ok: anon na tabulku nedosáhne (%)', sqlerrm; end;
end $$;
select count(*) as anon_vidi_verejne from json_array_elements(public.vr_public_holds()) x;
reset role;
